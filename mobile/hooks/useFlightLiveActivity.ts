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
    status: ev.status || "Scheduled",
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
  const activitiesRef = useRef<LiveActivityRef[]>([]);
  const didCleanup = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "ios" || !FlightTracker) return;

    // If Live Activity is disabled, end all and bail
    if (prefs.liveActivity === false) {
      for (const r of activitiesRef.current) safe(() => r.activity.end("default"));
      activitiesRef.current = [];
      return;
    }

    // End any stale Live Activities from previous sessions on first run
    if (!didCleanup.current) {
      didCleanup.current = true;
      try {
        const stale = FlightTracker.getInstances();
        for (const a of stale) safe(() => a.end("immediate"));
        console.log(`[FlightLiveActivity] Cleaned up ${stale.length} stale activities`);
      } catch {}
    }

    // Collect today's flight events across all trips (timezone-aware)
    const todayFlights: TravelEvent[] = [];
    for (const trip of trips) {
      const tz = getDestinationTz(trip.destination);
      const today = todayInTz(tz);
      const tomorrow = tomorrowInTz(tz);
      for (const ev of trip.events) {
        if (ev.type !== "flight") continue;
        console.log(`[FlightLiveActivity] Flight: ${ev.flightNum} date=${ev.date} depAirport=${ev.depAirport} arrAirport=${ev.arrAirport} location=${ev.location}`);
        if (ev.date === today || ev.date === tomorrow) {
          todayFlights.push(ev);
        }
      }
    }
    console.log(`[FlightLiveActivity] ${trips.length} trips, ${todayFlights.length} today flights`);

    const current = activitiesRef.current;

    function syncActivity(ev: TravelEvent, props: FlightTrackerProps) {
      const existing = current.find(a => a.eventId === ev.id);
      const status = ev.status?.toLowerCase() ?? "";
      const isEnded = status.includes("landed") || status.includes("arrived") || status.includes("cancel");

      if (existing) {
        if (isEnded) {
          safe(() => existing.activity.end("default", props));
          activitiesRef.current = current.filter(a => a.eventId !== ev.id);
        } else {
          safe(() => existing.activity.update(props));
        }
      } else if (!isEnded) {
        try {
          const activity = FlightTracker.start(props, `/trip/day?date=${ev.date}`);
          activitiesRef.current.push({ eventId: ev.id, activity });
        } catch (err) {
          console.warn("[FlightLiveActivity] Failed to start:", err);
        }
      }
    }

    // Start/update live activities, fetching airport codes from API if missing
    for (const ev of todayFlights) {
      const props = eventToProps(ev);

      if (props.from === "---" || props.to === "---") {
        // Airport codes missing — fetch from API then update
        if (ev.flightNum) {
          fetchAirportCodes(ev.flightNum, ev.date).then(codes => {
            if (codes) {
              props.from = codes.from;
              props.to = codes.to;
            }
            syncActivity(ev, props);
          });
        } else {
          syncActivity(ev, props);
        }
      } else {
        syncActivity(ev, props);
      }
    }

    // End activities for flights no longer in today's list
    const todayIds = new Set(todayFlights.map(e => e.id));
    for (const r of current) {
      if (!todayIds.has(r.eventId)) {
        safe(() => r.activity.end("default"));
        activitiesRef.current = activitiesRef.current.filter(a => a.eventId !== r.eventId);
      }
    }
  }, [trips, prefs.liveActivity]);
}
