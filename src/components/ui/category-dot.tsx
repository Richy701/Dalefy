import { AirplaneTilt, Bed, ForkKnife, MapPin, Van, Car, Train, Bus, Boat, Anchor } from "@phosphor-icons/react";
import type { TravelEvent } from "@/types";

type EventType = TravelEvent["type"];
type IconComponent = React.ComponentType<{ className?: string; weight?: "regular" | "fill" | "bold" }>;

const ICONS: Record<EventType, IconComponent> = {
  flight: AirplaneTilt, hotel: Bed, dining: ForkKnife, activity: MapPin, transfer: Van,
};
const TRANSFER_ICONS: Record<string, IconComponent> = {
  car: Car, train: Train, bus: Bus, ferry: Boat, cruise: Anchor,
};

/** Tailwind classes for a category: soft circle fill and solid glyph colour. */
export const CATEGORY_CLASS: Record<EventType, { bg: string; fg: string; label: string }> = {
  flight:   { bg: "bg-cat-flight/15",   fg: "text-cat-flight",   label: "Flight" },
  hotel:    { bg: "bg-cat-stay/15",     fg: "text-cat-stay",     label: "Stay" },
  dining:   { bg: "bg-cat-meal/15",     fg: "text-cat-meal",     label: "Meal" },
  activity: { bg: "bg-cat-activity/15", fg: "text-cat-activity", label: "Activity" },
  transfer: { bg: "bg-cat-transfer/15", fg: "text-cat-transfer", label: "Transfer" },
};

export function categoryIcon(type: EventType, transferType?: string): IconComponent {
  if (type === "transfer" && transferType && TRANSFER_ICONS[transferType]) return TRANSFER_ICONS[transferType];
  return ICONS[type] ?? MapPin;
}

const SIZE = {
  sm: { box: "h-7 w-7", icon: "h-3.5 w-3.5" },
  md: { box: "h-9 w-9", icon: "h-4 w-4" },
  lg: { box: "h-11 w-11", icon: "h-5 w-5" },
};

/**
 * Category circle: soft tint with a filled glyph. The only place a glyph is
 * filled, so the circle reads as the category marker wherever it appears.
 */
export function CategoryDot({ type, transferType, size = "md", className = "" }: {
  type: EventType;
  transferType?: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const c = CATEGORY_CLASS[type] ?? CATEGORY_CLASS.activity;
  const Icon = categoryIcon(type, transferType);
  const s = SIZE[size];
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full ${s.box} ${c.bg} ${c.fg} ${className}`}>
      <Icon className={s.icon} weight="fill" />
    </span>
  );
}
