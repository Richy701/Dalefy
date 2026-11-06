/** Shared input validation helpers for API endpoints */
import type { AeroFlight } from "./_flightsCore.js";
import type { ApiResponse } from "./_rateLimit.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IATA_RE = /^[A-Za-z]{3}$/;
const MAX_QUERY = 200;

export function validateDate(val: string | undefined, name: string): string | null {
  if (!val) return `Missing param: ${name}`;
  if (!DATE_RE.test(val)) return `Invalid ${name}: expected YYYY-MM-DD`;
  return null;
}

export function validateIata(val: string | undefined, name: string): string | null {
  if (!val) return `Missing param: ${name}`;
  if (!IATA_RE.test(val)) return `Invalid ${name}: expected 3-letter IATA code`;
  return null;
}

export function validateQuery(val: string | undefined, name = "q"): string | null {
  if (!val) return `Missing param: ${name}`;
  if (val.length > MAX_QUERY) return `${name} too long (max ${MAX_QUERY} chars)`;
  return null;
}

export function validateFlightNum(val: string | undefined): string | null {
  if (!val) return "Missing param: number";
  const clean = val.replace(/\s+/g, "");
  if (clean.length > 10 || !/^[A-Za-z0-9]+$/.test(clean)) return "Invalid flight number";
  return null;
}

/** Require RAPIDAPI_KEY env var — returns the key or sends 500 */
export function requireRapidApi(res: ApiResponse): string | null {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    res.status(500).json({ error: "Server configuration error" });
    return null;
  }
  return key;
}

/** Score an AeroDataBox flight entry by data completeness. Higher = more complete. */
export function scoreAeroFlight(f: AeroFlight): number {
  let s = 0;
  const dep = f.departure ?? {};
  const arr = f.arrival ?? {};
  if (dep.actualTime?.utc) s += 10;
  if (arr.actualTime?.utc) s += 10;
  if (arr.baggageBelt) s += 3;
  if (dep.terminal) s += 1;
  if (dep.gate) s += 1;
  if (arr.terminal) s += 1;
  if (arr.gate) s += 1;
  if (f.aircraft?.model) s += 1;
  const st = (f.status ?? "").toLowerCase();
  if (st.includes("arrived") || st.includes("landed")) s += 5;
  else if (st.includes("departed") || st.includes("boarding")) s += 3;
  return s;
}

/** Pick the most complete flight from an AeroDataBox result array. */
export function pickBestFlight(flights: AeroFlight[]): AeroFlight | null {
  if (flights.length === 0) return null;
  if (flights.length === 1) return flights[0];
  return flights.reduce((best, f) => scoreAeroFlight(f) > scoreAeroFlight(best) ? f : best);
}

/** Match a booked service before considering feed completeness or status. */
export function pickBookedFlight(flights: AeroFlight[], booking: { date: string; time?: string; depAirport?: string; arrAirport?: string }): AeroFlight | null {
  const matches = flights.filter(f => {
    const dep = f.departure;
    if (dep?.scheduledTime?.local?.slice(0, 10) !== booking.date.slice(0, 10)) return false;
    if (booking.depAirport && dep.airport?.iata?.toUpperCase() !== booking.depAirport.toUpperCase()) return false;
    if (booking.arrAirport && f.arrival?.airport?.iata?.toUpperCase() !== booking.arrAirport.toUpperCase()) return false;
    return true;
  });
  // Several legs or services can share a number. Never guess between them.
  const services = new Map<string, AeroFlight[]>();
  for (const f of matches) {
    const key = `${f.departure?.airport?.iata}:${f.arrival?.airport?.iata}:${f.departure?.scheduledTime?.local}`;
    services.set(key, [...(services.get(key) ?? []), f]);
  }
  if (services.size === 1) return pickBestFlight(matches);
  if (booking.time) {
    const m = booking.time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (m) {
      let hour = Number(m[1]);
      if (m[3]) hour = hour % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0);
      const time = `${String(hour).padStart(2, '0')}:${m[2]}`;
      const exact = [...services.values()].filter(group => group[0].departure?.scheduledTime?.local?.slice(11, 16) === time);
      if (exact.length === 1) return pickBestFlight(exact[0]);
    }
  }
  return null;
}

/** Require GOOGLE_API_KEY env var — returns the key or sends 500 */
export function requireGoogleApi(res: ApiResponse): string | null {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    res.status(500).json({ error: "Server configuration error" });
    return null;
  }
  return key;
}
