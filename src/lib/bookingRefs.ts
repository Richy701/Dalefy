import type { TravelEvent, User } from "@/types";

type Person = Pick<User, "id" | "name">;

/** Who can have a reference on this event: everyone on an event for the group, else those on it */
export function peopleOnEvent<T extends { id: string }>(event: Pick<TravelEvent, "assignedTo">, travellers: T[]): T[] {
  return event.assignedTo?.length ? travellers.filter(t => event.assignedTo!.includes(t.id)) : travellers;
}

/** What gets saved: trimmed, no blanks, and only people still on the event. Undefined when nothing is left. */
export function cleanTravelerRefs(event: Pick<TravelEvent, "assignedTo" | "travelerRefs">, travellers: { id: string }[]): Record<string, string> | undefined {
  const on = new Set(peopleOnEvent(event, travellers).map(t => t.id));
  const kept = Object.entries(event.travelerRefs ?? {}).map(([id, ref]) => [id, ref.trim()] as const).filter(([id, ref]) => ref && on.has(id));
  return kept.length ? Object.fromEntries(kept) : undefined;
}

/** True when the event has any reference at all, shared or individual */
export function hasBookingRef(event: Pick<TravelEvent, "confNumber" | "travelerRefs">): boolean {
  return !!event.confNumber?.trim() || Object.values(event.travelerRefs ?? {}).some(ref => ref.trim());
}

/** The reference this traveller gets on their phone */
export function refForTraveller(event: Pick<TravelEvent, "confNumber" | "travelerRefs">, travellerId: string): string | undefined {
  return event.travelerRefs?.[travellerId]?.trim() || event.confNumber?.trim() || undefined;
}

/** "Laura Davies ZK91LM", for the organiser's own copies */
export function namedRefs(event: Pick<TravelEvent, "travelerRefs">, travellers: Person[] = []): string[] {
  return Object.entries(event.travelerRefs ?? {}).filter(([, ref]) => ref.trim()).map(([id, ref]) => `${travellers.find(t => t.id === id)?.name ?? "Traveller"} ${ref.trim()}`);
}
