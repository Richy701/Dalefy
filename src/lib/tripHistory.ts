import type { Trip, TravelEvent, TripHistoryEntry } from "@/types";

const KEEP = 60;
const COALESCE_MS = 2 * 60 * 1000;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const names = (list: Array<{ name: string }>) => list.map(t => t.name).join(", ");

/** Coordinates come from geocoding, not from someone editing the event */
const withoutCoords = (e: TravelEvent) => {
  const rest: Partial<TravelEvent> = { ...e };
  delete rest.locationCoords;
  delete rest.depCoords;
  delete rest.arrCoords;
  return rest;
};
const sameEvent = (a: TravelEvent, b: TravelEvent) => JSON.stringify(withoutCoords(a)) === JSON.stringify(withoutCoords(b));

function describeEvents(before: TravelEvent[], after: TravelEvent[]): string | null {
  const beforeById = new Map(before.map(e => [e.id, e]));
  const afterById = new Map(after.map(e => [e.id, e]));
  const added = after.filter(e => !beforeById.has(e.id));
  const removed = before.filter(e => !afterById.has(e.id));
  const edited = after.filter(e => { const b = beforeById.get(e.id); return b && !sameEvent(b, e); });
  const parts: string[] = [];
  if (added.length === 1) parts.push(`Added ${added[0].title}`);
  else if (added.length > 1) parts.push(`Added ${plural(added.length, "event")}`);
  if (removed.length === 1) parts.push(`Removed ${removed[0].title}`);
  else if (removed.length > 1) parts.push(`Removed ${plural(removed.length, "event")}`);
  if (edited.length === 1) parts.push(`Edited ${edited[0].title}`);
  else if (edited.length > 1) parts.push(`Edited ${plural(edited.length, "event")}`);
  if (parts.length) return parts.join(", ");
  // Same events, different coordinates: the map was filled in
  if (JSON.stringify(before) !== JSON.stringify(after)) return "Geocoded locations";
  return null;
}

/** One line for what an update did, or null when nothing worth recording changed */
export function describeTripChange(before: Trip, updates: Partial<Trip>): string | null {
  const parts: string[] = [];
  if (updates.events && updates.events !== before.events) {
    const line = describeEvents(before.events, updates.events);
    if (line) parts.push(line);
  }
  if (updates.travelers) {
    const was = new Set((before.travelers ?? []).map(t => t.id));
    const now = new Set(updates.travelers.map(t => t.id));
    const added = updates.travelers.filter(t => !was.has(t.id));
    const removed = (before.travelers ?? []).filter(t => !now.has(t.id));
    if (added.length) parts.push(added.length <= 3 ? `Added ${names(added)}` : `Added ${plural(added.length, "traveller")}`);
    if (removed.length) parts.push(removed.length <= 3 ? `Removed ${names(removed)}` : `Removed ${plural(removed.length, "traveller")}`);
  }
  if (updates.status === "Published" && updates.publishedSnapshot) parts.push(before.status === "Published" ? "Published changes" : "Published the trip");
  else if (updates.status && updates.status !== before.status) parts.push(`Marked ${updates.status === "In Progress" ? "active" : updates.status.toLowerCase()}`);
  if ("archivedAt" in updates && !!updates.archivedAt !== !!before.archivedAt) parts.push(updates.archivedAt ? "Archived the trip" : "Unarchived the trip");
  const details: string[] = [];
  if (updates.name !== undefined && updates.name !== before.name) details.push("name");
  if ((updates.start !== undefined && updates.start !== before.start) || (updates.end !== undefined && updates.end !== before.end)) details.push("dates");
  if (updates.destination !== undefined && updates.destination !== before.destination) details.push("destination");
  if ((updates.budget !== undefined && updates.budget !== before.budget) || (updates.currency !== undefined && updates.currency !== before.currency)) details.push("budget");
  if (updates.image !== undefined && updates.image !== before.image) details.push("cover photo");
  if (updates.organizer !== undefined && JSON.stringify(updates.organizer) !== JSON.stringify(before.organizer)) details.push("organiser");
  if (details.length) parts.push(`Changed ${details.join(", ")}`);
  if (updates.info !== undefined && JSON.stringify(updates.info) !== JSON.stringify(before.info)) parts.push("Updated information");
  if (updates.documents !== undefined && JSON.stringify(updates.documents) !== JSON.stringify(before.documents)) parts.push("Updated documents");
  if (updates.tasks !== undefined && JSON.stringify(updates.tasks) !== JSON.stringify(before.tasks)) parts.push("Updated tasks");
  if (updates.media !== undefined && JSON.stringify(updates.media) !== JSON.stringify(before.media)) parts.push("Updated photos");
  return parts.length ? parts.join(". ") : null;
}

/** The trip with this change on the front of its history; a repeat of the last line within two minutes just moves its time */
export function withHistory(trip: Trip, summary: string | null, by: string, now = new Date()): Trip {
  if (!summary) return trip;
  const at = now.toISOString();
  const history = trip.history ?? [];
  const last = history[0];
  if (last && last.by === by && last.summary === summary && now.getTime() - new Date(last.at).getTime() < COALESCE_MS) {
    return { ...trip, history: [{ ...last, at }, ...history.slice(1)] };
  }
  const entry: TripHistoryEntry = { id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at, by, summary };
  return { ...trip, history: [entry, ...history].slice(0, KEEP) };
}
