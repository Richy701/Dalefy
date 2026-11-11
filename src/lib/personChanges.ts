import type { PublishedSnapshot, TravelEvent, Trip, TripOrganizer, User } from '@/types';
import { syncLinkedOrganizer } from './tripSave';

export function combinePersonDetails(keep: User, other: User): User {
  return { ...other, ...keep, email: keep.email || other.email, avatar: keep.avatar || other.avatar,
    profile: { ...other.profile, ...keep.profile },
    compliance: [...new Map([...(other.compliance || []), ...(keep.compliance || [])].map(item => [JSON.stringify(item), item])).values()],
  };
}
type TripPerson = NonNullable<Trip['travelers']>[number];
export interface TripPeopleDoc {
  travelers?: TripPerson[];
  traveler_ids?: string[] | null;
  events?: TravelEvent[];
  organizer?: TripOrganizer | null;
  published_snapshot?: (Omit<PublishedSnapshot, 'organizer'> & { organizer?: TripOrganizer | null }) | null;
}
/** Changes contacts and identity references only; preserves itinerary edits and app roles. */
export function changePersonOnTrip(data: TripPeopleDoc, person: User, duplicateId?: string) {
  const ids = new Set([person.id, duplicateId].filter(Boolean));
  const patchPeople = (people: TripPerson[] = []) => {
    const matched = people.filter(p => ids.has(p.id));
    if (!matched.length) return people;
    const merged: TripPerson = Object.assign({}, ...matched.filter(p => p.id !== person.id), ...matched.filter(p => p.id === person.id));
    // A photo only ever arrives here, never leaves: photos are changed through their own path, and a
    // directory entry without one must not wipe the trip's copy
    const next = { ...merged, id: person.id, name: person.name, initials: person.initials, email: person.email || '', avatar: person.avatar || merged.avatar || '' };
    let added = false;
    return people.flatMap(p => !ids.has(p.id) ? [p] : added ? [] : (added = true, [next]));
  };
  const events = (items: TravelEvent[] = []) => items.map(event => {
    if (!duplicateId) return event;
    const next = event.assignedTo?.includes(duplicateId)
      ? { ...event, assignedTo: [...new Set(event.assignedTo.map(id => id === duplicateId ? person.id : id))] } : event;
    const merged = { ...next };
    for (const field of ["travelerRefs", "travelerSeats", "travelerTickets", "travelerDocs"] as const) {
      const value = merged[field]?.[duplicateId];
      if (value === undefined) continue;
      const rest = Object.entries(merged[field]!).filter(([id]) => id !== duplicateId);
      (merged as Record<string, unknown>)[field] = { [person.id]: value, ...Object.fromEntries(rest) };
    }
    return merged;
  });
  const organizer = (value?: TripOrganizer | null) => value?.travelerId === duplicateId && duplicateId ? { ...value!, travelerId: person.id } : value;
  const next = { ...data, travelers: patchPeople(data.travelers), traveler_ids: [...new Set((data.traveler_ids || []).map(id => id === duplicateId ? person.id : id))], events: events(data.events), organizer: organizer(data.organizer) };
  if (data.published_snapshot) next.published_snapshot = { ...data.published_snapshot, travelers: patchPeople(data.published_snapshot.travelers), events: events(data.published_snapshot.events), organizer: organizer(data.published_snapshot.organizer) };
  if (next.published_snapshot) next.published_snapshot.paxCount = String(next.published_snapshot.travelers!.length);
  return syncLinkedOrganizer(next);
}
