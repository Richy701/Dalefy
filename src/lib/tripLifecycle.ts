import type { Trip } from "@/types";
import { parseTripDate } from "@/lib/dates";

/** Over, by date: the last day has passed */
export function isPastTrip(trip: Pick<Trip, "end">, now = new Date()): boolean {
  const end = parseTripDate(trip.end);
  end.setHours(23, 59, 59, 999);
  return end < now;
}

export type LifecycleLabel = "Draft" | "Published" | "Active" | "Completed" | "Archived";

/** What a trip is right now, for badges: archived first, then over, then its saved status */
export function lifecycleLabel(trip: Pick<Trip, "status" | "end" | "archivedAt">, now = new Date()): LifecycleLabel {
  if (trip.archivedAt) return "Archived";
  if (isPastTrip(trip, now)) return "Completed";
  return trip.status === "In Progress" ? "Active" : trip.status;
}

/** Trips still in play: everything that hasn't been archived */
export function liveTrips<T extends Pick<Trip, "archivedAt">>(trips: T[]): T[] {
  return trips.filter(t => !t.archivedAt);
}
