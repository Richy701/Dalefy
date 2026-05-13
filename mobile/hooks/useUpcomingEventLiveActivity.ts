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

import { getDestinationTz, nowInTz, timeToMinutes } from "@/shared/timezones";

function minutesUntilMidnight(tz?: string): number {
  const { minutes } = nowInTz(tz);
  return (24 * 60) - minutes;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 2) + "..." : s;
}

/** Strip redundant type prefixes like "Hotel check-in — " since the type label already shows */
/** Rewrite event titles into clear, natural English for the banner. */
function cleanTitle(title: string, type?: string, transferType?: string): string {
  // Strip type prefix first (e.g. "Transfer - Manchester..." or "Flight - ...")
  const TYPE_PREFIXES: Record<string, string> = {
    flight: "Flight", hotel: "Hotel", activity: "Activity",
    dining: "Dining", transfer: "Transfer",
    car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise",
  };
  for (const key of [transferType, type]) {
    const label = TYPE_PREFIXES[key || ""];
    if (label) title = title.replace(new RegExp(`^${label}\\s*[-–·:]\\s*`, "i"), "");
  }
  // "X check-in/out — Venue" → "Check in to Venue" / "Check out of Venue"
  const checkMatch = title.match(/check-?(in|out)\s*[—–]\s*(.*)/i);
  if (checkMatch) {
    const action = checkMatch[1].toLowerCase() === "out" ? "Check out of" : "Check in to";
    return `${action} ${checkMatch[2]}`;
  }
  // "Meal — Restaurant" → "Meal at Restaurant"
  const mealMatch = title.match(/^(Dinner|Lunch|Breakfast|Brunch|Welcome Dinner|Farewell Dinner)\s*[—–]\s*(.*)/i);
  if (mealMatch) return `${mealMatch[1]} at ${mealMatch[2]}`;
  // "X transfer to Y" / "X pickup & transfer to Y" → "Transfer to Y"
  const transferMatch = title.match(/(?:transfer|pickup)\s+(?:&\s+transfer\s+)?to\s+(.*)/i);
  if (transferMatch) return `Transfer to ${transferMatch[1]}`;
  // Normalise internal separators to em-dash
  title = title.replace(/\s*[-–·:]\s*/g, " — ");
  return title;
}

/** Shorten title for Dynamic Island (~24 chars max), returned in CAPS. */
function summarise(title: string): string {
  // Split on em/en dash or colon to get the core action
  const core = title.split(/\s+[—–\-]\s+|\s*:\s*/)[0].trim();
  // Strip trailing venue/detail phrases for brevity
  const short = core
    .replace(/\s+at\s+.*$/i, "")
    .replace(/\s+of\s+.*$/i, "")
    .replace(/\s+to\s+.*$/i, "")
    .replace(/\s+for\s+.*$/i, "")
    .replace(/\s*&\s*.*/i, "")
    .trim();
  return truncate(short, 24).toUpperCase();
}

function eventToProps(ev: TravelEvent): UpcomingEventProps {
  const cleaned = cleanTitle(ev.title, ev.type, ev.transferType);
  // Location: just the venue name, strip address details after comma
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
  const tripsRef = useRef(trips);
  tripsRef.current = trips;
  const updateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios" || !UpcomingEvent) return;

    if (prefs.liveActivity === false) {
      if (activityRef.current) {
        safe(() => activityRef.current!.activity.end("default"));
        activityRef.current = null;
      }
      return;
    }

    // Clean up any orphaned activities from previous mount cycles
    try {
      const stale = UpcomingEvent.getInstances();
      for (const inst of stale) safe(() => inst.end("immediate"));
    } catch {}

    function update() {
      const currentTrips = tripsRef.current;
      const todayEvents: TravelEvent[] = [];
      let tz: string | undefined;
      const deviceToday = nowInTz(undefined).dateStr;

      for (const trip of currentTrips) {
        const tripTz = getDestinationTz(trip.destination);
        const useTripTz = tripTz && deviceToday > trip.start;
        const { dateStr: todayStr } = nowInTz(useTripTz ? tripTz : undefined);

        for (const ev of trip.events) {
          if (ev.date !== todayStr) continue;
          if (ev.type === "flight") continue;
          const mins = timeToMinutes(ev.time);
          if (mins < 0) continue;
          todayEvents.push(ev);
          if (!tz && useTripTz) tz = tripTz;
        }
      }

      const { minutes: now } = nowInTz(tz);
      todayEvents.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

      const upcoming = todayEvents.find(ev => {
        const mins = timeToMinutes(ev.time);
        return mins > now - 30 && mins <= now + 60;
      });

      const nextOutsideWindow = todayEvents.find(ev => timeToMinutes(ev.time) > now + 60);

      if (timerRef.current) clearTimeout(timerRef.current);

      if (!upcoming) {
        if (activityRef.current) {
          safe(() => activityRef.current!.activity.end("immediate"));
          activityRef.current = null;
        }
        const minsToMid = minutesUntilMidnight(tz);
        const wakeIn = nextOutsideWindow
          ? Math.max(1, timeToMinutes(nextOutsideWindow.time) - 60 - now)
          : minsToMid + 1;
        timerRef.current = setTimeout(update, wakeIn * 60 * 1000);
        return;
      }

      // Same event still active — just schedule next check, don't restart
      if (activityRef.current && activityRef.current.eventId === upcoming.id) {
        const eventMins = timeToMinutes(upcoming.time);
        const minsUntilPast = eventMins + 30 - now;
        const minsToMid = minutesUntilMidnight(tz);
        const candidates = [minsToMid + 1];
        if (minsUntilPast > 0) candidates.push(minsUntilPast);
        else candidates.push(1);
        if (nextOutsideWindow) candidates.push(Math.max(1, timeToMinutes(nextOutsideWindow.time) - 60 - now));
        timerRef.current = setTimeout(update, Math.max(1, Math.min(...candidates)) * 60 * 1000);
        return;
      }

      // Different event — end old, start new
      if (activityRef.current) {
        safe(() => activityRef.current!.activity.end("immediate"));
        activityRef.current = null;
      }

      const props = eventToProps(upcoming);
      try {
        const activity = UpcomingEvent.start(props, `/trip/day?date=${upcoming.date}`);
        activityRef.current = { eventId: upcoming.id, activity };
      } catch {
        activityRef.current = null;
      }

      const eventMins = timeToMinutes(upcoming.time);
      const minsUntilPast = eventMins + 30 - now;
      const minsToMid = minutesUntilMidnight(tz);
      const candidates = [minsToMid + 1];
      if (minsUntilPast > 0) candidates.push(minsUntilPast);
      else candidates.push(1);
      if (nextOutsideWindow) candidates.push(Math.max(1, timeToMinutes(nextOutsideWindow.time) - 60 - now));
      timerRef.current = setTimeout(update, Math.max(1, Math.min(...candidates)) * 60 * 1000);
    }

    updateRef.current = update;
    update();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      sub.remove();
      updateRef.current = null;
      if (activityRef.current) {
        safe(() => activityRef.current!.activity.end("default"));
        activityRef.current = null;
      }
      try {
        const all = UpcomingEvent.getInstances();
        for (const inst of all) safe(() => inst.end("immediate"));
      } catch {}
    };
  }, [prefs.liveActivity]);

  useEffect(() => {
    updateRef.current?.();
  }, [trips]);
}
