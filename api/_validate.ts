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
