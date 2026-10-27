import type { User } from '@/types';
import { syncLinkedOrganizer } from './tripSave';

export function combinePersonDetails(keep: User, other: User): User {
  return { ...other, ...keep, email: keep.email || other.email, avatar: keep.avatar || other.avatar,
    profile: { ...other.profile, ...keep.profile },
    compliance: [...new Map([...(other.compliance || []), ...(keep.compliance || [])].map(item => [JSON.stringify(item), item])).values()],
  };
}
/** Changes contacts and identity references only; preserves itinerary edits and app roles. */
export function changePersonOnTrip(data: Record<string, any>, person: User, duplicateId?: string) {
  const ids = new Set([person.id, duplicateId].filter(Boolean));
  const patchPeople = (people: any[] = []) => {
    const matched = people.filter(p => ids.has(p.id));
    if (!matched.length) return people;
    const merged = Object.assign({}, ...matched.filter(p => p.id !== person.id), ...matched.filter(p => p.id === person.id));
    const next = { ...merged, id: person.id, name: person.name, initials: person.initials, email: person.email || '', avatar: person.avatar || '' };
    let added = false;
    return people.flatMap(p => !ids.has(p.id) ? [p] : added ? [] : (added = true, [next]));
  };
  const events = (items: any[] = []) => items.map(event => duplicateId && event.assignedTo?.includes(duplicateId)
    ? { ...event, assignedTo: [...new Set(event.assignedTo.map((id: string) => id === duplicateId ? person.id : id))] } : event);
  const organizer = (value: any) => value?.travelerId === duplicateId && duplicateId ? { ...value, travelerId: person.id } : value;
  const next: Record<string, any> = { ...data, travelers: patchPeople(data.travelers), traveler_ids: [...new Set((data.traveler_ids || []).map((id: string) => id === duplicateId ? person.id : id))], events: events(data.events), organizer: organizer(data.organizer) };
  if (data.published_snapshot) next.published_snapshot = { ...data.published_snapshot, travelers: patchPeople(data.published_snapshot.travelers), events: events(data.published_snapshot.events), organizer: organizer(data.published_snapshot.organizer) };
  if (next.published_snapshot) next.published_snapshot.paxCount = String(next.published_snapshot.travelers.length);
  return syncLinkedOrganizer(next);
}
