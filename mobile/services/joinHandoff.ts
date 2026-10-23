import type { Trip } from "@/shared/types";

/**
 * The trip Join already found, handed to the joining screen so it can draw on its very first frame (the card's
 * photo has just grown into its hero) instead of showing a skeleton while it fetches the same trip again.
 */
let handedOff: Trip | null = null;

export function handOffTrip(trip: Trip) {
  handedOff = trip;
}

export function handedOffTrip(id: string | undefined): Trip | null {
  return handedOff && handedOff.id === id ? handedOff : null;
}
