/** Shared input validation helpers for API endpoints */

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
export function requireRapidApi(res: any): string | null {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    res.status(500).json({ error: "Server configuration error" });
    return null;
  }
  return key;
}

/** Score an AeroDataBox flight entry by data completeness. Higher = more complete. */
export function scoreAeroFlight(f: any): number {
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
export function pickBestFlight(flights: any[]): any | null {
  if (flights.length === 0) return null;
  if (flights.length === 1) return flights[0];
  return flights.reduce((best, f) => scoreAeroFlight(f) > scoreAeroFlight(best) ? f : best);
}

/** Require GOOGLE_API_KEY env var — returns the key or sends 500 */
export function requireGoogleApi(res: any): string | null {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    res.status(500).json({ error: "Server configuration error" });
    return null;
  }
  return key;
}
