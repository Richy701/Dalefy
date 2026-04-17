import { createContext, useContext, useState, type ReactNode } from "react";
import type { User } from "@/types";

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

export interface OnboardingData {
  name: string;
  email?: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  completeOnboarding: (data: OnboardingData) => Promise<void>;
  demoLogin: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  completeOnboarding: async () => {},
  demoLogin: async () => {},
  updateProfile: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("daf-auth");
    if (!saved) return null;
    try { return JSON.parse(saved); } catch { return null; }
  });

  const completeOnboarding = async (data: OnboardingData) => {
    const name = data.name.trim();
    const next: User = {
      id: `user-${Date.now()}`,
      name,
      email: (data.email ?? "").trim(),
      role: (data.role ?? "Trip Manager").trim(),
      avatar: "",
      initials: initialsFrom(name),
      status: "Active",
    };
    setUser(next);
    localStorage.setItem("daf-auth", JSON.stringify(next));
  };

  const demoLogin = async () => {
    await new Promise(r => setTimeout(r, 600));
    setUser(DEMO_USER);
    localStorage.setItem("daf-auth", JSON.stringify(DEMO_USER));
  };

  const updateProfile = (patch: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (patch.name) next.initials = initialsFrom(patch.name);
      localStorage.setItem("daf-auth", JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("daf-auth");
  };

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, completeOnboarding, demoLogin, updateProfile, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
