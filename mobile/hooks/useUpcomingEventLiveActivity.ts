import { useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";
import type { useSurfaceTrips } from "./useSurfaceTrips";
import { surfaceCandidates, tripDayUrl } from "@/shared/widgetSchedule";
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
    title: cleaned,
    shortTitle: summarise(cleaned),
    type: ev.type as UpcomingEventProps["type"],
    time: ev.time || "",
    location: shortLocation,
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
export function useUpcomingEventLiveActivity(surface: ReturnType<typeof useSurfaceTrips>) {
  const { trips } = surface;
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
      if (timerRef.current) clearTimeout(timerRef.current);
      const now = Date.now();
      const selected = surfaceCandidates(tripsRef.current, now, false)[0];
      if (!selected) {
        if (activityRef.current) safe(() => activityRef.current!.activity.end("immediate"));
        activityRef.current = null;
      } else {
        const { event, trip, start, end } = selected;
        const key = `${trip.id}:${event.id}`;
        const props = { ...eventToProps(event), startTimestamp: start!, endTimestamp: end! };
        const staleDate = new Date(end!);
        if (activityRef.current?.eventId === key) {
          safe(() => activityRef.current!.activity.update(props, staleDate));
        } else {
          if (activityRef.current) safe(() => activityRef.current!.activity.end("immediate"));
          activityRef.current = null;
          try {
            const activity = UpcomingEvent.start(props, tripDayUrl(trip.id, event.date), staleDate);
            activityRef.current = { eventId: key, activity };
          } catch {}
        }
      }
      timerRef.current = setTimeout(update, 60000);
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
