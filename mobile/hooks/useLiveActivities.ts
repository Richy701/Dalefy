import { useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";
import { useTrips } from "@/context/TripsContext";
import { usePreferences } from "@/context/PreferencesContext";
import type { TravelEvent } from "@/shared/types";
import type { FlightTrackerProps } from "@/widgets/FlightTracker";
import type { UpcomingEventProps } from "@/widgets/UpcomingEvent";

let FlightTracker: any = null;
try { FlightTracker = require("@/widgets/FlightTracker").default; } catch {}

let UpcomingEvent: any = null;
try { UpcomingEvent = require("@/widgets/UpcomingEvent").default; } catch {}

function safe(fn: () => unknown) {
  try { Promise.resolve(fn()).catch(() => {}); } catch {}
}

const DEST_TZ: Record<string, string> = {
  seoul: "Asia/Seoul", korea: "Asia/Seoul",
  tokyo: "Asia/Tokyo", japan: "Asia/Tokyo",
  bangkok: "Asia/Bangkok", thailand: "Asia/Bangkok",
  bali: "Asia/Makassar", singapore: "Asia/Singapore",
  dubai: "Asia/Dubai",
  istanbul: "Europe/Istanbul", turkey: "Europe/Istanbul", antalya: "Europe/Istanbul",
  london: "Europe/London", paris: "Europe/Paris", rome: "Europe/Rome",
  nairobi: "Africa/Nairobi", kenya: "Africa/Nairobi",
  "new york": "America/New_York", "los angeles": "America/Los_Angeles",
  sydney: "Australia/Sydney", amalfi: "Europe/Rome",
  iceland: "Atlantic/Reykjavik", reykjavik: "Atlantic/Reykjavik",
  "cape town": "Africa/Johannesburg", marrakech: "Africa/Casablanca",
  cancun: "America/Cancun", mexico: "America/Mexico_City",
  "hong kong": "Asia/Hong_Kong", maldives: "Indian/Maldives",
  mauritius: "Indian/Mauritius", fiji: "Pacific/Fiji",
};

function getDestinationTz(destination?: string): string | undefined {
  if (!destination) return undefined;
  const lower = destination.toLowerCase();
  for (const [key, tz] of Object.entries(DEST_TZ)) {
    if (lower.includes(key)) return tz;
  }
  return undefined;
}

function nowInTz(tz?: string): { dateStr: string; minutes: number } {
  const now = new Date();
  if (!tz) {
    return {
      dateStr: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0";
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: parseInt(get("hour")) * 60 + parseInt(get("minute")),
  };
}

function tomorrowInTz(tz?: string): string {
  const tomorrow = new Date(Date.now() + 86400000);
  if (!tz) {
    return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(tomorrow);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function minutesUntilMidnight(tz?: string): number {
  return (24 * 60) - nowInTz(tz).minutes;
}

function timeToMinutes(t: string): number {
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
  const m12 = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m12) return -1;
  let h = parseInt(m12[1]);
  const min = parseInt(m12[2]);
  const pm = m12[3].toUpperCase() === "PM";
  if (pm && h < 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + min;
}

function getFlightProgress(ev: TravelEvent): number {
  const depMatch = ev.time?.match(/(\d{1,2}):(\d{2})/);
  if (!depMatch) return 0;
  const depMs = new Date(`${ev.date}T${depMatch[1].padStart(2, "0")}:${depMatch[2]}:00`).getTime();
  const durMatch = ev.duration?.match(/(\d+)h\s*(\d+)?/);
  const durMins = durMatch ? parseInt(durMatch[1]) * 60 + parseInt(durMatch[2] || "0") : 0;
  if (durMins <= 0) return 0;
  const arrMs = depMs + durMins * 60000;
  const now = Date.now();
  if (now <= depMs) return 0;
  if (now >= arrMs) return 1;
  return (now - depMs) / (arrMs - depMs);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 2) + "..." : s;
}

// ── Flight props ──

const API_BASE = "https://dafadventures.com";
const airportCache = new Map<string, { from: string; to: string }>();

async function fetchAirportCodes(flightNum: string, date: string): Promise<{ from: string; to: string } | null> {
  const key = `${flightNum}:${date}`;
  if (airportCache.has(key)) return airportCache.get(key)!;
  try {
    const clean = flightNum.replace(/\s+/g, "");
    const resp = await fetch(`${API_BASE}/api/flight-number?number=${clean}&date=${date}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const f = data.flights?.[0];
    if (!f?.fromCode || !f?.toCode) return null;
    const result = { from: f.fromCode, to: f.toCode };
    airportCache.set(key, result);
    return result;
  } catch { return null; }
}

function flightToProps(ev: TravelEvent): FlightTrackerProps {
  let from = "";
  let to = "";
  if (ev.depAirport) from = ev.depAirport;
  if (ev.arrAirport) to = ev.arrAirport;
  if (!from || !to) {
    const locRoute = ev.location?.match(/^(.+?)\s+to\s+(.+)$/i);
    if (locRoute) { from = from || locRoute[1].trim(); to = to || locRoute[2].trim(); }
  }
  if (!from || !to) {
    const titleRoute = ev.title?.match(/^(.+?)\s+(?:→|➜|to)\s+(.+)$/i);
    if (titleRoute) { from = from || titleRoute[1].trim(); to = to || titleRoute[2].trim(); }
    else if (ev.location && !from) from = ev.location.trim();
  }
  if (from.length > 4) from = from.slice(0, 3).toUpperCase();
  if (to.length > 4) to = to.slice(0, 3).toUpperCase();
  return {
    flightNum: ev.flightNum || ev.title,
    airline: ev.airline || "",
    from: from || "---", to: to || "---",
    departTime: ev.time || "", arriveTime: ev.endTime || "",
    status: "Scheduled", gate: ev.gate || "", duration: ev.duration || "",
  };
}

// ── Upcoming event props ──

const TYPE_ICONS: Record<string, string> = {
  dining: "fork.knife", activity: "safari", transfer: "car.fill",
  hotel: "building.2", flight: "airplane",
};
const TYPE_PREFIXES: Record<string, string> = {
  flight: "Flight", hotel: "Hotel", activity: "Activity",
  dining: "Dining", transfer: "Transfer",
  car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise",
};

function cleanTitle(title: string, type?: string, transferType?: string): string {
  for (const key of [transferType, type]) {
    const label = TYPE_PREFIXES[key || ""];
    if (label) title = title.replace(new RegExp(`^${label}\\s*[-–·:]\\s*`, "i"), "");
  }
  const checkMatch = title.match(/check-?(in|out)\s*[—–]\s*(.*)/i);
  if (checkMatch) {
    const action = checkMatch[1].toLowerCase() === "out" ? "Check out of" : "Check in to";
    return `${action} ${checkMatch[2]}`;
  }
  const mealMatch = title.match(/^(Dinner|Lunch|Breakfast|Brunch|Welcome Dinner|Farewell Dinner)\s*[—–]\s*(.*)/i);
  if (mealMatch) return `${mealMatch[1]} at ${mealMatch[2]}`;
  const transferMatch = title.match(/(?:transfer|pickup)\s+(?:&\s+transfer\s+)?to\s+(.*)/i);
  if (transferMatch) return `Transfer to ${transferMatch[1]}`;
  title = title.replace(/\s*[-–·:]\s*/g, " — ");
  return title;
}

function summarise(title: string): string {
  const core = title.split(/\s+[—–\-]\s+|\s*:\s*/)[0].trim();
  const short = core
    .replace(/\s+at\s+.*$/i, "").replace(/\s+of\s+.*$/i, "")
    .replace(/\s+to\s+.*$/i, "").replace(/\s+for\s+.*$/i, "")
    .replace(/\s*&\s*.*/i, "").trim();
  return truncate(short, 24).toUpperCase();
}

function eventToProps(ev: TravelEvent): UpcomingEventProps {
  const cleaned = cleanTitle(ev.title, ev.type, ev.transferType);
  const shortLocation = (ev.location || "").split(",")[0].trim();
  return {
    title: truncate(cleaned, 48),
    shortTitle: summarise(cleaned),
    type: ev.type as UpcomingEventProps["type"],
    time: ev.time || "",
    location: truncate(shortLocation, 28),
    icon: TYPE_ICONS[ev.type] || "calendar",
  };
}

// ── Combined hook ──

export function useLiveActivities() {
  const { trips } = useTrips();
  const { prefs } = usePreferences();
  const flightRef = useRef<{ eventId: string; activity: any } | null>(null);
  const eventRef = useRef<{ eventId: string; activity: any } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios" || (!FlightTracker && !UpcomingEvent)) return;

    if (prefs.liveActivity === false) {
      if (flightRef.current) { safe(() => flightRef.current!.activity.end("default")); flightRef.current = null; }
      if (eventRef.current) { safe(() => eventRef.current!.activity.end("default")); eventRef.current = null; }
      return;
    }

    function update() {
      const deviceNow = nowInTz(undefined);
      const deviceToday = deviceNow.dateStr;

      // ── Collect events ──
      const todayFlights: TravelEvent[] = [];
      const todayEvents: TravelEvent[] = [];
      let eventTz: string | undefined;

      for (const trip of trips) {
        const tripTz = getDestinationTz(trip.destination);
        const useTripTz = tripTz && deviceToday > trip.start;
        const { dateStr: today, minutes: _now } = nowInTz(useTripTz ? tripTz : undefined);
        const tomorrow = tomorrowInTz(useTripTz ? tripTz : undefined);

        for (const ev of trip.events) {
          if (ev.type === "flight") {
            if (ev.date === today || ev.date === tomorrow || ev.date === deviceToday) {
              todayFlights.push(ev);
            }
          } else {
            if (ev.date === today) {
              const mins = timeToMinutes(ev.time);
              if (mins >= 0) {
                todayEvents.push(ev);
                if (!eventTz && useTripTz) eventTz = tripTz;
              }
            }
          }
        }
      }

      // ── Find best flight ──
      const now = Date.now();
      let bestFlight: TravelEvent | null = null;
      for (const ev of todayFlights) {
        const durMatch = ev.duration?.match(/(\d+)h\s*(\d+)?/);
        const durMins = durMatch ? parseInt(durMatch[1]) * 60 + parseInt(durMatch[2] || "0") : 0;
        const depMatch = ev.time?.match(/(\d{1,2}):(\d{2})/);
        const depMs = depMatch
          ? new Date(`${ev.date}T${depMatch[1].padStart(2, "0")}:${depMatch[2]}:00`).getTime()
          : new Date(`${ev.date}T23:59:00`).getTime();
        const arrMs = durMins > 0 ? depMs + durMins * 60000 : depMs + 24 * 3600000;
        if (now > arrMs) continue;
        bestFlight = ev;
        break;
      }

      // ── Find upcoming event ──
      const { minutes: nowMins } = nowInTz(eventTz);
      todayEvents.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
      const upcomingEvent = todayEvents.find(ev => {
        const mins = timeToMinutes(ev.time);
        return mins > nowMins - 30 && mins <= nowMins + 60;
      });
      const nextOutsideWindow = todayEvents.find(ev => timeToMinutes(ev.time) > nowMins + 60);

      // ── End previous flight if no longer relevant ──
      if (!bestFlight && flightRef.current) {
        safe(() => flightRef.current!.activity.end("default"));
        flightRef.current = null;
      }

      // ── End previous event ──
      if (eventRef.current) {
        safe(() => eventRef.current!.activity.end("immediate"));
        eventRef.current = null;
      }

      // ── Start upcoming event ──
      if (UpcomingEvent && upcomingEvent) {
        const props = eventToProps(upcomingEvent);
        try {
          const activity = UpcomingEvent.start(props, `/trip/day?date=${upcomingEvent.date}`);
          eventRef.current = { eventId: upcomingEvent.id, activity };
        } catch {}
      }

      // ── Start/update flight ──
      if (FlightTracker && bestFlight) {
        const props = flightToProps(bestFlight);
        props.progress = getFlightProgress(bestFlight);
        const flight = bestFlight;

        const doStart = (p: FlightTrackerProps) => {
          if (flightRef.current && flightRef.current.eventId === flight.id) {
            safe(() => flightRef.current!.activity.update(p));
          } else {
            if (flightRef.current) {
              safe(() => flightRef.current!.activity.end("default"));
              flightRef.current = null;
            }
            try {
              const activity = FlightTracker.start(p, `/trip/day?date=${flight.date}`);
              flightRef.current = { eventId: flight.id, activity };
            } catch {}
          }
        };

        if (props.from === "---" || props.to === "---") {
          if (flight.flightNum) {
            fetchAirportCodes(flight.flightNum, flight.date).then(codes => {
              if (codes) { props.from = codes.from; props.to = codes.to; }
              doStart(props);
            });
          } else {
            doStart(props);
          }
        } else {
          doStart(props);
        }
      }

      // ── Schedule next check ──
      if (timerRef.current) clearTimeout(timerRef.current);
      const minsToMid = minutesUntilMidnight(eventTz);
      const candidates = [minsToMid + 1];
      if (upcomingEvent) {
        const minsUntilPast = timeToMinutes(upcomingEvent.time) + 30 - nowMins;
        candidates.push(minsUntilPast > 0 ? minsUntilPast : 1);
      }
      if (nextOutsideWindow) {
        candidates.push(Math.max(1, timeToMinutes(nextOutsideWindow.time) - 60 - nowMins));
      }
      if (bestFlight) {
        const fp = getFlightProgress(bestFlight);
        if (fp > 0 && fp < 1) candidates.push(2);
      }
      timerRef.current = setTimeout(update, Math.max(1, Math.min(...candidates)) * 60 * 1000);
    }

    update();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      sub.remove();
      if (flightRef.current) { safe(() => flightRef.current!.activity.end("default")); flightRef.current = null; }
      if (eventRef.current) { safe(() => eventRef.current!.activity.end("default")); eventRef.current = null; }
    };
  }, [trips, prefs.liveActivity]);
}
