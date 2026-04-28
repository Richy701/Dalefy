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

/** Get "now" in a specific timezone as { dateStr, minutes }. */
function nowInTz(tz?: string): { dateStr: string; minutes: number } {
  const now = new Date();
  if (!tz) {
    return {
      dateStr: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
  // Use Intl to get the current date/time in the destination timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0";
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: parseInt(get("hour")) * 60 + parseInt(get("minute")),
  };
}

/** Minutes remaining until midnight in a timezone. */
function minutesUntilMidnight(tz?: string): number {
  const { minutes } = nowInTz(tz);
  return (24 * 60) - minutes;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 2) + "..." : s;
}

/** Strip redundant type prefixes like "Hotel check-in — " since the type label already shows */
/** Rewrite event titles into clear, natural English for the banner. */
function cleanTitle(title: string): string {
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
  // "Type — details" (Flight, Tour, etc.) → strip prefix, keep details
  const prefixMatch = title.match(/^(Flight|Transfer)\s*[—–]\s*(.*)/i);
  if (prefixMatch) return prefixMatch[2];
  return title;
}

/** Shorten title for Dynamic Island (~24 chars max), returned in CAPS. */
function summarise(title: string): string {
  // Split on em/en dash or colon to get the core action
  const core = title.split(/\s+[—–]\s+|\s*:\s*/)[0].trim();
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
  const cleaned = cleanTitle(ev.title);
  // Location: just the venue name, strip address details after comma
  const shortLocation = (ev.location || "").split(",")[0].trim();
  return {
    title: truncate(cleaned, 36),
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

    // Always clean up stale activities before starting
    try {
      const stale = UpcomingEvent.getInstances();
      if (stale.length > 0) {
        console.log(`[UpcomingEventLA] Cleaning ${stale.length} stale activities`);
        for (const inst of stale) safe(() => inst.end("immediate"));
      }
    } catch { /* ignore */ }

    function update() {
      // Collect today's non-flight events across all trips, sorted by time
      // Use destination timezone so events match local time at the destination
      const todayEvents: TravelEvent[] = [];
      let skipped = 0;
      let tz: string | undefined;

      for (const trip of trips) {
        const tripTz = getDestinationTz(trip.destination);
        const { dateStr: todayStr, minutes: now } = nowInTz(tripTz);

        for (const ev of trip.events) {
          if (ev.date !== todayStr) { skipped++; continue; }
          if (ev.type === "flight") continue; // handled by FlightTracker
          const mins = timeToMinutes(ev.time);
          if (mins < 0) continue; // skip events with unparseable times
          todayEvents.push(ev);
          if (!tz && tripTz) tz = tripTz; // use first matching trip's tz
        }
      }

      const { dateStr: todayStr, minutes: now } = nowInTz(tz);
      console.log(`[UpcomingEventLA] update() today=${todayStr} now=${now}min tz=${tz ?? "device"} found=${todayEvents.length} skipped=${skipped}`);

      todayEvents.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

      // Find next upcoming event (starts in the future or started within the last 30 mins)
      const upcoming = todayEvents.find(ev => {
        const mins = timeToMinutes(ev.time);
        return mins >= now - 30; // show events that started up to 30 mins ago
      });

      // Always end all existing system instances first to prevent stale activities
      try {
        const instances = UpcomingEvent.getInstances();
        if (instances.length > 0) {
          console.log(`[UpcomingEventLA] Ending ${instances.length} existing instances`);
          for (const inst of instances) safe(() => inst.end("immediate"));
        }
      } catch { /* ignore */ }

      if (!upcoming) {
        activityRef.current = null;
        // Schedule re-check at midnight so we pick up tomorrow's events
        if (timerRef.current) clearTimeout(timerRef.current);
        const minsToMid = minutesUntilMidnight(tz);
        timerRef.current = setTimeout(update, (minsToMid + 1) * 60 * 1000);
        return;
      }

      const props = eventToProps(upcoming);

      // Start fresh activity for the current event
      try {
        const activity = UpcomingEvent.start(props, `/trip/day?date=${upcoming.date}`);
        activityRef.current = { eventId: upcoming.id, activity };
        console.log(`[UpcomingEventLA] Started: "${upcoming.title}" date=${upcoming.date}`);
      } catch (err) {
        console.warn("[UpcomingEventLiveActivity] Failed to start:", err);
        activityRef.current = null;
      }

      // Schedule next check: whichever comes first — event window expiry or midnight
      if (timerRef.current) clearTimeout(timerRef.current);
      const eventMins = timeToMinutes(upcoming.time);
      const minsUntilPast = eventMins + 30 - now; // 30 min window
      const minsToMid = minutesUntilMidnight(tz);
      const nextCheck = Math.min(
        minsUntilPast > 0 ? minsUntilPast : Infinity,
        minsToMid + 1, // re-evaluate right after midnight
      );
      if (nextCheck < Infinity) {
        timerRef.current = setTimeout(update, nextCheck * 60 * 1000);
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
