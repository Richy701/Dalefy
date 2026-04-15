import React, { createContext, useContext, useState, useMemo } from "react";
import { Appearance } from "react-native";
import { darkColors, lightColors, type ThemeColors } from "@/constants/theme";

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
  const C = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, toggle: () => setIsDark(v => !v), C }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
