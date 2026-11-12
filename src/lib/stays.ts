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

/**
 * The check-in and check-out dates of the stay a hotel night belongs to: its own, else those of the
 * stay at the same hotel that covers its night. "14 Nov", "18 Nov", together "14 to 18 Nov", and as YYYY-MM-DD.
 */
export function stayDates(ev: TravelEvent, events: TravelEvent[] = []): { checkin: string; checkout: string; range: string; from: string; to: string } {
  let from = dayOf(ev.checkin);
  let to = dayOf(ev.checkout);
  const night = dayOf(ev.date);
  if ((!from || !to) && night) {
    const name = ev.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const stay = events.find(e => {
      if (e.id === ev.id || e.type !== "hotel" || e.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() !== name) return false;
      const f = dayOf(e.checkin) ?? dayOf(e.date);
      const t = dayOf(e.checkout);
      return !!f && !!t && f <= night && night <= t;
    });
    if (stay) {
      from = from ?? dayOf(stay.checkin) ?? dayOf(stay.date);
      to = to ?? dayOf(stay.checkout);
    }
  }
  const checkin = from ? shortDate(from) : "";
  const checkout = to ? shortDate(to) : "";
  const range = from && to
    ? from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear() ? `${from.getUTCDate()} to ${checkout}` : `${checkin} to ${checkout}`
    : checkout ? `until ${checkout}` : checkin ? `from ${checkin}` : "";
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  return { checkin, checkout, range, from: iso(from), to: iso(to) };
}

/** The check-in row of the stay a hotel night belongs to, which holds the stay's booking reference and confirmations */
export function stayCheckIn(ev: TravelEvent, events: TravelEvent[]): TravelEvent | null {
  const night = dayOf(ev.date);
  if (!night) return null;
  const name = ev.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return events.find(e => {
    if (e.id === ev.id || e.type !== "hotel" || e.isOvernight || e.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() !== name) return false;
    const f = dayOf(e.checkin) ?? dayOf(e.date);
    const t = dayOf(e.checkout);
    return !!f && !!t && f <= night && night <= t;
  }) ?? null;
}
