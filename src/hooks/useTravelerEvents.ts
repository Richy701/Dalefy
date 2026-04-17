import { useMemo } from "react";
import type { TravelEvent } from "@/types";

/**
 * Filter trip events to only those visible to a specific traveler.
 * - Events with no `assignedTo` (or empty array) are visible to everyone.
 * - Events with `assignedTo` are only visible if the traveler's ID is in the list.
 * - Pass `null` as travelerId to see all events (organizer / "View as Everyone").
 */
export function filterEventsForTraveler(
  events: TravelEvent[],
  travelerId: string | null
): TravelEvent[] {
  if (!travelerId) return events;
  return events.filter(
    (e) => !e.assignedTo || e.assignedTo.length === 0 || e.assignedTo.includes(travelerId)
  );
}

export function useTravelerEvents(
  events: TravelEvent[],
  travelerId: string | null
): TravelEvent[] {
  return useMemo(
    () => filterEventsForTraveler(events, travelerId),
    [events, travelerId]
  );
}
