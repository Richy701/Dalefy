import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import { usePreferences } from "@/context/PreferencesContext";

/** Haptic helpers that respect the user's haptics preference. */
export function useHaptic() {
  const { prefs } = usePreferences();

  const selection = useCallback(() => {
    if (prefs.haptics) Haptics.selectionAsync();
  }, [prefs.haptics]);

  const light = useCallback(() => {
    if (prefs.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [prefs.haptics]);

  const medium = useCallback(() => {
    if (prefs.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [prefs.haptics]);

  const warning = useCallback(() => {
    if (prefs.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [prefs.haptics]);

  return { selection, light, medium, warning };
}
