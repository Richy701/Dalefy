import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { DARK_QUERY, deviceItineraryTheme, savedItineraryTheme, saveItineraryTheme, type ItineraryTheme } from "@/lib/itineraryTheme";

function paint(theme: ItineraryTheme) {
  const html = document.documentElement;
  html.classList.remove("light", "dim", "dark");
  html.classList.add(theme);
  html.style.colorScheme = theme === "light" ? "light" : "dark";
}

/** Follows the device until the reader picks a theme, and always prints light: white text on paper is unreadable. */
export function useItineraryTheme() {
  const { setThemeOverride } = useTheme();
  const [saved, setSaved] = useState(savedItineraryTheme);
  const [device, setDevice] = useState(deviceItineraryTheme);
  const theme = saved ?? device;

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const change = () => setDevice(deviceItineraryTheme());
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    setThemeOverride(theme);
    return () => setThemeOverride(null);
  }, [theme, setThemeOverride]);

  useEffect(() => {
    const before = () => paint("light");
    const after = () => paint(theme);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [theme]);

  const toggle = useCallback(() => {
    const next: ItineraryTheme = theme === "light" ? "dim" : "light";
    saveItineraryTheme(next);
    setSaved(next);
  }, [theme]);

  return { theme, toggle };
}
