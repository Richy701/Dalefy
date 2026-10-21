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
