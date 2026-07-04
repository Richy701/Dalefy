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
