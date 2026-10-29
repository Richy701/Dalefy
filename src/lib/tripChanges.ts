import type { PublishedSnapshot } from "@/types";
import { parseTimeInput } from "@/lib/timeInput";
import { parseTripDate } from "@/lib/dates";

type Published = Pick<PublishedSnapshot, "events" | "start" | "end" | "info">;

/** "2:30 PM", "14:30" and "2.30pm" are the same time, and "TBC" is no time, as the event editor saves them */
function sameTime(a?: string, b?: string): boolean {
  const x = parseTimeInput(a), y = parseTimeInput(b);
  return x !== null && y !== null ? x === y : (a ?? "").trim() === (b ?? "").trim();
}

/** The time as travellers read it, "" when it is not confirmed */
const shownTime = (t?: string) => parseTimeInput(t) ?? (t ?? "").trim();

/** "Tue 4 Nov"; the raw value when it is not a date */
function shownDate(d?: string): string {
  const date = parseTripDate(d);
  return isNaN(date.getTime()) ? (d ?? "").trim() : date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** One line for a moved or retimed event: the new date or time, and the old time when there was one */
function timeLine(title: string, prev: { date: string; time?: string }, next: { date: string; time?: string }): string {
  const was = shownTime(prev.time), now = shownTime(next.time);
  if (prev.date !== next.date) return `${title} moved to ${shownDate(next.date)}${now ? `, ${now}` : ""}`;
  if (!now) return `${title} time to be confirmed`;
  return was ? `${title} now ${now}, was ${was}` : `${title} now at ${now}`;
}

/** Field order is not a change: the same cards can come back from storage with their fields listed differently */
const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable((v as Record<string, unknown>)[k])])) : v;

/**
 * What travellers will notice between two published versions, one line each, for the push sent on
 * publish. Flight statuses are left out: the flight status job already sends those as they happen.
 */
export function publishedChanges(old: Published, next: Published): string[] {
  const changes: string[] = [];
  const oldEvents = new Map(old.events.map(e => [e.id, e]));
  const nextEvents = new Map(next.events.map(e => [e.id, e]));

  for (const [id, ev] of nextEvents) {
    if (!oldEvents.has(id)) changes.push(`${ev.title} added`);
  }
  for (const [id, ev] of oldEvents) {
    if (!nextEvents.has(id)) changes.push(`${ev.title} removed`);
  }
  for (const [id, ev] of nextEvents) {
    const prev = oldEvents.get(id);
    if (!prev) continue;
    if (!sameTime(prev.time, ev.time) || prev.date !== ev.date) changes.push(timeLine(ev.title, prev, ev));
    // The flight status job fills in a flight's route, which is not a move
    else if (ev.type !== "flight" && (prev.location ?? "").trim() !== (ev.location ?? "").trim()) {
      changes.push(ev.location?.trim() ? `${ev.title} now at ${ev.location.trim()}` : `${ev.title} location to be confirmed`);
    }
  }

  if (old.start !== next.start || old.end !== next.end) changes.push(`Trip now ${shownDate(next.start)} to ${shownDate(next.end)}`);

  const oldInfo = new Map((old.info ?? []).map(i => [i.id, i]));
  const nextInfo = new Map((next.info ?? []).map(i => [i.id, i]));
  const named = (title?: string) => title?.trim() ? `Trip info: ${title.trim()}` : "Trip info";
  for (const [id, page] of nextInfo) {
    const prev = oldInfo.get(id);
    if (!prev) changes.push(`${named(page.title)} added`);
    else if (JSON.stringify(stable(prev)) !== JSON.stringify(stable(page))) changes.push(`${named(page.title)} updated`);
  }
  for (const [id, page] of oldInfo) {
    if (!nextInfo.has(id)) changes.push(`${named(page.title)} removed`);
  }

  return changes;
}
