import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { Theme } from "@/types";
import { STORAGE } from "@/config/storageKeys";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: "dark", toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE.THEME);
    return (saved === "light" || saved === "dark") ? saved : "dark";
  });

  // All DOM work lives here rather than inside the setState updater. React
  // may invoke an updater twice or discard the render entirely, which left
  // `theme-switching` stuck on <html> - and that class kills every transition
  // in the app until the next full reload.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("theme-switching");
    html.classList.remove("light", "dark");
    html.classList.add(theme);
    html.style.colorScheme = theme;
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

  const toggleTheme = () => setTheme(prev => (prev === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
