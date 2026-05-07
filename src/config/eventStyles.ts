import { AirplaneTilt, Bed, Compass, ForkKnife, Car } from "@phosphor-icons/react";

export type EventType = "flight" | "hotel" | "activity" | "dining" | "transfer";

/** Icons per event type. */
export const EVENT_ICONS = {
  flight:   AirplaneTilt,
  hotel:    Bed,
  activity: Compass,
  dining:   ForkKnife,
  transfer: Car,
} as const;

/** Fixed hex colors per event type — all use brand accent. */
export const EVENT_HEX = {
  flight:   "#0bd2b5",
  hotel:    "#0bd2b5",
  activity: "#0bd2b5",
  dining:   "#0bd2b5",
  transfer: "#0bd2b5",
} as const;

/** Tailwind classes per event type — unified brand color. */
export const EVENT_STYLES = {
  flight:   { bg: "bg-brand/10",  text: "text-brand",  hex: "#0bd2b5" },
  hotel:    { bg: "bg-brand/10",  text: "text-brand",  hex: "#0bd2b5" },
  activity: { bg: "bg-brand/10",  text: "text-brand",  hex: "#0bd2b5" },
  dining:   { bg: "bg-brand/10",  text: "text-brand",  hex: "#0bd2b5" },
  transfer: { bg: "bg-brand/10",  text: "text-brand",  hex: "#0bd2b5" },
} as const;

/** Text-only color classes (for compact usage). */
export const EVENT_TEXT_COLORS: Record<EventType, string> = {
  flight:   "text-brand",
  hotel:    "text-brand",
  activity: "text-brand",
  dining:   "text-brand",
  transfer: "text-brand",
};
