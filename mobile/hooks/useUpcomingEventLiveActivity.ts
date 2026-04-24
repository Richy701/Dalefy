import { useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";
import { useTrips } from "@/context/TripsContext";
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

function eventToProps(ev: TravelEvent): UpcomingEventProps {
  return {
    title: truncate(ev.title, 40),
    type: ev.type as UpcomingEventProps["type"],
    time: ev.time || "",
    location: truncate(ev.location || "", 40),
    icon: TYPE_ICONS[ev.type] || "calendar",
  };
}

/**
 * Shows the next upcoming non-flight event for today as an iOS Live Activity.
 * Skips flights (those get their own FlightTracker Live Activity).
 * Automatically advances to the next event as each one's time passes.
 */
export function useUpcomingEventLiveActivity() {
  const { trips } = useTrips();
  const activityRef = useRef<{ eventId: string; activity: any } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios" || !UpcomingEvent) return;

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
          try { current.activity.end("default"); } catch { /* ignore */ }
          activityRef.current = null;
        }
        return;
      }

      const props = eventToProps(upcoming);

      if (current) {
        if (current.eventId === upcoming.id) {
          // Same event — just update in case data changed
          try { current.activity.update(props); } catch { /* ignore */ }
        } else {
          // Different event — end old, start new
          try { current.activity.end("default"); } catch { /* ignore */ }
          try {
            const activity = UpcomingEvent.start(props, `/trip/day?date=${upcoming.date}`);
            activityRef.current = { eventId: upcoming.id, activity };
          } catch (err) {
            console.warn("[UpcomingEventLiveActivity] Failed to start:", err);
            activityRef.current = null;
          }
        }
      } else {
        // No active Live Activity — start one
        try {
          const activity = UpcomingEvent.start(props, `/trip/day?date=${upcoming.date}`);
          activityRef.current = { eventId: upcoming.id, activity };
        } catch (err) {
          console.warn("[UpcomingEventLiveActivity] Failed to start:", err);
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
        try { activityRef.current.activity.end("default"); } catch { /* ignore */ }
        activityRef.current = null;
      }
    };
  }, [trips]);
}
