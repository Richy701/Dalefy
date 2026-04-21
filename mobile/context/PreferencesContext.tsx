import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AccentId } from "@/constants/theme";

const STORAGE_KEY = "daf-prefs";

export type ThemeMode = "light" | "dark" | "system";

export interface Preferences {
  name: string;
  avatar: string;
  orgId: string;
  orgSlug: string;
  tripReminders: boolean;
  itineraryUpdates: boolean;
  accent: AccentId;
  haptics: boolean;
  themeMode: ThemeMode;
}

const DEFAULT_PREFS: Preferences = {
  name: "",
  avatar: "",
  orgId: "",
  orgSlug: "",
  tripReminders: true,
  itineraryUpdates: true,
  accent: "teal",
  haptics: true,
  themeMode: "system",
};

interface PreferencesContextType {
  prefs: Preferences;
  ready: boolean;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextType>({
  prefs: DEFAULT_PREFS,
  ready: false,
  setPref: () => {},
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            setPrefs({ ...DEFAULT_PREFS, ...parsed });
          } catch { /* ignore */ }
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setPref = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const value = useMemo(() => ({ prefs, ready, setPref }), [prefs, ready]);

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}

export async function readPreferencesFromStorage(): Promise<Preferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}
