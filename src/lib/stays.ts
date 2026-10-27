import type { TravelEvent, TripInfo } from "@/types";

const DAY = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayOf = (iso: string | undefined): Date | null => {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
const shortDate = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
const key = (e: TravelEvent) => `${e.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${e.checkin ?? e.date}`;

export const isStayCard = (title: string) => /hotel|accommodation|resort|stay|lodg|camp/i.test(title) && !/rooming/i.test(title);

/**
 * "Where you're staying", worked out from the hotel events when the document gave no accommodation
 * section: one line per stay, nights counted from the trip's first night, in the same shape an
 * accommodation card takes ("Night 1: Hotel", "Nights 3–4: Hotel (10–12 Nov)").
 */
export function accommodationFromEvents(events: TravelEvent[], tripStart: string): TripInfo | null {
  const start = dayOf(tripStart);
  const seen = new Set<string>();
  const stays = events
    .filter(e => e.type === "hotel" && e.title.trim())
    .filter(e => { const k = key(e); if (seen.has(k)) return false; seen.add(k); return true; })
    .map(e => ({ e, from: dayOf(e.checkin) ?? dayOf(e.date), to: dayOf(e.checkout) ?? dayOf(e.endDate) }))
    .sort((a, b) => (a.from?.getTime() ?? 0) - (b.from?.getTime() ?? 0));
  if (!stays.length) return null;
  const lines = stays.map(({ e, from, to }) => {
    const first = start && from ? daysBetween(start, from) + 1 : null;
    const nights = from && to ? Math.max(1, daysBetween(from, to)) : 1;
    const label = first === null ? "Stay" : nights > 1 ? `Nights ${first}–${first + nights - 1}` : `Night ${first}`;
    const dates = from && to ? ` (${from.getUTCDate()}–${shortDate(to)})` : from ? ` (${shortDate(from)})` : "";
    return `${label}: ${e.title.trim()}${dates}`;
  });
  return { id: "stays-from-itinerary", title: "Accommodation", body: lines.join("\n") };
}

/** The info list with an accommodation card added when there isn't one but the itinerary has hotels */
export function withAccommodation(info: TripInfo[], events: TravelEvent[], tripStart: string): TripInfo[] {
  if (info.some(i => isStayCard(i.title))) return info;
  const card = accommodationFromEvents(events, tripStart);
  return card ? [...info, card] : info;
}
