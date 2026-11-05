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

/** The event's references, so a new one counts as something to publish */
const bookingRefs = (ev: PublishedSnapshot["events"][number]) => JSON.stringify(stable({
  shared: ev.confNumber?.trim() || "",
  own: Object.fromEntries(Object.entries(ev.travelerRefs ?? {}).filter(([, ref]) => ref.trim()).map(([id, ref]) => [id, ref.trim()])),
}));

const titleWords = (title: string) => new Set(title.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
  .filter(w => w.length > 2 && !["the", "and", "for", "with", "from"].includes(w)));
const plainTitle = (title: string) => [...titleWords(title)].join(" ");
/** The parser rewords titles on every run, so most of the words matching is still the same event */
function similarTitles(a: string, b: string): boolean {
  const x = titleWords(a), y = titleWords(b);
  if (!x.size || !y.size) return false;
  const shared = [...x].filter(w => y.has(w)).length;
  return shared / Math.min(x.size, y.size) >= 0.6;
}

type PublishedEvent = PublishedSnapshot["events"][number];
/**
 * Re-uploading an itinerary gives every event a new id. Events the ids don't connect are paired up by what
 * they are: the same day and title first, then the same day and kind with a like title or the same start time.
 * Anything left over really was added or removed. Returns new id to the old event it continues.
 */
function pairReimported(oldEvents: Map<string, PublishedEvent>, nextEvents: Map<string, PublishedEvent>): Map<string, PublishedEvent> {
  const pairs = new Map<string, PublishedEvent>();
  const spareOld = [...oldEvents.values()].filter(e => !nextEvents.has(e.id));
  const spareNext = [...nextEvents.values()].filter(e => !oldEvents.has(e.id));
  const take = (matches: (prev: PublishedEvent, ev: PublishedEvent) => boolean) => {
    for (const ev of spareNext) {
      if (pairs.has(ev.id)) continue;
      const at = spareOld.findIndex(prev => prev.date === ev.date && matches(prev, ev));
      if (at >= 0) pairs.set(ev.id, spareOld.splice(at, 1)[0]);
    }
  };
  take((prev, ev) => plainTitle(prev.title) === plainTitle(ev.title));
  take((prev, ev) => prev.type === ev.type && similarTitles(prev.title, ev.title));
  take((prev, ev) => prev.type === ev.type && !!parseTimeInput(prev.time) && parseTimeInput(prev.time) === parseTimeInput(ev.time));
  return pairs;
}

/**
 * What travellers will notice between two published versions, one line each, for the push sent on
 * publish. Flight statuses are left out: the flight status job already sends those as they happen.
 */
export function publishedChanges(old: Published, next: Published): string[] {
  const changes: string[] = [];
  const oldEvents = new Map(old.events.map(e => [e.id, e]));
  const nextEvents = new Map(next.events.map(e => [e.id, e]));
  const reimported = pairReimported(oldEvents, nextEvents);
  const continued = new Set([...reimported.values()].map(e => e.id));

  for (const [id, ev] of nextEvents) {
    if (!oldEvents.has(id) && !reimported.has(id)) changes.push(`${ev.title} added`);
  }
  for (const [id, ev] of oldEvents) {
    if (!nextEvents.has(id) && !continued.has(id)) changes.push(`${ev.title} removed`);
  }
  for (const [id, ev] of nextEvents) {
    const prev = oldEvents.get(id) ?? reimported.get(id);
    if (!prev) continue;
    if (plainTitle(prev.title) !== plainTitle(ev.title)) changes.push(`${prev.title} now called ${ev.title}`);
    if (!sameTime(prev.time, ev.time) || prev.date !== ev.date) changes.push(timeLine(ev.title, prev, ev));
    // The flight status job fills in a flight's route, which is not a move
    else if (ev.type !== "flight" && (prev.location ?? "").trim() !== (ev.location ?? "").trim()) {
      changes.push(ev.location?.trim() ? `${ev.title} now at ${ev.location.trim()}` : `${ev.title} location to be confirmed`);
    }
    if (bookingRefs(prev) !== bookingRefs(ev)) changes.push(`${ev.title} booking reference updated`);
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
