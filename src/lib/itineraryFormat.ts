import { parseTripDate } from "@/lib/dates";
import type { TravelEvent } from "@/types";

export const DAY_MS = 86400000;

export function fmtShort(date: string) {
  return parseTripDate(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
export function fmtLong(date: string) {
  return parseTripDate(date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
export function fmtSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function isPlaceholderTime(t?: string) {
  return !t || /^tb[acd]$/i.test(t);
}

/** Only statuses a traveller needs to act on; "Expected" or "Scheduled" just mean nothing has changed. */
export function flightNotice(status?: string): { text: string; className: string } | null {
  const group = (status ?? "").toLowerCase().replace(/\s+/g, "");
  const problem = "font-medium text-red-600 dark:text-red-400";
  if (group.startsWith("cancel")) return { text: "Cancelled", className: problem };
  if (group === "diverted") return { text: "Diverted", className: problem };
  if (group.startsWith("delay")) return { text: "Delayed", className: "font-medium text-amber-700 dark:text-amber-400" };
  if (group === "boarding") return { text: "Boarding", className: "font-medium text-foreground" };
  if (group === "departed" || group === "enroute") return { text: "In the air", className: "font-medium text-foreground" };
  if (group === "arrived" || group === "landed") return { text: "Landed", className: "font-medium text-foreground" };
  return null;
}

/* Display tidying for the phone layout, kept in step with mobile/shared/eventTitle.ts, eventDisplay.ts and tripSummary.ts */

export function tidyTitle(title: string): string {
  return title
    .replace(/\s*\([A-Z]{3}\)\s*$/, "")
    .replace(/\s+[-–—·]\s+|:\s+/g, " – ").replace(/\s+/g, " ").trim();
}

export function tidyLocation(location: string): string {
  return location.replace(/\s*(→|->|⟶|➔)\s*/g, " to ").replace(/\s+/g, " ").trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function areaOf(address: string): string {
  const parts = address.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length < 3) return address;
  const named = parts
    .filter(p => !/\d/.test(p))
    .map(p => p.replace(/^(tambon|amphoe|khet|khwaeng|chang wat|changwat)\s+/i, "").replace(/^mueang\s+/i, "").trim())
    .filter(p => p && !/\b(rd|road|st|street|soi|ave|avenue|lane)\.?$/i.test(p));
  const unique = named.filter((p, i) => named.findIndex(q => norm(q) === norm(p)) === i);
  return unique.length ? unique.slice(0, 2).join(", ") : address;
}

export function rowSub(ev: TravelEvent): string {
  if (!ev.location) return "";
  const loc = tidyLocation(ev.location);
  if (ev.type === "transfer") {
    const route = loc.match(/^(.+?)\s+to\s+(.+)$/i);
    if (route && / to /i.test(ev.title)) return `From ${route[1]}`;
  }
  if (ev.type === "hotel") {
    const checkin = ev.checkin && /^\d{1,2}:\d{2}/.test(ev.checkin) ? `Check-in ${ev.checkin}` : "";
    return [areaOf(loc), checkin].filter(Boolean).join(", ");
  }
  return loc;
}

export function rowTitle(ev: TravelEvent): string {
  const title = tidyTitle(ev.title);
  const parts = title.split(" – ");
  if (ev.type === "hotel") return parts[0];
  const sub = rowSub(ev);
  if (parts.length < 2 || !sub) return title;
  const tail = norm(parts[parts.length - 1]);
  const line = norm(sub);
  return tail.length > 2 && (line.includes(tail) || tail.includes(line)) ? parts.slice(0, -1).join(" – ") : title;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Every calendar day from start to end, inclusive. */
export function tripDays(trip: { start: string; end: string }): string[] {
  const out: string[] = [];
  const d = parseTripDate(trip.start);
  const end = parseTripDate(trip.end);
  while (d <= end) {
    out.push(dayKey(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function toMinutes(t?: string): number | null {
  const m = t?.match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
}

/** The first event that has not started yet, in the reader's local time. */
export function nextEvent(events: TravelEvent[], now: Date): TravelEvent | null {
  const today = dayKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || ((toMinutes(a.time) ?? 720) - (toMinutes(b.time) ?? 720)));
  for (const e of sorted) {
    if (e.date > today) return e;
    if (e.date === today) {
      const m = toMinutes(e.time);
      if (m == null || m >= nowMin) return e;
    }
  }
  return null;
}

export const mapsUrl = (place: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tidyLocation(place))}`;
