import type { Trip } from "@/types";

/**
 * The trip without these travellers: its list, the events they were on, and the published copy phones
 * read. Removing someone takes effect straight away; it isn't an edit that waits for the next publish.
 * Events are returned separately so callers can save them through updateEvent.
 */
export function withoutTravelers(trip: Trip, ids: Set<string>): { updates: Partial<Trip>; events: Trip["events"] } {
  const keep = (id: string) => !ids.has(id);
  const hasRef = (e: Trip["events"][number]) => Object.keys(e.travelerRefs ?? {}).some(id => ids.has(id));
  const without = (e: Trip["events"][number]): Trip["events"][number] => {
    const next = { ...e };
    if (e.assignedTo?.some(id => ids.has(id))) next.assignedTo = e.assignedTo.filter(keep);
    if (hasRef(e)) next.travelerRefs = Object.fromEntries(Object.entries(e.travelerRefs!).filter(([id]) => keep(id)));
    return next;
  };
  const updates: Partial<Trip> = {
    travelers: (trip.travelers ?? []).filter(t => keep(t.id)),
    travelerIds: (trip.travelerIds ?? []).filter(keep),
  };
  const snap = trip.publishedSnapshot;
  if (snap && ((snap.travelers ?? []).some(t => ids.has(t.id)) || snap.events.some(e => e.assignedTo?.some(id => ids.has(id)) || hasRef(e)))) {
    const remaining = (snap.travelers ?? []).filter(t => keep(t.id));
    updates.publishedSnapshot = {
      ...snap,
      travelers: remaining,
      // The app falls back to this count when the list is empty, so it must shrink with the list
      paxCount: String(remaining.length),
      events: snap.events.map(without),
    };
  }
  const events = trip.events
    .filter(e => e.assignedTo?.some(id => ids.has(id)) || hasRef(e))
    .map(without);
  return { updates, events };
}
