import type { TravelEvent } from "@/types";

/** Parse event time ("HH:MM" or "H:MM AM/PM") into total minutes from midnight; null when there is no time (TBD, blank) */
function minutesOf(time: string): number | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + mins;
}

/**
 * One day's events as travellers see them in the app: timed events in time order, while an event with no
 * time (a hotel check-in, "lunch at leisure") keeps the place the organiser gave it in the day, instead of
 * dropping to the end. Ties keep the organiser's order.
 */
export function inDayOrder<T extends Pick<TravelEvent, "time">>(events: T[]): T[] {
  const out = [...events];
  const slots = out.map((e, i) => (minutesOf(e.time || "") === null ? -1 : i)).filter(i => i >= 0);
  const timed = slots.map(i => out[i]).sort((a, b) => minutesOf(a.time || "")! - minutesOf(b.time || "")!);
  slots.forEach((slot, k) => { out[slot] = timed[k]; });
  return out;
}

/** Every event by date, and within a day in the app's order (see inDayOrder) */
export function sortEvents<T extends Pick<TravelEvent, "date" | "time">>(events: T[]): T[] {
  const byDate = new Map<string, T[]>();
  for (const e of events) {
    const day = byDate.get(e.date || "") ?? [];
    day.push(e);
    byDate.set(e.date || "", day);
  }
  return [...byDate.keys()].sort().flatMap(date => inDayOrder(byDate.get(date)!));
}
