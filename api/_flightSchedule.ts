/**
 * Decides which flights the status cron looks up on a given run, and which
 * status changes are worth a push. The cron runs every 15 minutes, so a flight
 * is checked often only around departure, when gates and delays change.
 */
import { airportTz } from "./_airportTz.js";

/** Minutes from midnight for "HH:MM" or "H:MM AM/PM"; null if unparseable. */
export function timeToMins(t: string | undefined): number | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

/** UTC offset of a time zone at a given instant, in ms; null for an unknown zone. */
function tzOffsetMs(tz: string, utcMs: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(utcMs));
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    return asUtc - Math.floor(utcMs / 60_000) * 60_000;
  } catch {
    return null;
  }
}

/**
 * Scheduled departure as a UTC timestamp. Uses the stored departure zone, or
 * the departure airport's zone; without either it assumes UTC, which is close
 * enough for the first lookup to land and backfill the real zone.
 */
export function departureMs(ev: { date?: string; time?: string; depTz?: string; depAirport?: string }): number | null {
  const date = String(ev.date ?? "").slice(0, 10);
  const mins = timeToMins(ev.time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || mins === null) return null;
  const [y, mo, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, mo - 1, d, Math.floor(mins / 60), mins % 60);
  const tz = ev.depTz || (ev.depAirport ? airportTz(ev.depAirport) : null);
  if (!tz) return wall;
  const offset = tzOffsetMs(tz, wall);
  return offset === null ? wall : wall - offset;
}

/** Collapses AeroDataBox statuses into the ones travelers care about. */
export function statusGroup(status: string | undefined): string {
  const s = (status ?? "").toLowerCase().replace(/\s+/g, "");
  if (s.startsWith("cancel")) return "cancelled";
  if (s === "departed" || s === "enroute") return "departed";
  if (s === "arrived" || s === "landed") return "arrived";
  return s;
}

/** Status changes that send a push; the rest (CheckIn, GateClosed, Approaching...) are saved quietly. */
export const NOTIFY_GROUPS = new Set(["delayed", "cancelled", "diverted", "boarding", "departed", "arrived"]);

const H = 60;

/**
 * Whether this run should look the flight up.
 * - 24h to 3h before departure: every 3 hours
 * - 3h before to 1h after departure: every run (15 min)
 * - after that, hourly until it lands (up to 20h)
 * - once landed, two more runs while no baggage belt is posted
 * Flights without a usable date/time keep the old once-a-day check at 06:00 UTC.
 */
export function isDue(
  ev: { date?: string; time?: string; depTz?: string; depAirport?: string; status?: string; arrivedAt?: string; baggageBelt?: string },
  now: Date,
): boolean {
  const group = statusGroup(ev.status);
  if (group === "cancelled") return false;
  if (group === "arrived") {
    // Belts are often posted after landing; arrivedAt is when a run first saw it land
    const since = now.getTime() - Date.parse(ev.arrivedAt ?? "");
    return !ev.baggageBelt && since >= 0 && since <= 35 * 60_000;
  }

  // Run slot: minutes since midnight UTC, so "every N minutes" means slot % N < 15
  // Snapped to the nearest quarter hour, so a run that fires a minute late still counts as its slot
  const slot = Math.round((now.getUTCHours() * 60 + now.getUTCMinutes()) / 15) * 15;
  const dep = departureMs(ev);

  if (dep === null) {
    const day = 864e5;
    const date = String(ev.date ?? "").slice(0, 10);
    const near = [-1, 0, 1].some(o => new Date(now.getTime() + o * day).toISOString().slice(0, 10) === date);
    return near && slot >= 6 * H && slot < 6 * H + 15;
  }

  const minsToDep = (dep - now.getTime()) / 60_000;
  if (minsToDep > 24 * H) return false;
  if (minsToDep > 3 * H) return slot % (3 * H) < 15;
  if (minsToDep >= -1 * H) return true;
  if (minsToDep >= -20 * H) return slot % H < 15;
  return false;
}
