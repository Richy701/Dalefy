import React, { createContext, useContext, useState, useMemo, useEffect } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors, applyAccent, type ThemeColors } from "@/constants/theme";
import { usePreferences } from "./PreferencesContext";

const THEME_KEY = "daf-theme";

interface ThemeContextValue {
  isDark: boolean;
  toggle: () => void;
  C: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: true,
  toggle: () => {},
  C: darkColors,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(Appearance.getColorScheme() !== "light");
  const { prefs } = usePreferences();
  const C = useMemo(() => {
    const base = isDark ? darkColors : lightColors;
    return applyAccent(base, prefs.accent, isDark);
  }, [isDark, prefs.accent]);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(val => {
      if (val === "light") setIsDark(false);
      else if (val === "dark") setIsDark(true);
    }).catch(() => {});
  }, []);

  const toggle = () => {
    setIsDark(v => {
      const next = !v;
      AsyncStorage.setItem(THEME_KEY, next ? "dark" : "light").catch(() => {});
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggle, C }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
