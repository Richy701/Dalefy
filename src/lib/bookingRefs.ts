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

type Leg = Pick<TravelEvent, "id" | "type" | "date" | "endDate" | "depAirport" | "arrAirport">;

/** The events the references list shows: flights and hotels, plus anything else that already has a reference */
export function bookableEvents<T extends Pick<TravelEvent, "type" | "confNumber" | "travelerRefs">>(events: T[]): T[] {
  return events.filter(e => e.type === "flight" || e.type === "hotel" || hasBookingRef(e));
}

const airport = (code?: string) => code?.trim().toUpperCase() || "";
const dayNumber = (date: string) => Math.round(new Date(`${date}T00:00:00Z`).getTime() / 86400000);

/** Whether `next` carries on from `leg`: leaves within a day, from where it landed, and isn't the flight home */
function connects(leg: Leg, next: Leg): boolean {
  const gap = dayNumber(next.date) - dayNumber(leg.endDate || leg.date);
  if (!(gap >= 0 && gap <= 1)) return false;
  const landed = airport(leg.arrAirport), leaves = airport(next.depAirport);
  if (landed && leaves && landed !== leaves) return false;
  const started = airport(leg.depAirport), ends = airport(next.arrAirport);
  return !(started && ends && started === ends);
}

/** The other flights in this flight's connection. `flights` is one person's flights, in trip order. */
export function connectingLegs<T extends Leg>(flights: T[], eventId: string): T[] {
  const at = flights.findIndex(f => f.id === eventId);
  if (at < 0) return [];
  let first = at, last = at;
  while (first > 0 && connects(flights[first - 1], flights[first])) first--;
  while (last < flights.length - 1 && connects(flights[last], flights[last + 1])) last++;
  return flights.slice(first, last + 1).filter(f => f.id !== eventId);
}

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
/** "QR 022", "qr-22" and "QR22" are the same flight */
const flightKey = (flight: string) => flight.toUpperCase().replace(/[\s-]/g, "").replace(/^([A-Z0-9]{2}[A-Z]?)0+(?=\d)/, "$1");

export type RefPasteProblem = "person" | "event" | "not-on-event" | "ambiguous" | "format";

export interface RefPasteResult {
  filled: { eventId: string; travellerId: string; ref: string }[];
  skipped: { line: string; problem: RefPasteProblem }[];
}

/**
 * Rows pasted from a spreadsheet: person, flight number (or event title), reference. Only an exact match is filled,
 * because a reference given to the wrong person is someone else's booking. Everything else is reported, never guessed.
 */
export function parseRefsPaste(
  text: string,
  events: Pick<TravelEvent, "id" | "title" | "flightNum" | "assignedTo">[],
  travellers: Pick<User, "id" | "name">[],
): RefPasteResult {
  const result: RefPasteResult = { filled: [], skipped: [] };
  text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach((line, index) => {
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map(cell => cell.trim());
    if (index === 0 && /\b(pnr|ref|reference|booking|flight|name|traveller|traveler|passenger)\b/i.test(line) && !travellers.some(t => nameKey(t.name) === nameKey(cells[0]))) return;
    const [name, target, ref] = cells;
    if (cells.length !== 3 || !name || !target || !ref) { result.skipped.push({ line, problem: "format" }); return; }
    const people = travellers.filter(t => nameKey(t.name) === nameKey(name));
    if (people.length === 0) { result.skipped.push({ line, problem: "person" }); return; }
    if (people.length > 1) { result.skipped.push({ line, problem: "ambiguous" }); return; }
    const named = events.filter(e => (e.flightNum && flightKey(e.flightNum) === flightKey(target)) || nameKey(e.title) === nameKey(target));
    if (named.length === 0) { result.skipped.push({ line, problem: "event" }); return; }
    const theirs = named.filter(e => !e.assignedTo?.length || e.assignedTo.includes(people[0].id));
    if (theirs.length === 0) { result.skipped.push({ line, problem: "not-on-event" }); return; }
    if (theirs.length > 1) { result.skipped.push({ line, problem: "ambiguous" }); return; }
    result.filled.push({ eventId: theirs[0].id, travellerId: people[0].id, ref });
  });
  return result;
}
