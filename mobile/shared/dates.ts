/**
 * Date helpers that keep calendar dates on their intended day regardless of the
 * viewer's timezone.
 *
 * A bare "YYYY-MM-DD" passed to `new Date()` is parsed as UTC midnight, which
 * renders as the previous day for anyone west of UTC (all of the Americas).
 * Anchoring date-only strings to local noon keeps them on the right calendar
 * day everywhere. Strings that already carry a time component pass through.
 */

import { timeToMinutes } from "@/shared/timezones";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a trip/event date string in the viewer's local timezone. */
export function parseTripDate(value: string | null | undefined): Date {
  if (!value) return new Date(NaN);
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  return new Date(value);
}

/**
 * Combine an event date ("YYYY-MM-DD") with a time ("HH:MM" or "H:MM AM/PM")
 * into a local Date. Falls back to local noon when the time is missing or
 * unrecognised, so it never returns an Invalid Date for a valid date.
 */
export function parseEventDateTime(date: string, time?: string | null): Date {
  const d = parseTripDate(date);
  if (isNaN(d.getTime())) return d;
  const mins = time ? timeToMinutes(time) : -1;
  d.setHours(0, mins < 0 ? 12 * 60 : mins, 0, 0);
  return d;
}

const TIME_12H = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i;
const TIME_24H = /^\s*(\d{1,2}):(\d{2})\s*$/;

/** "2:00 PM" or "9:05" as "14:00" / "09:05". Anything else ("TBD", blank) comes back unchanged. */
export function to24h(time: string): string {
  const pad = (h: number, m: string) => `${String(h).padStart(2, "0")}:${m}`;
  const m12 = time.match(TIME_12H);
  if (m12) return pad(parseInt(m12[1]) % 12 + (m12[3].toUpperCase() === "PM" ? 12 : 0), m12[2]);
  const m24 = time.match(TIME_24H);
  return m24 ? pad(parseInt(m24[1]), m24[2]) : time;
}

/** The importer saves 12-hour times and the flight lookup 24-hour, so the app shows every event in 24-hour. */
export function withEventTimes24h<T extends { time?: string; endTime?: string }>(events: T[]): T[] {
  return events.map(ev => ({
    ...ev,
    ...(typeof ev.time === "string" ? { time: to24h(ev.time) } : {}),
    ...(typeof ev.endTime === "string" ? { endTime: to24h(ev.endTime) } : {}),
  }));
}
