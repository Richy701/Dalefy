/**
 * Date helpers that keep calendar dates on their intended day regardless of the
 * viewer's timezone.
 *
 * A bare "YYYY-MM-DD" passed to `new Date()` is parsed as UTC midnight, which
 * renders as the previous day for anyone west of UTC (all of the Americas).
 * Anchoring date-only strings to local noon keeps them on the right calendar
 * day everywhere. Strings that already carry a time component pass through.
 */

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

/** Minutes from midnight for "HH:MM" or "H:MM AM/PM"; null if unparseable. */
function parseClock(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

/**
 * Combine an event date ("YYYY-MM-DD") with a time ("HH:MM" or "H:MM AM/PM")
 * into a local Date. Falls back to local noon when the time is missing or
 * unrecognised, so it never returns an Invalid Date for a valid date — unlike
 * `new Date(`${date}T${time}`)`, which yields NaN for "H:MM AM/PM" times.
 */
export function parseEventDateTime(date: string, time?: string | null): Date {
  const d = parseTripDate(date);
  if (isNaN(d.getTime())) return d;
  const mins = parseClock(time);
  d.setHours(0, mins == null ? 12 * 60 : mins, 0, 0);
  return d;
}
