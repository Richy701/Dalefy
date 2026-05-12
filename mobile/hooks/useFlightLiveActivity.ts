import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useTrips } from "@/context/TripsContext";
import { usePreferences } from "@/context/PreferencesContext";
import type { TravelEvent } from "@/shared/types";
import type { FlightTrackerProps } from "@/widgets/FlightTracker";

// Lazy-load to avoid crash on Android / Expo Go
let FlightTracker: any = null;
try {
  FlightTracker = require("@/widgets/FlightTracker").default;
} catch {
  /* not available */
}

type LiveActivityRef = {
  eventId: string;
  activity: any; // LiveActivity<FlightTrackerProps>
};

const API_BASE = "https://dafadventures.com";

/** Cache so we only fetch once per flight per session */
const airportCache = new Map<string, { from: string; to: string }>();

async function fetchAirportCodes(flightNum: string, date: string): Promise<{ from: string; to: string } | null> {
  const key = `${flightNum}:${date}`;
  if (airportCache.has(key)) return airportCache.get(key)!;
  try {
    const clean = flightNum.replace(/\s+/g, "");
    const url = `${API_BASE}/api/flight-number?number=${clean}&date=${date}`;
    console.log("[FlightLiveActivity] Fetching airports:", url);
    const resp = await fetch(url);
    if (!resp.ok) { console.warn("[FlightLiveActivity] API error:", resp.status); return null; }
    const data = await resp.json();
    const f = data.flights?.[0];
    if (!f?.fromCode || !f?.toCode) { console.warn("[FlightLiveActivity] No airport codes in response"); return null; }
    const result = { from: f.fromCode, to: f.toCode };
    console.log("[FlightLiveActivity] Got airports:", result.from, "→", result.to);
    airportCache.set(key, result);
    return result;
  } catch (err) {
    console.warn("[FlightLiveActivity] Fetch failed:", err);
    return null;
  }
}

/** Map destination string to IANA timezone. */
const DEST_TZ: Record<string, string> = {
  seoul: "Asia/Seoul",
  korea: "Asia/Seoul",
  tokyo: "Asia/Tokyo",
  japan: "Asia/Tokyo",
  bangkok: "Asia/Bangkok",
  thailand: "Asia/Bangkok",
  bali: "Asia/Makassar",
  singapore: "Asia/Singapore",
  dubai: "Asia/Dubai",
  istanbul: "Europe/Istanbul",
  turkey: "Europe/Istanbul",
  antalya: "Europe/Istanbul",
  london: "Europe/London",
  paris: "Europe/Paris",
  rome: "Europe/Rome",
  nairobi: "Africa/Nairobi",
  kenya: "Africa/Nairobi",
  "new york": "America/New_York",
  "los angeles": "America/Los_Angeles",
  sydney: "Australia/Sydney",
  amalfi: "Europe/Rome",
  iceland: "Atlantic/Reykjavik",
  reykjavik: "Atlantic/Reykjavik",
  "cape town": "Africa/Johannesburg",
  marrakech: "Africa/Casablanca",
  cancun: "America/Cancun",
  mexico: "America/Mexico_City",
  "hong kong": "Asia/Hong_Kong",
  maldives: "Indian/Maldives",
  mauritius: "Indian/Mauritius",
  fiji: "Pacific/Fiji",
};

function getDestinationTz(destination?: string): string | undefined {
  if (!destination) return undefined;
  const lower = destination.toLowerCase();
  for (const [key, tz] of Object.entries(DEST_TZ)) {
    if (lower.includes(key)) return tz;
  }
  return undefined;
}

/** Get today's date string in a timezone. */
function todayInTz(tz?: string): string {
  const now = new Date();
  if (!tz) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Get tomorrow's date string in a timezone. */
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

const IATA_TZ: Record<string, string> = {
  LHR: "Europe/London", LGW: "Europe/London", STN: "Europe/London", MAN: "Europe/London",
  CDG: "Europe/Paris", ORY: "Europe/Paris", AMS: "Europe/Amsterdam", FRA: "Europe/Berlin",
  FCO: "Europe/Rome", NAP: "Europe/Rome", MAD: "Europe/Madrid", BCN: "Europe/Madrid",
  LIS: "Europe/Lisbon", ZRH: "Europe/Zurich", VIE: "Europe/Vienna", DUB: "Europe/Dublin",
  IST: "Europe/Istanbul", SAW: "Europe/Istanbul", AYT: "Europe/Istanbul",
  KEF: "Atlantic/Reykjavik",
  JFK: "America/New_York", EWR: "America/New_York", LGA: "America/New_York",
  BOS: "America/New_York", MIA: "America/New_York", ATL: "America/New_York",
  ORD: "America/Chicago", DFW: "America/Chicago",
  DEN: "America/Denver",
  LAX: "America/Los_Angeles", SFO: "America/Los_Angeles", SEA: "America/Los_Angeles",
  DXB: "Asia/Dubai", DOH: "Asia/Qatar",
  SIN: "Asia/Singapore", HKG: "Asia/Hong_Kong", BKK: "Asia/Bangkok",
  HND: "Asia/Tokyo", NRT: "Asia/Tokyo", KIX: "Asia/Tokyo",
  ICN: "Asia/Seoul", DPS: "Asia/Makassar",
  SYD: "Australia/Sydney", MEL: "Australia/Melbourne",
  ACC: "Africa/Accra", LOS: "Africa/Lagos", NBO: "Africa/Nairobi",
  MLE: "Indian/Maldives",
};

function getDepAirportCode(ev: TravelEvent): string | null {
  if (ev.depAirport) return ev.depAirport.toUpperCase();
  const locRoute = ev.location?.match(/^([A-Z]{3})\s+to\s+/i);
  if (locRoute) return locRoute[1].toUpperCase();
  return null;
}

function getUtcOffsetMins(tz: string, dateStr: string): number {
  try {
    const d = new Date(dateStr + "T12:00:00Z");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d);
    const localH = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    const localM = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
    const localDay = parseInt(parts.find(p => p.type === "day")?.value || "0", 10);
    const utcDay = d.getUTCDate();
    let offsetMins = (localH * 60 + localM) - (12 * 60);
    if (localDay > utcDay) offsetMins += 1440;
    else if (localDay < utcDay) offsetMins -= 1440;
    return offsetMins;
  } catch { return 0; }
}

function depTimeToMs(ev: TravelEvent): number {
  const depMatch = ev.time?.match(/(\d{1,2}):(\d{2})/);
  if (!depMatch) return new Date(`${ev.date}T23:59:00`).getTime();
  const h = depMatch[1].padStart(2, "0");
  const m = depMatch[2];
  const code = getDepAirportCode(ev);
  const tz = code ? IATA_TZ[code] : undefined;
  if (!tz) return new Date(`${ev.date}T${h}:${m}:00`).getTime();
  const offsetMins = getUtcOffsetMins(tz, ev.date);
  return new Date(`${ev.date}T${h}:${m}:00Z`).getTime() - offsetMins * 60000;
}

function getFlightProgress(ev: TravelEvent): number {
  const depMs = depTimeToMs(ev);
  const durMatch = ev.duration?.match(/(\d+)h\s*(\d+)?/);
  const durMins = durMatch ? parseInt(durMatch[1]) * 60 + parseInt(durMatch[2] || "0") : 0;
  if (durMins <= 0) return 0;
  const arrMs = depMs + durMins * 60000;
  const now = Date.now();
  if (now <= depMs) return 0;
  if (now >= arrMs) return 1;
  return (now - depMs) / (arrMs - depMs);
}

function yesterdayInTz(tz?: string): string {
  const yesterday = new Date(Date.now() - 86400000);
  if (!tz) {
    return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(yesterday);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function eventToProps(ev: TravelEvent): FlightTrackerProps {
  let from = "";
  let to = "";

  // 1. Use IATA codes from API if available
  if (ev.depAirport) from = ev.depAirport;
  if (ev.arrAirport) to = ev.arrAirport;

  // 2. Parse route from location (same as web EventCard) — e.g. "MAN to DOH"
  if (!from || !to) {
    const locRoute = ev.location?.match(/^(.+?)\s+to\s+(.+)$/i);
    if (locRoute) {
      from = from || locRoute[1].trim();
      to = to || locRoute[2].trim();
    }
  }

  // 3. Fall back to title if location didn't have a route
  if (!from || !to) {
    const titleRoute = ev.title?.match(/^(.+?)\s+(?:→|➜|to)\s+(.+)$/i);
    if (titleRoute) {
      from = from || titleRoute[1].trim();
      to = to || titleRoute[2].trim();
    } else if (ev.location && !from) {
      from = ev.location.trim();
    }
  }

  // 4. Shorten to airport codes if they look like full names
  if (from.length > 4) from = from.slice(0, 3).toUpperCase();
  if (to.length > 4) to = to.slice(0, 3).toUpperCase();

  return {
    flightNum: ev.flightNum || ev.title,
    airline: ev.airline || "",
    from: from || "---",
    to: to || "---",
    departTime: ev.time || "",
    arriveTime: ev.endTime || "",
    status: "Scheduled",
    gate: ev.gate || "",
    duration: ev.duration || "",
  };
}

/**
 * Manages iOS Live Activities for today's flights.
 * Starts a live activity when a flight event is happening today,
 * updates it when the event data changes, and ends it when the
 * flight status indicates completion.
 */
/** Safely call a Live Activity method that may return a promise */
function safe(fn: () => unknown) {
  try { Promise.resolve(fn()).catch(() => {}); } catch { /* ignore */ }
}

export function useFlightLiveActivity() {
  const { trips } = useTrips();
  const { prefs } = usePreferences();
  const activityRef = useRef<LiveActivityRef | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios" || !FlightTracker) {
      return;
    }

    if (prefs.liveActivity === false) {
      if (activityRef.current) {
        safe(() => activityRef.current!.activity.end("default"));
        activityRef.current = null;
      }
      return;
    }

    // Collect today's flight events across all trips
    const todayFlights: TravelEvent[] = [];
    const deviceToday = todayInTz(undefined);
    for (const trip of trips) {
      const tz = getDestinationTz(trip.destination);
      const useTripTz = tz && deviceToday > trip.start;
      const today = todayInTz(useTripTz ? tz : undefined);
      const tomorrow = tomorrowInTz(useTripTz ? tz : undefined);
      const yesterday = yesterdayInTz(useTripTz ? tz : undefined);
      const deviceYesterday = yesterdayInTz(undefined);
      for (const ev of trip.events) {
        if (ev.type !== "flight") continue;
        if (ev.date === today || ev.date === tomorrow || ev.date === deviceToday
            || ev.date === yesterday || ev.date === deviceYesterday) {
          todayFlights.push(ev);
        }
      }
    }


    // Find the best flight to show (prefer in-flight, then upcoming, skip arrived)
    const now = Date.now();
    let bestFlight: TravelEvent | null = null;
    for (const ev of todayFlights) {
      const durMatch = ev.duration?.match(/(\d+)h\s*(\d+)?/);
      const durMins = durMatch ? parseInt(durMatch[1]) * 60 + parseInt(durMatch[2] || "0") : 0;
      const depMs = depTimeToMs(ev);
      const arrMs = durMins > 0 ? depMs + durMins * 60000 : depMs + 24 * 3600000;
      if (now > arrMs) continue;
      bestFlight = ev;
      break;
    }

    if (!bestFlight) {
      if (activityRef.current) {
        safe(() => activityRef.current!.activity.end("default"));
        activityRef.current = null;
      }
      return;
    }

    const props = eventToProps(bestFlight);
    props.progress = getFlightProgress(bestFlight);
    const flightRef = bestFlight;

    // Delay start so UpcomingEvent hook's cleanup finishes first
    // (both widgets share the same NativeLiveActivity type)
    const timer = setTimeout(() => {
      // End previous flight activity if switching flights
      if (activityRef.current && activityRef.current.eventId !== flightRef.id) {
        safe(() => activityRef.current!.activity.end("default"));
        activityRef.current = null;
      }

      if (activityRef.current) {
        safe(() => activityRef.current!.activity.update(props));
        return;
      }

      const doStart = (p: FlightTrackerProps) => {
        try {
          const activity = FlightTracker.start(p, `/trip/day?date=${flightRef.date}`);
          activityRef.current = { eventId: flightRef.id, activity };
        } catch {
        }
      };

      if (props.from === "---" || props.to === "---") {
        if (flightRef.flightNum) {
          fetchAirportCodes(flightRef.flightNum, flightRef.date).then(codes => {
            if (codes) { props.from = codes.from; props.to = codes.to; }
            doStart(props);
          });
        } else {
          doStart(props);
        }
      } else {
        doStart(props);
      }
    }, 800);

    return () => {
      clearTimeout(timer);
      if (activityRef.current) {
        safe(() => activityRef.current!.activity.end("default"));
        activityRef.current = null;
      }
    };
  }, [trips, prefs.liveActivity]);
}
