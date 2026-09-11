import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";

/** Refresh schedule decisions while visible, after sleep, and when returning to the tab. */
export function useMinuteClock() {
  const [now, setNow] = useState(Date.now);
  const refresh = useCallback(() => setNow(Date.now()), []);
  useFocusEffect(useCallback(() => {
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [refresh]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  return now;
}
