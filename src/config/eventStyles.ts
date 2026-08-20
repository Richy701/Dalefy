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

/** Fixed hex colors per event type, for surfaces that can't use theme tokens
 *  (map markers, shared-trip page). The hotel value is a mid-tone sand that
 *  clears 3:1 against both the dark card and white. */
export const EVENT_HEX = {
  flight:   "#0bd2b5",
  hotel:    "#b87613",
  activity: "#0bd2b5",
  dining:   "#0bd2b5",
  transfer: "#0bd2b5",
} as const;

/** Tailwind classes per event type. Accommodation carries the warm secondary
 *  so a stay reads differently from movement at a glance. */
export const EVENT_STYLES = {
  flight:   { bg: "bg-brand/10", text: "text-brand", hex: "#0bd2b5" },
  hotel:    { bg: "bg-sand/10",  text: "text-sand",  hex: "#b87613" },
  activity: { bg: "bg-brand/10", text: "text-brand", hex: "#0bd2b5" },
  dining:   { bg: "bg-brand/10", text: "text-brand", hex: "#0bd2b5" },
  transfer: { bg: "bg-brand/10", text: "text-brand", hex: "#0bd2b5" },
} as const;

/** Text-only color classes (for compact usage). */
export const EVENT_TEXT_COLORS: Record<EventType, string> = {
  flight:   "text-brand",
  hotel:    "text-sand",
  activity: "text-brand",
  dining:   "text-brand",
  transfer: "text-brand",
};
