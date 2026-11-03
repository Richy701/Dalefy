import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { Theme } from "@/types";
import { STORAGE } from "@/config/storageKeys";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: "dim", toggleTheme: () => {}, setTheme: () => {} });

const THEMES: Theme[] = ["light", "dim", "dark"];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE.THEME);
    if (saved === "light" || saved === "dim" || saved === "dark") return saved;
    return "dim";
  });

  // All DOM work lives here rather than inside the setState updater. React
  // may invoke an updater twice or discard the render entirely, which left
  // `theme-switching` stuck on <html> - and that class kills every transition
  // in the app until the next full reload.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("theme-switching");
    html.classList.remove("light", "dim", "dark");
    html.classList.add(theme);
    html.style.colorScheme = theme === "light" ? "light" : "dark";
    localStorage.setItem(STORAGE.THEME, theme);

    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => html.classList.remove("theme-switching"));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
      html.classList.remove("theme-switching");
    };
  }, [theme]);

  const toggleTheme = () => setTheme(prev => {
    const i = THEMES.indexOf(prev);
    return THEMES[(i + 1) % THEMES.length];
  });

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
