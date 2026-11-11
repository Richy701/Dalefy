import type { TravelEvent, User } from "@/types";
import { flightNumberOf } from "../../api/_flightNumber.ts";

export { flightNumberOf };

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

/**
 * The events the references list shows: flights and hotels, plus anything else that already has a reference.
 * A hotel's overnight is a night in a stay booked on its check-in, so it has no reference of its own to fill.
 */
export function bookableEvents<T extends Pick<TravelEvent, "type" | "confNumber" | "travelerRefs" | "isOvernight">>(events: T[]): T[] {
  return events.filter(e => hasBookingRef(e) || e.type === "flight" || (e.type === "hotel" && !e.isOvernight));
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

/** Case, accents, hyphens and spacing don't make a different person: "José Pérez-Ruiz" is "Jose Perez Ruiz" */
const nameKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[\s-]+/g, " ");
/** "QR 022", "qr-22" and "QR22" are the same flight */
const flightKey = (flight: string) => flight.toUpperCase().replace(/[\s-]/g, "").replace(/^([A-Z0-9]{2}[A-Z]?)0+(?=\d)/, "$1");

const sameFlight = (event: Parameters<typeof flightNumberOf>[0], flight: string) => {
  const number = flightNumberOf(event);
  return !!number && flightKey(number) === flightKey(flight);
};

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
  events: (Pick<TravelEvent, "id" | "title" | "flightNum" | "assignedTo"> & { type?: TravelEvent["type"] })[],
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
    const named = events.filter(e => sameFlight(e, target) || nameKey(e.title) === nameKey(target));
    if (named.length === 0) { result.skipped.push({ line, problem: "event" }); return; }
    const theirs = named.filter(e => !e.assignedTo?.length || e.assignedTo.includes(people[0].id));
    if (theirs.length === 0) { result.skipped.push({ line, problem: "not-on-event" }); return; }
    if (theirs.length > 1) { result.skipped.push({ line, problem: "ambiguous" }); return; }
    result.filled.push({ eventId: theirs[0].id, travellerId: people[0].id, ref });
  });
  return result;
}

/** One passenger on one flight, from a picture or a pasted booking table */
export interface BookingRow { passenger: string; flight: string; bookingRef: string; ticketNumber: string; seat: string }
export interface BookingFill { eventId: string; travellerId: string; ref: string; ticket: string; seat: string }
export interface BookingMatch { filled: BookingFill[]; skipped: { row: BookingRow; problem: RefPasteProblem }[] }

/**
 * Exact matches only, for the same reason as parseRefsPaste: someone else's seat or ticket is worse than a gap.
 * `chosen` is the organiser saying which traveller a name in the table is.
 */
export function matchBookingRows(
  rows: BookingRow[],
  events: (Pick<TravelEvent, "id" | "title" | "flightNum" | "assignedTo"> & { type?: TravelEvent["type"] })[],
  travellers: Pick<User, "id" | "name">[],
  chosen: Record<string, string> = {},
): BookingMatch {
  const result: BookingMatch = { filled: [], skipped: [] };
  for (const row of rows) {
    const clean = { ref: row.bookingRef.trim(), ticket: row.ticketNumber.trim(), seat: row.seat.trim() };
    if (!clean.ref && !clean.ticket && !clean.seat) continue;
    const skip = (problem: RefPasteProblem) => result.skipped.push({ row, problem });
    const people = chosen[row.passenger] ? travellers.filter(t => t.id === chosen[row.passenger]) : travellers.filter(t => nameKey(t.name) === nameKey(row.passenger));
    if (people.length === 0) { skip("person"); continue; }
    if (people.length > 1) { skip("ambiguous"); continue; }
    const named = events.filter(e => sameFlight(e, row.flight) || nameKey(e.title) === nameKey(row.flight));
    if (named.length === 0) { skip("event"); continue; }
    const theirs = named.filter(e => !e.assignedTo?.length || e.assignedTo.includes(people[0].id));
    if (theirs.length === 0) { skip("not-on-event"); continue; }
    if (theirs.length > 1) { skip("ambiguous"); continue; }
    result.filled.push({ eventId: theirs[0].id, travellerId: people[0].id, ...clean });
  }
  return result;
}

/**
 * Who a name in a booking table might be: airlines print middle names and formal names, so "Anthony Howard Griffiths"
 * is often "Tony Griffiths". Only ever a suggestion for the organiser to confirm, and only when one surname fits.
 */
export function suggestTraveller<T extends { name: string }>(name: string, travellers: T[]): T | null {
  const surnameOf = (full: string) => {
    // Airline style puts the surname first: GRIFFITHS/ANTHONY MR
    const words = full.split("/")[0].trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words[words.length - 1] ?? "";
  };
  const surname = surnameOf(name);
  const fits = surname ? travellers.filter(t => surnameOf(t.name) === surname) : [];
  return fits.length === 1 ? fits[0] : null;
}

const FLIGHT_CELL = /^[A-Z0-9]{2}[A-Z]?[\s-]*\d{1,4}$/i;

/**
 * A booking table copied from Excel: a name column, optional reference and ticket columns, and one seat column per
 * flight with the flight number in its heading. Null when the text isn't laid out like that.
 */
export function parseBookingTable(text: string): BookingRow[] | null {
  const lines = text.split(/\r?\n/).map(line => line.split("\t").map(cell => cell.trim()));
  const top = lines.findIndex(cells => cells.length >= 3 && cells.some(cell => /passenger|traveller|traveler|\bname\b/i.test(cell)));
  if (top < 0) return null;
  const headings = lines.slice(top, top + 3);
  const column = (pattern: RegExp) => {
    for (const cells of headings) { const at = cells.findIndex(cell => pattern.test(cell)); if (at >= 0) return at; }
    return -1;
  };
  const name = column(/passenger|traveller|traveler|\bname\b/i), ref = column(/\b(ref|reference|pnr)\b/i), ticket = column(/ticket/i);
  const flights: { at: number; flight: string }[] = [];
  // Heading rows have nothing in the name column below the first; a row with a name is already a passenger
  for (const cells of headings.filter((cells, i) => i === 0 || !cells[name])) cells.forEach((cell, at) => { if (FLIGHT_CELL.test(cell) && !flights.some(f => f.at === at)) flights.push({ at, flight: cell }); });
  if (!flights.length) return null;
  return lines.slice(top + 1).filter(cells => cells[name]).flatMap(cells => flights.map(({ at, flight }) => ({
    passenger: cells[name], flight, bookingRef: cells[ref] ?? "", ticketNumber: cells[ticket] ?? "", seat: cells[at] ?? "",
  })));
}

const TITLE_WORD = /^(mr|mrs|ms|miss|mx|dr|mstr|master|sir|prof|lady|lord)$/;
/**
 * The same person however a hotel writes them: "FARRAGHER/KIERAN MR", "Farragher, Kieran" and "Mr Kieran Farragher"
 * are all "kieran farragher". Titles go on both sides, since the directory has names like "Miss Lisa White".
 */
export function guestKey(name: string): string {
  let n = name.trim();
  const slash = n.split("/");
  if (slash.length === 2) n = `${slash[1]} ${slash[0]}`;
  else { const comma = n.split(","); if (comma.length === 2) n = `${comma[1]} ${comma[0]}`; }
  return nameKey(n.replace(/[.,]/g, " ")).split(" ").filter(w => w && !TITLE_WORD.test(w)).join(" ");
}

const HOTEL_FILLER = new Set(["hotel", "hotels", "the", "and", "resort", "spa", "suites", "by", "at", "de", "la", "le", "&"]);
const hotelWords = (text: string) => new Set(nameKey(text).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 1 && !HOTEL_FILLER.has(w)));
/** How many real words a hotel event's title or address shares with the hotel's name on the confirmation */
const hotelOverlap = (event: Pick<TravelEvent, "title" | "location">, hotel: string) => {
  const have = hotelWords(`${event.title} ${event.location ?? ""}`);
  return [...hotelWords(hotel)].filter(w => have.has(w)).length;
};
/**
 * The events that fit the hotel's name best. A chain shares words across its hotels ("Sun Siyam Iru Fushi",
 * "Sun Siyam Olhuveli"), so only the closest fit counts, and a tie stays a tie for the organiser.
 */
function bestHotels<T extends Pick<TravelEvent, "title" | "location">>(events: T[], hotel: string): T[] {
  const scored = events.map(e => ({ e, score: hotelOverlap(e, hotel) }));
  const top = Math.max(0, ...scored.map(x => x.score));
  return top ? scored.filter(x => x.score === top).map(x => x.e) : [];
}

export type StayProblem = RefPasteProblem | "guests" | "duplicate" | "unread";
export interface StayFile { key: string; guests: string[]; hotel: string; checkIn: string; confirmationNumber: string; email: string }
export interface StayFill { eventId: string; travellerId: string; ref: string; key: string }
export interface StayMatch { filled: StayFill[]; skipped: { file: StayFile; problem: StayProblem }[] }

/**
 * Which traveller and which hotel stay each confirmation belongs to. The person is an exact name (titles and
 * surname-first order aside) or, failing that, an exact email; the stay is the hotel on that check-in date, with the
 * hotel's name to settle a tie. Never a guess: the PDF carries a QR that checks someone in. `chosen` is the organiser
 * saying who a guest name is.
 */
export function matchStays(
  files: StayFile[],
  events: Pick<TravelEvent, "id" | "type" | "title" | "location" | "date" | "assignedTo" | "isOvernight">[],
  travellers: (Pick<User, "id" | "name"> & { email?: string })[],
  chosen: Record<string, string> = {},
): StayMatch {
  const result: StayMatch = { filled: [], skipped: [] };
  // A confirmation belongs to the check-in, never to the overnights after it
  const hotels = events.filter(e => e.type === "hotel" && !e.isOvernight);
  const taken = new Set<string>();
  const byEmail = (email: string) => {
    const wanted = email.trim().toLowerCase();
    return wanted ? travellers.filter(t => t.email?.trim().toLowerCase() === wanted) : [];
  };
  for (const file of files) {
    const skip = (problem: StayProblem) => result.skipped.push({ file, problem });
    const guests = file.guests.map(g => g.trim()).filter(Boolean);
    if (!guests.length) { skip("unread"); continue; }
    if (guests.length > 1) { skip("guests"); continue; }
    const guest = guests[0];
    let people = chosen[guest] ? travellers.filter(t => t.id === chosen[guest]) : travellers.filter(t => guestKey(t.name) === guestKey(guest));
    if (!people.length && !chosen[guest]) people = byEmail(file.email);
    if (people.length === 0) { skip("person"); continue; }
    if (people.length > 1) { skip("ambiguous"); continue; }
    const person = people[0];
    // An email on the booking that belongs to someone else means the name matched the wrong person
    const emailed = byEmail(file.email);
    if (!chosen[guest] && emailed.length && !emailed.some(t => t.id === person.id)) { skip("ambiguous"); continue; }

    const byDate = /^\d{4}-\d{2}-\d{2}$/.test(file.checkIn) ? hotels.filter(e => e.date === file.checkIn) : [];
    let pool = byDate.length ? byDate : bestHotels(hotels, file.hotel);
    if (pool.length > 1) { const named = bestHotels(pool, file.hotel); if (named.length) pool = named; }
    if (!pool.length) { skip("event"); continue; }
    const theirs = pool.filter(e => !e.assignedTo?.length || e.assignedTo.includes(person.id));
    if (theirs.length === 0) { skip("not-on-event"); continue; }
    if (theirs.length > 1) { skip("ambiguous"); continue; }
    const at = `${theirs[0].id}:${person.id}`;
    if (taken.has(at)) { skip("duplicate"); continue; }
    taken.add(at);
    result.filled.push({ eventId: theirs[0].id, travellerId: person.id, ref: file.confirmationNumber.trim(), key: file.key });
  }
  return result;
}
