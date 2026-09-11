import type { TravelEvent, Trip } from "./types";
import { getDestinationTz, getDepAirportTz, IATA_TZ } from "./timezones";

export function calendarDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function dateInZone(now: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Unknown times stay unknown: a TBD event must never become a noon appointment. */
export function scheduledMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return hour * 60 + minute;
}

/** Convert a wall-clock itinerary time to an instant, including its date's DST offset. */
function eventInstant(date: string, minutes: number, timeZone?: string): number | null {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  if (!timeZone) return new Date(year, month - 1, day, 0, minutes).getTime();
  const target = Date.UTC(year, month - 1, day, 0, minutes);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const parts = formatter.formatToParts(instant);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    if (local === target) return instant;
    instant += target - local;
  }
  return null; // A non-existent local time should not get an invented countdown.
}

export function visibleTodayEvents(events: TravelEvent[], travelerId?: string | null): TravelEvent[] {
  return events.filter(event => !travelerId || !event.assignedTo?.length || event.assignedTo.includes(travelerId));
}

export function selectTodayTrips(trips: Trip[], now: number) {
  const sorted = [...trips].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  const active = sorted.find(t => {
    const today = dateInZone(now, getDestinationTz(t.destination));
    return t.start <= today && t.end >= today;
  }) ?? null;
  const upcoming = active ? null : sorted.find(t => t.start > dateInZone(now, getDestinationTz(t.destination))) ?? null;
  const past = active || upcoming ? null : [...sorted].sort((a, b) => b.end.localeCompare(a.end))[0] ?? null;
  return { active, upcoming, past };
}

export type TodayEventPhase = "unscheduled" | "upcoming" | "current" | "earlier";

export function eventTiming(event: TravelEvent, destinationZone: string | undefined, now: number) {
  const minutes = scheduledMinutes(event.time);
  const timeZone = event.type === "flight" ? getDepAirportTz(event) ?? destinationZone : destinationZone;
  const start = minutes == null ? null : eventInstant(event.date, minutes, timeZone);
  let end: number | null = null;
  const endMinutes = scheduledMinutes(event.endTime ?? "");
  if (start != null && endMinutes != null) {
    const endZone = event.type === "flight" ? event.arrTz ?? IATA_TZ[event.arrAirport ?? ""] ?? destinationZone : destinationZone;
    let endDate = event.endDate || event.date;
    end = eventInstant(endDate, endMinutes, endZone);
    if (!event.endDate && end != null && end < start) {
      endDate = new Date(Date.parse(`${endDate}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      end = eventInstant(endDate, endMinutes, endZone);
    }
  }
  const phase: TodayEventPhase = start == null ? "unscheduled" : start > now ? "upcoming"
    : (end != null && end > now) || now - start < 60_000 ? "current" : "earlier";
  return { start, end, timeZone, phase, minsUntil: start == null ? null : Math.max(0, Math.ceil((start - now) / 60_000)) };
}

export function dayEvents(events: TravelEvent[], today: string, timeZone: string | undefined, now: number) {
  return events.filter(event => {
    const { start, end } = eventTiming(event, timeZone, now);
    const startDate = start == null ? event.date : dateInZone(start, timeZone);
    const endDate = end == null ? startDate : dateInZone(end - 1, timeZone);
    return startDate <= today && endDate >= today;
  }).sort((a, b) => (eventTiming(a, timeZone, now).start ?? Infinity) - (eventTiming(b, timeZone, now).start ?? Infinity));
}

export function currentOrNext(events: TravelEvent[], timeZone: string | undefined, now: number) {
  const timed = events.map(event => ({ event, ...eventTiming(event, timeZone, now) }));
  // An all-day hotel stay should not displace the activity currently taking place.
  return timed.find(item => item.phase === "current" && item.event.type !== "hotel")
    ?? timed.find(item => item.phase === "upcoming") ?? null;
}
