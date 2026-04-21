import { createContext, useContext, useEffect, useRef } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { playChime } from "@/lib/sound";
import { STORAGE } from "@/config/storageKeys";
import { BRAND } from "@/config/brand";
import { useBrand } from "@/context/BrandContext";

/** Quick-pick presets shown in the color picker */
export const ACCENT_PRESETS = [
  "#0bd2b5", "#0ea5e9", "#6366f1", "#8b5cf6",
  "#ec4899", "#f43f5e", "#f97316", "#eab308",
  "#22c55e", "#14b8a6", "#3b82f6", "#a855f7",
] as const;

/** Convert hex to "R G B" string */
function hexToRgbStr(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

/** Convert hex to "H S% L%" HSL string for CSS variables */
function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

interface PreferencesCtx {
  compactMode: boolean;
  setCompactMode: (v: boolean) => void;
  toastsEnabled: boolean;
  setToastsEnabled: (v: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  accentColor: string;
  setAccentColor: (v: string) => void;
}

const Ctx = createContext<PreferencesCtx | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [compactMode, setCompactMode] = useLocalStorage(STORAGE.COMPACT, false);
  const [toastsEnabled, setToastsEnabled] = useLocalStorage(STORAGE.TOASTS, true);
  const [soundEnabled, setSoundEnabled] = useLocalStorage(STORAGE.SOUND, false);
  const [accentColor, setAccentColor] = useLocalStorage(STORAGE.ACCENT, BRAND.accentColor);
  const { brand } = useBrand();

  // Sync org branding accent color → app theme
  useEffect(() => {
    if (brand.accentColor && brand.accentColor !== BRAND.accentColor) {
      setAccentColor(brand.accentColor);
    }
  }, [brand.accentColor]);

  useEffect(() => {
    document.documentElement.dataset.compact = compactMode ? "true" : "false";
  }, [compactMode]);

  useEffect(() => {
    // Migrate old palette IDs to hex
    const hex = accentColor.startsWith("#") ? accentColor : BRAND.accentColor;
    const root = document.documentElement;
    root.style.setProperty("--brand-rgb", hexToRgbStr(hex));
    root.style.setProperty("--primary", hexToHsl(hex));
    root.style.setProperty("--ring", hexToHsl(hex));
    root.style.setProperty("--sidebar-ring", hexToHsl(hex));
  }, [accentColor]);

  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      if (!soundEnabledRef.current) return;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLElement && node.matches("[data-sonner-toast]")) {
            const type = node.getAttribute("data-type") ?? "info";
            playChime(type === "error" ? "error" : "success");
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <Ctx.Provider value={{ compactMode, setCompactMode, toastsEnabled, setToastsEnabled, soundEnabled, setSoundEnabled, accentColor, setAccentColor }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}
