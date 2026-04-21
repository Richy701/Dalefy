import { Plane, Hotel, Compass, Utensils } from "lucide-react";

export type EventType = "flight" | "hotel" | "activity" | "dining";

/** Icons per event type. */
export const EVENT_ICONS = {
  flight:   Plane,
  hotel:    Hotel,
  activity: Compass,
  dining:   Utensils,
} as const;

/** Fixed hex colors per event type (for non-accent-aware contexts). */
export const EVENT_HEX = {
  flight:   "#94a3b8",
  hotel:    "#f59e0b",
  activity: "#0bd2b5",
  dining:   "#f472b6",
} as const;

/** Tailwind classes per event type. */
export const EVENT_STYLES = {
  flight:   { bg: "bg-blue-400/10",  text: "text-blue-500",  hex: "#60a5fa" },
  hotel:    { bg: "bg-amber-400/10", text: "text-amber-500", hex: "#f59e0b" },
  activity: { bg: "bg-brand/10",     text: "text-brand",     hex: "#0bd2b5" },
  dining:   { bg: "bg-pink-400/10",  text: "text-pink-500",  hex: "#f472b6" },
} as const;

/** Text-only color classes (for compact usage). */
export const EVENT_TEXT_COLORS: Record<EventType, string> = {
  flight:   "text-slate-500 dark:text-slate-400",
  hotel:    "text-amber-400",
  activity: "text-brand",
  dining:   "text-pink-400",
};
