import { parseTripDate } from "./dates";

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export function tripLengthDays(trip: { start: string; end: string }): number {
  return Math.max(1, Math.round((parseTripDate(trip.end).getTime() - parseTripDate(trip.start).getTime()) / 86400000) + 1);
}

/** "Starts in 60 days · 6-day trip", "Day 3 of 6 · Barbados", "Ended 4 days ago · 6-day trip" */
export function tripFactLine(trip: { start: string; end: string; destination?: string }): string {
  const days = daysUntil(trip.start);
  const endDays = daysUntil(trip.end);
  const len = tripLengthDays(trip);
  const lenText = `${len}-day trip`;
  if (endDays < 0) return `Ended ${-endDays === 1 ? "yesterday" : `${-endDays} days ago`} · ${lenText}`;
  if (days <= 0) return `Day ${Math.min(len, 1 - days)} of ${len}${trip.destination ? ` · ${trip.destination}` : ""}`;
  if (days === 0) return `Starts today · ${lenText}`;
  if (days === 1) return `Starts tomorrow · ${lenText}`;
  return `Starts in ${days} days · ${lenText}`;
}

export function shortDay(dateStr: string): string {
  return parseTripDate(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Every calendar day from start to end, inclusive, as YYYY-MM-DD. */
export function tripDays(trip: { start: string; end: string }): string[] {
  const out: string[] = [];
  const d = parseTripDate(trip.start);
  const end = parseTripDate(trip.end);
  while (d <= end) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function todayKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
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

// ── Next event ───────────────────────────────────────────────────────────────
function timeToMinutes(t?: string): number | null {
  if (!t) return null;
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const pm = m[3].toUpperCase() === "PM";
  if (pm && h < 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + parseInt(m[2]);
}

/** The first event that has not started yet, in the device's local time. */
export function nextEvent<E extends { date: string; time: string }>(events: E[], now = new Date()): E | null {
  const today = todayKey();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || ((timeToMinutes(a.time) ?? 720) - (timeToMinutes(b.time) ?? 720)));
  for (const e of sorted) {
    if (e.date > today) return e;
    if (e.date === today) {
      const m = timeToMinutes(e.time);
      if (m == null || m >= nowMin) return e;
    }
  }
  return null;
}

/** "in 40 min", "in 3 h", "Tomorrow", "Sat 7 Nov" */
export function untilLabel(ev: { date: string; time: string }, now = new Date()): string {
  const today = todayKey();
  if (ev.date === today) {
    const m = timeToMinutes(ev.time);
    if (m == null) return "Today";
    const diff = m - (now.getHours() * 60 + now.getMinutes());
    if (diff <= 0) return "Now";
    if (diff < 60) return `in ${diff} min`;
    const h = Math.floor(diff / 60), mm = diff % 60;
    return mm ? `in ${h} h ${mm} min` : `in ${h} h`;
  }
  const d = daysUntil(ev.date);
  if (d === 1) return "Tomorrow";
  if (d < 7) return parseTripDate(ev.date).toLocaleDateString("en-GB", { weekday: "long" });
  return parseTripDate(ev.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
