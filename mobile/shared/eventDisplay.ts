import type { TravelEvent } from "./types";
import { tidyLocation } from "./eventTitle";

// Display-only tidying for timeline rows. The organiser's data is never changed.

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "Secret Dining Room Dinner – Anantara Chiang Mai" over "Anantara Chiang Mai Resort" drops the repeated place */
export function rowTitle(title: string, sub: string): string {
  const parts = title.split(" – ");
  if (parts.length < 2 || !sub) return title;
  const tail = norm(parts[parts.length - 1]);
  const line = norm(sub);
  if (tail.length > 2 && (line.includes(tail) || tail.includes(line))) return parts.slice(0, -1).join(" – ");
  return title;
}

/** A street address read as its area: "123, 1 Charoen Prathet Rd, Tambon Chang Khlan, Amphoe Mueang Chiang Mai, …" is "Chang Khlan, Chiang Mai" */
export function areaOf(address: string): string {
  const parts = address.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length < 3) return address;
  const named = parts
    .filter(p => !/\d/.test(p)) // house numbers, numbered roads, postcodes
    .map(p => p.replace(/^(tambon|amphoe|khet|khwaeng|chang wat|changwat)\s+/i, "").replace(/^mueang\s+/i, "").trim())
    .filter(p => p && !/\b(rd|road|st|street|soi|ave|avenue|lane)\.?$/i.test(p));
  const unique = named.filter((p, i) => named.findIndex(q => norm(q) === norm(p)) === i);
  if (!unique.length) return address;
  return unique.slice(0, 2).join(", ");
}

/** The line under a row's title: transfers say where from (the title says where to), hotels give the area and check-in */
export function rowSub(ev: TravelEvent): string {
  // A night in a stay just says so, the check-in row has the details
  if (ev.type === "hotel" && ev.isOvernight) return "Overnight";
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

/** Everyone's individual booking references, for leaders; a traveller's own arrives as confNumber */
export function travellerRefRows(ev: Pick<TravelEvent, "travelerRefs">, travelers: { id: string; name: string }[] = []): { name: string; ref: string }[] {
  return Object.entries(ev.travelerRefs ?? {}).map(([id, ref]) => ({ name: travelers.find(t => t.id === id)?.name ?? "Traveller", ref }));
}

/** One row per person for leaders: the reference to copy, or failing that the ticket or seat, and the rest beneath the name */
export function travellerBookingRows(ev: Pick<TravelEvent, "travelerRefs" | "travelerSeats" | "travelerTickets">, travelers: { id: string; name: string }[] = []): { name: string; ref: string; detail: string }[] {
  const ids = [...new Set([...Object.keys(ev.travelerRefs ?? {}), ...Object.keys(ev.travelerSeats ?? {}), ...Object.keys(ev.travelerTickets ?? {})])];
  return ids.map(id => {
    const ref = ev.travelerRefs?.[id] ?? "", ticket = ev.travelerTickets?.[id] ?? "", seat = ev.travelerSeats?.[id] ?? "";
    const shown = ref || ticket || seat;
    return {
      name: travelers.find(t => t.id === id)?.name ?? "Traveller",
      ref: shown,
      detail: [seat && seat !== shown ? `Seat ${seat}` : "", ticket && ticket !== shown ? `Ticket ${ticket}` : ""].filter(Boolean).join(", "),
    };
  });
}

/** "4" or "T4" alone doesn't say what it is: "Terminal 4". Names read naturally: "North terminal". */
export function terminalLabel(name: string): string {
  const t = name.trim();
  if (/terminal/i.test(t)) return t;
  return /^(t\s*)?\d+[a-z]?$|^[a-z]$/i.test(t) ? `Terminal ${t.replace(/^t\s*/i, "")}` : `${t} terminal`;
}

const clockMinutes = (time?: string) => {
  const m = (time ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Minutes from one clock time to a later one, across days if needed; null when either isn't a real time or it isn't later */
export function minutesBetween(fromDate: string, fromTime: string | null | undefined, toDate: string, toTime: string | null | undefined): number | null {
  const a = clockMinutes(fromTime ?? ""), b = clockMinutes(toTime ?? "");
  if (a == null || b == null) return null;
  const days = Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
  const gap = days * 1440 + b - a;
  return Number.isFinite(gap) && gap > 0 ? gap : null;
}

export function gapText(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

