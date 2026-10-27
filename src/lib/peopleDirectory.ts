import type { User } from '@/types';

/** Combine copies of the same record, never different people who share a name. */
export function combinePeople(copies: User[]): User[] {
  const people = new Map<string, User>();
  for (const person of copies) {
    const previous = people.get(person.id);
    people.set(person.id, previous ? {
      ...previous, ...person,
      email: person.email || previous.email,
      avatar: person.avatar || previous.avatar,
      profile: person.profile || previous.profile,
      compliance: person.compliance?.length ? person.compliance : previous.compliance,
    } : person);
  }
  return [...people.values()];
}

export function removePeopleById(people: User[], ids: ReadonlySet<string>): User[] {
  return people.filter(person => !ids.has(person.id));
}
