import { createContext, useContext, useState, type ReactNode } from "react";
import type { User } from "@/types";
import { MOCK_USERS } from "@/data/mock-users";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  demoLogin: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  login: async () => {},
  demoLogin: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("daf-auth");
    if (!saved) return null;
    try { return JSON.parse(saved); } catch { return null; }
  });

  const login = async (_email: string, _password: string) => {
    await new Promise(r => setTimeout(r, 1000));
    const u = MOCK_USERS[0]; // Always logs in as Ash Murray
    setUser(u);
    localStorage.setItem("daf-auth", JSON.stringify(u));
  };

  const demoLogin = async () => {
    await new Promise(r => setTimeout(r, 1000));
    const u = MOCK_USERS[0];
    setUser(u);
    localStorage.setItem("daf-auth", JSON.stringify(u));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("daf-auth");
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, demoLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
