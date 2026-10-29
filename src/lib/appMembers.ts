import type { TripMember } from "@/services/firebaseTrips";

/** One person in the app, however they joined: picked from the trip's list, signed in, or just a device */
export const personOf = (m: TripMember) => m.linked_traveler_id || m.uid || m.device_id;

/** People in the app per trip, each counted once */
export function joinedByTrip(members: TripMember[]): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const m of members) {
    const set = seen.get(m.trip_id) ?? new Set<string>();
    set.add(personOf(m));
    seen.set(m.trip_id, set);
  }
  return new Map([...seen].map(([id, set]) => [id, set.size]));
}
