import { STORAGE } from "@/config/storageKeys";

/** The shared itinerary's own theme, kept apart from the organiser's choice in the admin app. Its dark is the Dim palette. */
export type ItineraryTheme = "light" | "dim";

export const isSharedItineraryRoute = () => window.location.hash.startsWith("#/shared/");

export function savedItineraryTheme(): ItineraryTheme | null {
  try {
    const saved = localStorage.getItem(STORAGE.ITINERARY_THEME);
    return saved === "light" || saved === "dim" ? saved : null;
  } catch {
    return null;
  }
}

export function saveItineraryTheme(theme: ItineraryTheme) {
  try { localStorage.setItem(STORAGE.ITINERARY_THEME, theme); } catch { /* still applies for this visit */ }
}

export const DARK_QUERY = "(prefers-color-scheme: dark)";
export const deviceItineraryTheme = (): ItineraryTheme => (window.matchMedia(DARK_QUERY).matches ? "dim" : "light");
