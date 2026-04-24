import { useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { useTrips } from "@/context/TripsContext";
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

function isToday(dateStr: string): boolean {
  const now = new Date();
  const d = new Date(dateStr + "T00:00:00");
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isTomorrow(dateStr: string): boolean {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const d = new Date(dateStr + "T00:00:00");
  return (
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  );
}

function eventToProps(ev: TravelEvent): FlightTrackerProps {
  let from = "";
  let to = "";

  // 1. Try to parse route from title — handles →, ➜, >, —, -, "to"
  //    e.g. "AYT → STN", "MAN — DOH", "LHR to JFK", "VS209 — Seoul to London (Heathrow)"
  const separators = /\s*(?:→|➜|>|—|-|to)\s+/i;
  const titleParts = ev.title?.split(separators);
  if (titleParts && titleParts.length >= 2) {
    from = titleParts[0].trim();
    to = titleParts[titleParts.length - 1].trim();
  }

  // 2. Fall back to location
  if (!from || !to) {
    const locParts = ev.location?.split(separators);
    if (locParts && locParts.length >= 2) {
      from = from || locParts[0].trim();
      to = to || locParts[locParts.length - 1].trim();
    } else if (ev.location && !from) {
      from = ev.location.trim();
    }
  }

  // 3. Shorten to airport codes if they look like full names
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
export function useFlightLiveActivity() {
  const { trips } = useTrips();
  const activitiesRef = useRef<LiveActivityRef[]>([]);

  useEffect(() => {
    if (Platform.OS !== "ios" || !FlightTracker) return;

    // Collect today's flight events across all trips
    const todayFlights: TravelEvent[] = [];
    for (const trip of trips) {
      for (const ev of trip.events) {
        if (ev.type !== "flight") continue;
        if (isToday(ev.date) || isTomorrow(ev.date)) {
          todayFlights.push(ev);
        }
      }
    }

    const current = activitiesRef.current;

    // Start new live activities for flights not yet tracked
    for (const ev of todayFlights) {
      const existing = current.find(a => a.eventId === ev.id);
      const props = eventToProps(ev);
      const status = ev.status?.toLowerCase() ?? "";
      const isEnded = status.includes("landed") || status.includes("arrived") || status.includes("cancel");

      if (existing) {
        // Update existing activity
        if (isEnded) {
          try {
            existing.activity.end("default", props);
          } catch { /* ignore */ }
          activitiesRef.current = current.filter(a => a.eventId !== ev.id);
        } else {
          try {
            existing.activity.update(props);
          } catch { /* ignore */ }
        }
      } else if (!isEnded) {
        // Start new activity
        try {
          const activity = FlightTracker.start(props, `/trip/day?date=${ev.date}`);
          activitiesRef.current.push({ eventId: ev.id, activity });
        } catch (err) {
          console.warn("[FlightLiveActivity] Failed to start:", err);
        }
      }
    }

    // End activities for flights no longer in today's list
    const todayIds = new Set(todayFlights.map(e => e.id));
    for (const ref of current) {
      if (!todayIds.has(ref.eventId)) {
        try {
          ref.activity.end("default");
        } catch { /* ignore */ }
        activitiesRef.current = activitiesRef.current.filter(a => a.eventId !== ref.eventId);
      }
    }
  }, [trips]);
}
