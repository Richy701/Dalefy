import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { User } from "@/types";
import { isFirebaseConfigured } from "@/services/firebase";
import { initialsFrom } from "@/lib/names";
import { STORAGE } from "@/config/storageKeys";
import { logger } from "@/lib/logger";

/** Wrapper around setUser that logs every state change */
function loggedSetUser(
  setter: React.Dispatch<React.SetStateAction<User | null>>,
  valueOrUpdater: User | null | ((prev: User | null) => User | null),
  reason: string,
) {
  if (typeof valueOrUpdater === "function") {
    setter(prev => {
      const next = valueOrUpdater(prev);
      logger.log("Auth", `setUser [${reason}]: ${prev?.id ?? "null"} → ${next?.id ?? "null"}`);
      return next;
    });
  } else {
    logger.log("Auth", `setUser [${reason}]: → ${valueOrUpdater?.id ?? "null"}`);
    setter(valueOrUpdater);
  }
}
import { SESSION_TIMEOUT_MS, PROFILE_TIMEOUT_MS } from "@/config/constants";
import {
  signUp as authSignUp,
  signIn as authSignIn,
  signInWithGoogle as authSignInWithGoogle,
  handleRedirectResult,
  signOut as authSignOut,
  getSession,
  onAuthStateChange,
  fetchProfile,
  updateProfile as authUpdateProfile,
} from "@/services/firebaseAuth";

// ── Demo user (for development / when Firebase not configured) ──────────────

const DEMO_USER: User = {
  id: "demo",
  name: "Alex Morgan",
  email: "alex@demo.dalefy.com",
  role: "Trip Manager",
  avatar: "",
  initials: "AM",
  status: "Active",
};

/** Clear all per-user data from localStorage so a new session starts clean. */
function clearUserData() {
  const dataKeys: (keyof typeof STORAGE)[] = [
    "TRIPS", "CUSTOM_TRAVELERS", "TRAVELERS_MIGRATED",
    "COMPLIANCE", "TEMPLATES", "GEOCODE_CACHE", "EVENT_IMAGE_CACHE",
  ];
  for (const k of dataKeys) localStorage.removeItem(STORAGE[k]);
}

// ── Context types ───────────────────────────────────────────────────────────

export interface OnboardingData {
  name: string;
  email?: string;
  password?: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  completeOnboarding: (data: OnboardingData) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<{ error: string | null; isNewUser: boolean }>;
  demoLogin: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  completeOnboarding: async () => null,
  signIn: async () => null,
  signInWithGoogle: async () => ({ error: null, isNewUser: false }),
  demoLogin: async () => {},
  updateProfile: () => {},
  logout: () => {},
});

// ── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  // Restore user from localStorage synchronously — prevents loading flash on refresh
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE.AUTH);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  // If we already have a cached user, skip the loading state entirely
  const [isLoading, setIsLoading] = useState(() => {
    const saved = localStorage.getItem(STORAGE.AUTH);
    return !saved; // only show loading when there's no cached user
  });
  const useFirebase = isFirebaseConfigured();

  // ── Boot: validate session with Firebase (background) ──────────────────

  useEffect(() => {
    if (!useFirebase) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    // Complete any pending Google redirect sign-in
    handleRedirectResult().then(({ user: redirectUser, error }) => {
      if (!mounted) return;
      if (error) logger.log("Auth", `redirect result error: ${error}`);
      if (redirectUser) {
        loggedSetUser(setUser, redirectUser, "google-redirect");
        localStorage.setItem(STORAGE.AUTH, JSON.stringify(redirectUser));
        setIsLoading(false);
      }
    }).catch(() => {});

    async function validate() {
      try {
        // Race against a timeout so a slow network never blocks the app
        const TIMED_OUT = Symbol("timeout");
        const sessionOrTimeout = await Promise.race([
          getSession(),
          new Promise<typeof TIMED_OUT>(r => setTimeout(() => r(TIMED_OUT), SESSION_TIMEOUT_MS)),
        ]);

        if (!mounted) return;

        // If timed out, keep cached user — don't log out on slow network
        if (sessionOrTimeout === TIMED_OUT) {
          logger.log("Auth", "session validation still running — using cached user");
          if (mounted) setIsLoading(false);
          // Continue validating in the background (no timeout)
          getSession().then(session => {
            if (!mounted) return;
            if (session?.user) {
              fetchProfile(session.user.uid).then(profile => {
                if (!mounted) return;
                const u = profile ?? {
                  id: session.user.uid,
                  name: session.user.displayName ?? session.user.email?.split("@")[0] ?? "User",
                  email: session.user.email ?? "",
                  role: "Trip Manager",
                  avatar: session.user.photoURL ?? "",
                  initials: (session.user.displayName ?? session.user.email ?? "U").slice(0, 2).toUpperCase(),
                  status: "Active" as const,
                };
                loggedSetUser(setUser, u, "validate-bg-profile");
                localStorage.setItem(STORAGE.AUTH, JSON.stringify(u));
              });
            }
          }).catch(() => {});
          return;
        }

        const sessionResult = sessionOrTimeout;

        if (sessionResult?.user) {
          const profile = await Promise.race([
            fetchProfile(sessionResult.user.uid),
            new Promise<null>(r => setTimeout(() => r(null), PROFILE_TIMEOUT_MS)),
          ]);
          if (!mounted) return;

          const u = profile ?? {
            id: sessionResult.user.uid,
            name: sessionResult.user.displayName ?? sessionResult.user.email?.split("@")[0] ?? "User",
            email: sessionResult.user.email ?? "",
            role: "Trip Manager",
            avatar: sessionResult.user.photoURL ?? "",
            initials: (sessionResult.user.displayName ?? sessionResult.user.email ?? "U").slice(0, 2).toUpperCase(),
            status: "Active" as const,
          };
          loggedSetUser(setUser, u, "validate-profile");
          localStorage.setItem(STORAGE.AUTH, JSON.stringify(u));
        } else {
          logger.log("Auth", "validate: no session returned — clearing user");
          loggedSetUser(setUser, prev => {
            if (prev && prev.id !== "demo" && (prev.id?.length ?? 0) > 20) {
              localStorage.removeItem(STORAGE.AUTH);
              return null;
            }
            return prev;
          }, "validate-no-session");
        }
      } catch {
        // Network error — keep cached user, don't block the app
      }
      if (mounted) setIsLoading(false);
    }

    validate();
    return () => { mounted = false; };
  }, [useFirebase]);

  // ── Listen for Firebase auth changes ────────────────────────────────────

  useEffect(() => {
    if (!useFirebase) return;

    const subscription = onAuthStateChange(async (event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        const session = await getSession();
        if (session?.user) {
          const profile = await fetchProfile(session.user.uid);
          const u = profile ?? {
            id: session.user.uid,
            name: session.user.displayName ?? session.user.email?.split("@")[0] ?? "User",
            email: session.user.email ?? "",
            role: "Trip Manager",
            avatar: session.user.photoURL ?? "",
            initials: (session.user.displayName ?? session.user.email ?? "U").slice(0, 2).toUpperCase(),
            status: "Active" as const,
          };
          loggedSetUser(setUser, u, "listener-SIGNED_IN");
          localStorage.setItem(STORAGE.AUTH, JSON.stringify(u));
        }
      } else if (event === "SIGNED_OUT") {
        loggedSetUser(setUser, null, "listener-SIGNED_OUT");
        localStorage.removeItem(STORAGE.AUTH);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [useFirebase]);

  // ── Sign up (onboarding) ────────────────────────────────────────────────

  const completeOnboarding = useCallback(async (data: OnboardingData): Promise<string | null> => {
    const name = data.name.trim();
    const email = (data.email ?? "").trim();
    const role = (data.role ?? "Trip Manager").trim();

    if (useFirebase && data.password) {
      // Clear stale localStorage so new account starts clean
      clearUserData();
      localStorage.removeItem(STORAGE.AUTH);

      const { user: newUser, error } = await authSignUp(email, data.password, name, role);
      if (error) return error;
      if (newUser) {
        setUser(newUser);
        localStorage.setItem(STORAGE.AUTH, JSON.stringify(newUser));
      }
      return null;
    }

    // Fallback: localStorage-only (no Firebase or no password)
    const next: User = {
      id: `user-${Date.now()}`,
      name,
      email,
      role,
      avatar: "",
      initials: initialsFrom(name),
      status: "Active",
    };
    setUser(next);
    localStorage.setItem(STORAGE.AUTH, JSON.stringify(next));
    return null;
  }, [useFirebase]);

  // ── Sign in ─────────────────────────────────────────────────────────────

  const handleSignIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!useFirebase) return "Firebase not configured";

    const { user: signedInUser, error } = await authSignIn(email, password);
    if (error) return error;
    if (signedInUser) {
      // Only clear data when switching to a different user (not re-logging in as same user)
      const prevAuth = localStorage.getItem(STORAGE.AUTH);
      const prevId = prevAuth ? JSON.parse(prevAuth)?.id : null;
      if (prevId && prevId !== signedInUser.id) {
        clearUserData();
      }
      loggedSetUser(setUser, signedInUser, "signIn");
      localStorage.setItem(STORAGE.AUTH, JSON.stringify(signedInUser));
    }
    return null;
  }, [useFirebase]);

  // ── Google sign in ──────────────────────────────────────────────────────

  const handleGoogleSignIn = useCallback(async (): Promise<{ error: string | null; isNewUser: boolean }> => {
    if (!useFirebase) return { error: "Firebase not configured", isNewUser: false };

    const { user: googleUser, error } = await authSignInWithGoogle();
    if (error) return { error, isNewUser: false };
    if (googleUser) {
      // Only clear data when switching to a different user
      const prevAuth = localStorage.getItem(STORAGE.AUTH);
      const prevId = prevAuth ? JSON.parse(prevAuth)?.id : null;
      if (prevId && prevId !== googleUser.id) {
        clearUserData();
      }
      loggedSetUser(setUser, googleUser, "googleSignIn");
      localStorage.setItem(STORAGE.AUTH, JSON.stringify(googleUser));
      // If the profile was just created, it's a new user
      const isNewUser = !!(googleUser as User & { _isNew?: boolean })._isNew;
      return { error: null, isNewUser };
    }
    return { error: null, isNewUser: false };
  }, [useFirebase]);

  // ── Demo login ──────────────────────────────────────────────────────────

  const demoLogin = useCallback(async () => {
    await new Promise(r => setTimeout(r, 600));
    setUser(DEMO_USER);
    localStorage.setItem(STORAGE.AUTH, JSON.stringify(DEMO_USER));
  }, []);

  // ── Update profile ──────────────────────────────────────────────────────

  const handleUpdateProfile = useCallback((patch: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (patch.name) next.initials = initialsFrom(patch.name);
      localStorage.setItem(STORAGE.AUTH, JSON.stringify(next));

      // Sync to Firebase if it's a real user (not demo)
      if (useFirebase && prev.id !== "demo" && prev.id.length > 20) {
        authUpdateProfile(prev.id, patch).catch(() => {});
      }
      return next;
    });
  }, [useFirebase]);

  // ── Logout ──────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE.AUTH);
    clearUserData();
    if (useFirebase) {
      authSignOut().catch(() => {});
    }
  }, [useFirebase]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        completeOnboarding,
        signIn: handleSignIn,
        signInWithGoogle: handleGoogleSignIn,
        demoLogin,
        updateProfile: handleUpdateProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
