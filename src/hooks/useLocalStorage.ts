import { useState, useEffect } from "react";

/** Dispatch after writing to localStorage directly so same-tab useLocalStorage hooks re-sync. */
export function notifyLocalStorage(key: string) {
  window.dispatchEvent(new CustomEvent("local-storage-sync", { detail: key }));
}

export function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    if (!saved) return initialValue;
    try {
      return JSON.parse(saved);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  // Re-read when another part of the app writes to the same key directly
  useEffect(() => {
    const onSync = (e: Event) => {
      if ((e as CustomEvent).detail !== key) return;
      const raw = localStorage.getItem(key);
      try {
        setValue(raw ? JSON.parse(raw) : initialValue);
      } catch { /* ignore */ }
    };
    window.addEventListener("local-storage-sync", onSync);
    return () => window.removeEventListener("local-storage-sync", onSync);
  }, [key, initialValue]);

  return [value, setValue];
}
