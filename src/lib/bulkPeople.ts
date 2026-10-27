import type { User, Trip } from '@/types';
import { tripTravelerOf } from './travelerSync';

export const normalizePerson = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
export const validPersonEmail = (value: string) => !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export type PeopleRowStatus = 'new' | 'matched' | 'sync' | 'update' | 'onTrip' | 'duplicate' | 'noName' | 'invalidEmail' | 'conflict';
export interface PeopleRow { key: number; name: string; email: string; include: boolean }
export function assessPeople(rows: PeopleRow[], existing: User[], onTripIds?: ReadonlySet<string>) {
  const byEmail = new Map<string, User[]>();
  const byName = new Map<string, User[]>();
  for (const user of existing) {
    for (const [map, key] of [[byEmail, normalizePerson(user.email || '')], [byName, normalizePerson(user.name)]] as const) {
      if (key) map.set(key, [...(map.get(key) || []), user]);
    }
  }
  const used = new Set<string>();
  return rows.map(row => {
    const email = normalizePerson(row.email);
    const name = normalizePerson(row.name);
    const emailMatches = email ? byEmail.get(email) || [] : [];
    const nameMatches = byName.get(name) || [];
    const candidates = emailMatches.length ? emailMatches : nameMatches;
    const matched = candidates.length === 1 ? candidates[0] : undefined;
    let status: PeopleRowStatus;
    if (!validPersonEmail(email)) status = 'invalidEmail';
    else if (!name && !matched) status = 'noName';
    else if (candidates.length > 1 || (matched && email && matched.email && normalizePerson(matched.email) !== email)) status = 'conflict';
    else if (used.has(matched ? `id:${matched.id}` : email ? `email:${email}` : `name:${name}`)) status = 'duplicate';
    else if (matched && email && !matched.email?.trim()) status = 'update';
    else if (matched && onTripIds?.has(matched.id)) status = email ? 'sync' : 'onTrip';
    else status = matched ? 'matched' : 'new';
    const eligible = ['new', 'matched', 'update', 'sync'].includes(status);
    if (row.include && eligible) used.add(matched ? `id:${matched.id}` : email ? `email:${email}` : `name:${name}`);
    return { status, matched, eligible };
  });
}

/** Preserve trip-specific fields (including invitation history), filling contact details by stable ID. */
export function mergePeopleIntoTrip(trip: Pick<Trip, "travelers" | "travelerIds">, people: User[], addMissing: boolean): Partial<Trip> {
  const byId = new Map(people.map(user => [user.id, user]));
  const travelers = (trip.travelers || []).map(person => {
    const update = byId.get(person.id);
    return update ? { ...person, ...tripTravelerOf(update), ...(person.avatar ? { avatar: person.avatar } : {}) } : person;
  });
  const have = new Set(travelers.map(person => person.id));
  for (const user of people) {
    if (!have.has(user.id) && (addMissing || trip.travelerIds?.includes(user.id))) {
      travelers.push(tripTravelerOf(user)); have.add(user.id);
    }
  }
  return { travelers, travelerIds: [...new Set([...(trip.travelerIds || []), ...travelers.map(person => person.id)])] };
}
