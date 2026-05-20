import { useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";
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

const API_BASE = process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app";

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

import {
  IATA_TZ, getDestinationTz, getUtcOffsetMins,
  todayInTz, tomorrowInTz, yesterdayInTz,
} from "@/shared/timezones";

function getDepAirportCode(ev: TravelEvent): string | null {
  if (ev.depAirport) return ev.depAirport.toUpperCase();
  const locRoute = ev.location?.match(/^([A-Z]{3})\s+to\s+/i);
  if (locRoute) return locRoute[1].toUpperCase();
  return null;
}

function depTimeToMs(ev: TravelEvent): number {
  const depMatch = ev.time?.match(/(\d{1,2}):(\d{2})/);
  if (!depMatch) return new Date(`${ev.date}T23:59:00`).getTime();
  const h = depMatch[1].padStart(2, "0");
  const m = depMatch[2];
  const code = getDepAirportCode(ev);
  const tz = ev.depTz || (code ? IATA_TZ[code] : undefined);
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
  const startingRef = useRef<string | null>(null);
  const tripsRef = useRef(trips);
  tripsRef.current = trips;
  const updateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios" || !FlightTracker) return;

    if (prefs.liveActivity === false) {
      startingRef.current = null;
      if (activityRef.current) {
        safe(() => activityRef.current!.activity.end("default"));
        activityRef.current = null;
      }
      return;
    }

    // Clean up any orphaned activities from previous mount cycles
    try {
      const stale = FlightTracker.getInstances();
      for (const inst of stale) safe(() => inst.end("immediate"));
    } catch {}

    function update() {
      const currentTrips = tripsRef.current;
      const todayFlights: TravelEvent[] = [];
      const deviceToday = todayInTz(undefined);
      for (const trip of currentTrips) {
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

      const now = Date.now();
      let bestFlight: TravelEvent | null = null;
      for (const ev of todayFlights) {
        const st = (ev as any).status?.toLowerCase() ?? "";
        if (st.includes("landed") || st.includes("arrived") || st.includes("cancelled")) continue;
        const durMatch = ev.duration?.match(/(\d+)h\s*(\d+)?/);
        const durMins = durMatch ? parseInt(durMatch[1]) * 60 + parseInt(durMatch[2] || "0") : 0;
        const depMs = depTimeToMs(ev);
        const arrMs = durMins > 0 ? depMs + durMins * 60000 : depMs + 24 * 3600000;
        if (now > arrMs) continue;
        bestFlight = ev;
        break;
      }

      if (!bestFlight) {
        startingRef.current = null;
        if (activityRef.current) {
          safe(() => activityRef.current!.activity.end("default"));
          activityRef.current = null;
        }
        return;
      }

      if (startingRef.current === bestFlight.id) return;

      const props = eventToProps(bestFlight);
      props.progress = getFlightProgress(bestFlight);

      if (activityRef.current && activityRef.current.eventId === bestFlight.id) {
        safe(() => activityRef.current!.activity.update(props));
        return;
      }

      if (activityRef.current) {
        safe(() => activityRef.current!.activity.end("default"));
        activityRef.current = null;
      }

      startingRef.current = bestFlight.id;
      const flight = bestFlight;
      const doStart = (p: FlightTrackerProps) => {
        if (startingRef.current !== flight.id) return;
        try {
          const activity = FlightTracker.start(p, `/trip/day?date=${flight.date}`);
          activityRef.current = { eventId: flight.id, activity };
        } catch {}
        startingRef.current = null;
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

    updateRef.current = update;
    // Delay initial start so UpcomingEvent hook's cleanup finishes first
    const startTimer = setTimeout(update, 800);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    const progressInterval = setInterval(update, 60000);

    return () => {
      clearTimeout(startTimer);
      sub.remove();
      clearInterval(progressInterval);
      updateRef.current = null;
      startingRef.current = null;
      if (activityRef.current) {
        safe(() => activityRef.current!.activity.end("default"));
        activityRef.current = null;
      }
      try {
        const all = FlightTracker.getInstances();
        for (const inst of all) safe(() => inst.end("immediate"));
      } catch {}
    };
  }, [prefs.liveActivity]);

  useEffect(() => {
    updateRef.current?.();
  }, [trips]);
}
