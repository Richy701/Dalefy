import type { PublishedSnapshot } from "@/types";

type Published = Pick<PublishedSnapshot, "events" | "start" | "end" | "info">;

/** "2:30 PM" and "14:30" are the same time; null when there is none */
function minutes(t?: string): number | null {
  const m = (t ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) h = h % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + Number(m[2]);
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
    const timeChanged = minutes(prev.time) !== minutes(ev.time) || (minutes(ev.time) === null && (prev.time ?? "").trim() !== (ev.time ?? "").trim());
    if (timeChanged || prev.date !== ev.date) changes.push(`${ev.title} has a new time`);
    // The flight status job fills in a flight's route, which is not a move
    else if (ev.type !== "flight" && prev.location !== ev.location) changes.push(`${ev.title} has moved`);
  }

  if (old.start !== next.start || old.end !== next.end) changes.push("The trip dates have changed");
  if (JSON.stringify(stable(old.info ?? [])) !== JSON.stringify(stable(next.info ?? []))) changes.push("Trip info updated");

  return changes;
}
