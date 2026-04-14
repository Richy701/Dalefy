import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { Theme } from "@/types";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: "dark", toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("daf-theme");
    return (saved === "light" || saved === "dark") ? saved : "dark";
  });

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("light", "dark");
    html.classList.add(theme);
    html.style.colorScheme = theme;
    localStorage.setItem("daf-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === "light" ? "dark" : "light";
      const html = document.documentElement;
      html.classList.add("theme-switching");
      html.classList.remove("light", "dark");
      html.classList.add(next);
      html.style.colorScheme = next;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          html.classList.remove("theme-switching");
        });
      });
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
