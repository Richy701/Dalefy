import { parseTripDate } from "./dates";

export function daysUntil(dateStr: string, from?: string): number {
  const target = parseTripDate(dateStr);
  const now = from ? parseTripDate(from) : new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export function tripLengthDays(trip: { start: string; end: string }): number {
  return Math.max(1, Math.round((parseTripDate(trip.end).getTime() - parseTripDate(trip.start).getTime()) / 86400000) + 1);
}

/** "Starts in 60 days · 6-day trip", "Day 3 of 6", "Ended 4 days ago · 6-day trip" */
export function tripFactLine(trip: { start: string; end: string }, from?: string): string {
  const days = daysUntil(trip.start, from);
  const endDays = daysUntil(trip.end, from);
  const len = tripLengthDays(trip);
  const lenText = `${len}-day trip`;
  if (endDays < 0) return `Ended ${-endDays === 1 ? "yesterday" : `${-endDays} days ago`} · ${lenText}`;
  if (days <= 0) return `Day ${Math.min(len, 1 - days)} of ${len}`;
  if (days === 1) return `Starts tomorrow · ${lenText}`;
  return `Starts in ${days} days · ${lenText}`;
}

export function shortDay(dateStr: string): string {
  return parseTripDate(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ── Destination flag ─────────────────────────────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  thailand: "TH", barbados: "BB", singapore: "SG", "south korea": "KR", korea: "KR", seoul: "KR",
  france: "FR", paris: "FR", italy: "IT", rome: "IT", spain: "ES", portugal: "PT", greece: "GR",
  "united kingdom": "GB", uk: "GB", england: "GB", london: "GB", scotland: "GB", ireland: "IE", dublin: "IE",
  germany: "DE", berlin: "DE", netherlands: "NL", amsterdam: "NL", belgium: "BE", switzerland: "CH",
  austria: "AT", vienna: "AT", "czech republic": "CZ", prague: "CZ", poland: "PL", croatia: "HR", turkey: "TR", istanbul: "TR",
  "united states": "US", usa: "US", "new york": "US", miami: "US", "los angeles": "US", "las vegas": "US", orlando: "US",
  canada: "CA", mexico: "MX", cancun: "MX", jamaica: "JM", bahamas: "BS", "st lucia": "LC", "saint lucia": "LC",
  antigua: "AG", aruba: "AW", "dominican republic": "DO", cuba: "CU", "costa rica": "CR",
  japan: "JP", tokyo: "JP", china: "CN", "hong kong": "HK", vietnam: "VN", bali: "ID", indonesia: "ID",
  malaysia: "MY", philippines: "PH", india: "IN", "sri lanka": "LK", maldives: "MV", nepal: "NP",
  uae: "AE", dubai: "AE", "abu dhabi": "AE", qatar: "QA", doha: "QA", oman: "OM", egypt: "EG",
  morocco: "MA", marrakech: "MA", kenya: "KE", tanzania: "TZ", "south africa": "ZA", "cape town": "ZA", mauritius: "MU", seychelles: "SC",
  australia: "AU", sydney: "AU", "new zealand": "NZ", fiji: "FJ", brazil: "BR", argentina: "AR", peru: "PE", chile: "CL", colombia: "CO",
  iceland: "IS", norway: "NO", sweden: "SE", denmark: "DK", finland: "FI", cyprus: "CY", malta: "MT", madeira: "PT", tenerife: "ES", mallorca: "ES", ibiza: "ES",
};

/** ISO country code for a destination string, if we can tell which country it is. */
export function destinationCountry(destination?: string): string | null {
  if (!destination) return null;
  const parts = destination.toLowerCase().split(/[,&/·]+|\band\b/).map(s => s.trim()).filter(Boolean);
  // Prefer the last segment ("Chiang Mai & Phuket, Thailand" → "thailand"), then any segment
  for (const p of [...parts].reverse()) {
    const code = COUNTRY_CODES[p];
    if (code) return code;
  }
  return null;
}

/** Emoji flag for the destination's country, if we can tell which country it is. */
export function destinationFlag(destination?: string): string | null {
  const code = destinationCountry(destination);
  return code ? code.toUpperCase().replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt(0))) : null;
}

