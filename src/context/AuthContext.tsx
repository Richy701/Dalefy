import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { User } from "@/types";
import { isSupabaseConfigured } from "@/services/supabase";
import {
  signUp as authSignUp,
  signIn as authSignIn,
  signOut as authSignOut,
  getSession,
  onAuthStateChange,
  fetchProfile,
  updateProfile as authUpdateProfile,
} from "@/services/supabaseAuth";

// ── Demo user (for development / when Supabase not configured) ──────────────

const DEMO_USER: User = {
  id: "demo",
  name: "Richy Lamptey",
  email: "richmondlamptey75@gmail.com",
  role: "Trip Manager",
  avatar: "",
  initials: "RL",
  status: "Active",
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  demoLogin: async () => {},
  updateProfile: () => {},
  logout: () => {},
});

// ── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const useSupabase = isSupabaseConfigured();

  // ── Boot: restore session ───────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (useSupabase) {
        // Try Supabase session first
        const session = await getSession();
        if (session?.user && mounted) {
          const profile = await fetchProfile(session.user.id);
          if (profile && mounted) {
            setUser(profile);
            localStorage.setItem("daf-auth", JSON.stringify(profile));
          }
        } else if (mounted) {
          // Fall back to localStorage cache (covers demo mode)
          const saved = localStorage.getItem("daf-auth");
          if (saved) {
            try { setUser(JSON.parse(saved)); } catch { /* ignore */ }
          }
        }
      } else {
        // No Supabase — pure localStorage
        const saved = localStorage.getItem("daf-auth");
        if (saved) {
          try { setUser(JSON.parse(saved)); } catch { /* ignore */ }
        }
      }
      if (mounted) setIsLoading(false);
    }

    init();
    return () => { mounted = false; };
  }, [useSupabase]);

  // ── Listen for Supabase auth changes ────────────────────────────────────

  useEffect(() => {
    if (!useSupabase) return;

    const subscription = onAuthStateChange(async (event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        const session = await getSession();
        if (session?.user) {
          const profile = await fetchProfile(session.user.id);
          if (profile) {
            setUser(profile);
            localStorage.setItem("daf-auth", JSON.stringify(profile));
          }
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        localStorage.removeItem("daf-auth");
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [useSupabase]);

  // ── Sign up (onboarding) ────────────────────────────────────────────────

  const completeOnboarding = useCallback(async (data: OnboardingData): Promise<string | null> => {
    const name = data.name.trim();
    const email = (data.email ?? "").trim();
    const role = (data.role ?? "Trip Manager").trim();

    if (useSupabase && data.password) {
      const { user: newUser, error } = await authSignUp(email, data.password, name, role);
      if (error) return error;
      if (newUser) {
        setUser(newUser);
        localStorage.setItem("daf-auth", JSON.stringify(newUser));
      }
      return null;
    }

    // Fallback: localStorage-only (no Supabase or no password)
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
    localStorage.setItem("daf-auth", JSON.stringify(next));
    return null;
  }, [useSupabase]);

  // ── Sign in ─────────────────────────────────────────────────────────────

  const handleSignIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!useSupabase) return "Supabase not configured";

    const { user: signedInUser, error } = await authSignIn(email, password);
    if (error) return error;
    if (signedInUser) {
      setUser(signedInUser);
      localStorage.setItem("daf-auth", JSON.stringify(signedInUser));
    }
    return null;
  }, [useSupabase]);

  // ── Demo login ──────────────────────────────────────────────────────────

  const demoLogin = useCallback(async () => {
    await new Promise(r => setTimeout(r, 600));
    setUser(DEMO_USER);
    localStorage.setItem("daf-auth", JSON.stringify(DEMO_USER));
  }, []);

  // ── Update profile ──────────────────────────────────────────────────────

  const handleUpdateProfile = useCallback((patch: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (patch.name) next.initials = initialsFrom(patch.name);
      localStorage.setItem("daf-auth", JSON.stringify(next));

      // Sync to Supabase if it's a real user (not demo)
      if (useSupabase && prev.id !== "demo" && prev.id.length > 20) {
        authUpdateProfile(prev.id, patch).catch(() => {});
      }
      return next;
    });
  }, [useSupabase]);

  // ── Logout ──────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("daf-auth");
    if (useSupabase) {
      authSignOut().catch(() => {});
    }
  }, [useSupabase]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        completeOnboarding,
        signIn: handleSignIn,
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
