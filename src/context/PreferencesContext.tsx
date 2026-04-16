import { createContext, useContext, useEffect, useRef } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { playChime } from "@/lib/sound";

export const ACCENT_PALETTE = [
  { id: "teal",    label: "Cyber Teal",      rgb: "11 210 181",  hex: "#0bd2b5" },
  { id: "violet",  label: "Electric Violet", rgb: "139 92 246",  hex: "#8b5cf6" },
  { id: "amber",   label: "Solar Amber",     rgb: "245 158 11",  hex: "#f59e0b" },
  { id: "crimson", label: "Crimson",         rgb: "239 68 68",   hex: "#ef4444" },
  { id: "cobalt",  label: "Cobalt",          rgb: "59 130 246",  hex: "#3b82f6" },
  { id: "lime",    label: "Lime",            rgb: "132 204 22",  hex: "#84cc16" },
] as const;

export type AccentId = typeof ACCENT_PALETTE[number]["id"];

interface PreferencesCtx {
  compactMode: boolean;
  setCompactMode: (v: boolean) => void;
  toastsEnabled: boolean;
  setToastsEnabled: (v: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  accent: AccentId;
  setAccent: (v: AccentId) => void;
}

const Ctx = createContext<PreferencesCtx | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [compactMode, setCompactMode] = useLocalStorage("daf-compact", false);
  const [toastsEnabled, setToastsEnabled] = useLocalStorage("daf-toasts", true);
  const [soundEnabled, setSoundEnabled] = useLocalStorage("daf-sound", false);
  const [accent, setAccent] = useLocalStorage<AccentId>("daf-accent", "teal");

  useEffect(() => {
    document.documentElement.dataset.compact = compactMode ? "true" : "false";
  }, [compactMode]);

  useEffect(() => {
    const preset = ACCENT_PALETTE.find((p) => p.id === accent) ?? ACCENT_PALETTE[0];
    document.documentElement.style.setProperty("--brand-rgb", preset.rgb);
  }, [accent]);

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
    <Ctx.Provider value={{ compactMode, setCompactMode, toastsEnabled, setToastsEnabled, soundEnabled, setSoundEnabled, accent, setAccent }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}
