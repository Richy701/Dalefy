import { useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";
import { useTrips } from "@/context/TripsContext";
import { usePreferences } from "@/context/PreferencesContext";
import type { TravelEvent } from "@/shared/types";
import type { UpcomingEventProps } from "@/widgets/UpcomingEvent";

let UpcomingEvent: any = null;
try {
  UpcomingEvent = require("@/widgets/UpcomingEvent").default;
} catch {
  /* not available */
}

const TYPE_ICONS: Record<string, string> = {
  dining: "fork.knife",
  activity: "safari",
  transfer: "car.fill",
  hotel: "building.2",
  flight: "airplane",
};

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

function isToday(dateStr: string): boolean {
  const now = new Date();
  const d = new Date(dateStr + "T00:00:00");
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 2) + "..." : s;
}

/** Strip redundant type prefixes like "Hotel check-in — " since the type label already shows */
function cleanTitle(title: string): string {
  return title
    .replace(/^Hotel\s+check-?in\s*[—–-]\s*/i, "")
    .replace(/^Flight\s*[—–-]\s*/i, "")
    .replace(/^Transfer\s*[—–-]\s*/i, "")
    .replace(/^Dining\s*[—–-]\s*/i, "");
}

/** Shorten title for Dynamic Island — strip after dash/colon */
function summarise(title: string): string {
  const short = title.split(/\s*[—–\-:]\s*/)[0].trim();
  return truncate(short, 24);
}

function eventToProps(ev: TravelEvent): UpcomingEventProps {
  const cleaned = cleanTitle(ev.title);
  return {
    title: truncate(cleaned, 48),
    shortTitle: summarise(cleaned),
    type: ev.type as UpcomingEventProps["type"],
    time: ev.time || "",
    location: truncate(ev.location || "", 40),
    icon: TYPE_ICONS[ev.type] || "calendar",
  };
}

/** Safely call a Live Activity method that may return a promise */
function safe(fn: () => unknown) {
  try { Promise.resolve(fn()).catch(() => {}); } catch { /* ignore */ }
}

/**
 * Shows the next upcoming non-flight event for today as an iOS Live Activity.
 * Skips flights (those get their own FlightTracker Live Activity).
 * Automatically advances to the next event as each one's time passes.
 */
export function useUpcomingEventLiveActivity() {
  const { trips } = useTrips();
  const { prefs } = usePreferences();
  const activityRef = useRef<{ eventId: string; activity: any } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios" || !UpcomingEvent) return;

    // If Live Activity is disabled, end any active ones and bail
    if (prefs.liveActivity === false) {
      try {
        const instances = UpcomingEvent.getInstances();
        for (const inst of instances) safe(() => inst.end("default"));
      } catch {}
      activityRef.current = null;
      return;
    }

    // Clean up any stale activities from previous sessions on first run
    if (!activityRef.current) {
      try {
        const stale = UpcomingEvent.getInstances();
        for (const inst of stale) safe(() => inst.end("default"));
      } catch { /* ignore */ }
    }

    function update() {
      const now = nowMinutes();

      // Collect today's non-flight events across all trips, sorted by time
      const todayEvents: TravelEvent[] = [];
      for (const trip of trips) {
        for (const ev of trip.events) {
          if (!isToday(ev.date)) continue;
          if (ev.type === "flight") continue; // handled by FlightTracker
          const mins = timeToMinutes(ev.time);
          if (mins < 0) continue; // skip events with unparseable times
          todayEvents.push(ev);
        }
      }

      todayEvents.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

      // Find next upcoming event (starts in the future or started within the last 30 mins)
      const upcoming = todayEvents.find(ev => {
        const mins = timeToMinutes(ev.time);
        return mins >= now - 30; // show events that started up to 30 mins ago
      });

      const current = activityRef.current;

      if (!upcoming) {
        // No upcoming events — end any active Live Activity
        if (current) {
          safe(() => current.activity.end("default"));
          activityRef.current = null;
        }
        return;
      }

      const props = eventToProps(upcoming);

      if (current && current.eventId === upcoming.id) {
        // Same event — just update in case data changed
        safe(() => current.activity.update(props));
      } else {
        // End ALL existing instances to prevent duplicates
        try {
          const instances = UpcomingEvent.getInstances();
          for (const inst of instances) safe(() => inst.end("default"));
        } catch { /* ignore */ }

        // Start fresh
        try {
          const activity = UpcomingEvent.start(props, `/trip/day?date=${upcoming.date}`);
          activityRef.current = { eventId: upcoming.id, activity };
        } catch (err) {
          console.warn("[UpcomingEventLiveActivity] Failed to start:", err);
          activityRef.current = null;
        }
      }

      // Schedule next check: when the current event's time passes, advance to the next
      if (timerRef.current) clearTimeout(timerRef.current);
      const eventMins = timeToMinutes(upcoming.time);
      const minsUntilPast = eventMins + 30 - now; // 30 min window
      if (minsUntilPast > 0) {
        timerRef.current = setTimeout(update, minsUntilPast * 60 * 1000);
      }
    }

    update();

    // Re-check when app comes to foreground
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      sub.remove();
      if (activityRef.current) {
        safe(() => activityRef.current!.activity.end("default"));
        activityRef.current = null;
      }
    };
  }, [trips, prefs.liveActivity]);
}
