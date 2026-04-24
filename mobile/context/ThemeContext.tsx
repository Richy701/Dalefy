import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from "react";
import { Appearance } from "react-native";
import * as SystemUI from "expo-system-ui";
import { darkColors, lightColors, applyAccent, applyAccentHex, type ThemeColors } from "@/constants/theme";
import { usePreferences, type ThemeMode } from "./PreferencesContext";
import { useBrand } from "./BrandContext";

interface ThemeContextValue {
  isDark: boolean;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  /** Legacy toggle — cycles light→dark→system */
  toggle: () => void;
  C: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: true,
  mode: "system",
  setMode: () => {},
  toggle: () => {},
  C: darkColors,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { prefs, setPref } = usePreferences();
  const { brand } = useBrand();
  const mode = prefs.themeMode ?? "system";

  // Track the device scheme for "system" mode
  const [deviceScheme, setDeviceScheme] = useState<"light" | "dark">(
    Appearance.getColorScheme() === "light" ? "light" : "dark"
  );

  // Sync native appearance on mount if user has a preference
  useEffect(() => {
    if (mode !== "system") {
      Appearance.setColorScheme(mode);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setDeviceScheme(colorScheme === "light" ? "light" : "dark");
    });
    return () => sub.remove();
  }, []);

  const isDark =
    mode === "system" ? deviceScheme === "dark" :
    mode === "dark";

  const C = useMemo(() => {
    const base = isDark ? darkColors : lightColors;
    // Org branding accent takes priority over local preset
    if (brand.accentColor) {
      return applyAccentHex(base, brand.accentColor);
    }
    return applyAccent(base, prefs.accent, isDark);
  }, [isDark, prefs.accent, brand.accentColor]);

  const setMode = useCallback((m: ThemeMode) => {
    Appearance.setColorScheme(m === "system" ? null : m);
    const willBeDark = m === "system" ? Appearance.getColorScheme() !== "light" : m === "dark";
    SystemUI.setBackgroundColorAsync(willBeDark ? "#131316" : "#ffffff");
    setPref("themeMode", m);
  }, [setPref]);

  const toggle = useCallback(() => {
    const order: ThemeMode[] = ["light", "dark", "system"];
    const idx = order.indexOf(mode);
    setMode(order[(idx + 1) % order.length]);
  }, [mode, setMode]);

  return (
    <ThemeContext.Provider value={{ isDark, mode, setMode, toggle, C }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
