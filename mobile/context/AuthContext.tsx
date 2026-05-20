import {
  createContext, useContext, useEffect, useMemo, useState, useCallback,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  onAuthStateChange,
  fetchProfile,
  signIn as authSignIn,
  signUp as authSignUp,
  signInWithGoogle as authGoogle,
  signInWithApple as authApple,
  sendMagicLink as authMagicLink,
  handleMagicLinkReturn as authMagicReturn,
  upgradeWithEmail as authUpgradeEmail,
  signOut as authSignOut,
  resetPassword as authResetPassword,
  type MobileUser,
} from "@/services/firebaseAuth";

const AUTH_CACHE_KEY = "daf-auth-mobile";

interface AuthContextType {
  user: MobileUser | null;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signInWithGoogle: (idToken: string) => Promise<string | null>;
  signInWithApple: (idToken: string, nonce: string) => Promise<string | null>;
  sendMagicLink: (email: string) => Promise<string | null>;
  handleMagicLinkReturn: (url: string) => Promise<string | null>;
  upgradeWithEmail: (email: string, password: string, name: string) => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isAnonymous: true,
  isLoading: true,
  signIn: async () => null,
  signUp: async () => null,
  signInWithGoogle: async () => null,
  signInWithApple: async () => null,
  sendMagicLink: async () => null,
  handleMagicLinkReturn: async () => null,
  upgradeWithEmail: async () => null,
  resetPassword: async () => null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore cached user immediately to avoid flash
    AsyncStorage.getItem(AUTH_CACHE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const cached = JSON.parse(raw) as MobileUser;
            setUser(cached);
            setIsAnonymous(false);
          } catch { /* ignore */ }
        }
      })
      .catch(() => {});

    const unsub = onAuthStateChange(async (fbUser) => {
      if (fbUser && !fbUser.isAnonymous) {
        const profile = await fetchProfile(fbUser.uid);
        if (profile) {
          setUser(profile);
          setIsAnonymous(false);
          await AsyncStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(profile)).catch(() => {});
        } else {
          setUser(null);
          setIsAnonymous(true);
          await AsyncStorage.removeItem(AUTH_CACHE_KEY).catch(() => {});
        }
      } else {
        setUser(null);
        setIsAnonymous(true);
        await AsyncStorage.removeItem(AUTH_CACHE_KEY).catch(() => {});
      }
      setIsLoading(false);
    });

    return unsub;
  }, []);

  const cacheUser = useCallback(async (u: MobileUser) => {
    setUser(u);
    setIsAnonymous(false);
    await AsyncStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(u)).catch(() => {});
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user: u, error } = await authSignIn(email, password);
    if (u) await cacheUser(u);
    return error;
  }, [cacheUser]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { user: u, error } = await authSignUp(email, password, name);
    if (u) await cacheUser(u);
    return error;
  }, [cacheUser]);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const { user: u, error } = await authGoogle(idToken);
    if (u) await cacheUser(u);
    return error;
  }, [cacheUser]);

  const signInWithApple = useCallback(async (idToken: string, nonce: string) => {
    const { user: u, error } = await authApple(idToken, nonce);
    if (u) await cacheUser(u);
    return error;
  }, [cacheUser]);

  const sendMagicLink = useCallback(async (email: string) => {
    const appUrl = process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app";
    const { error } = await authMagicLink(email, appUrl);
    return error;
  }, []);

  const handleMagicLinkReturn = useCallback(async (url: string) => {
    const { user: u, error } = await authMagicReturn(url);
    if (u) await cacheUser(u);
    return error;
  }, [cacheUser]);

  const upgradeWithEmail = useCallback(async (email: string, password: string, name: string) => {
    const { user: u, error } = await authUpgradeEmail(email, password, name);
    if (u) await cacheUser(u);
    return error;
  }, [cacheUser]);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await authResetPassword(email);
    return error;
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    setUser(null);
    setIsAnonymous(true);
    await AsyncStorage.removeItem(AUTH_CACHE_KEY).catch(() => {});
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isAuthenticated: !!user && !isAnonymous,
    isAnonymous,
    isLoading,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithApple,
    sendMagicLink,
    handleMagicLinkReturn,
    upgradeWithEmail,
    resetPassword,
    signOut,
  }), [
    user, isAnonymous, isLoading,
    signIn, signUp, signInWithGoogle, signInWithApple,
    sendMagicLink, handleMagicLinkReturn, upgradeWithEmail,
    resetPassword, signOut,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
