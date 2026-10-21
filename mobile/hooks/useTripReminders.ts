import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useTrips } from "@/context/TripsContext";
import { usePreferences } from "@/context/PreferencesContext";
import type { Trip, TravelEvent } from "@/shared/types";
import { parseTripDate } from "@/shared/dates";
import { getDepAirportTz, getDestinationTz, getUtcOffsetMins } from "@/shared/timezones";
import { darkColors } from "@/constants/theme";
import { File, Paths } from "expo-file-system";
import { prepareWidgetImage } from "@/hooks/useWidgetSync";

// Tints the small icon on Android notifications
const NOTIFICATION_ACCENT = darkColors.teal;

let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications");
} catch {
  /* native module not available in Expo Go */
}

const REMINDER_PREFIX = "daf-reminder-";

function deviceTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const DEBOUNCE_MS = 2000;

// ── Friendly airport names ────────────────────────────────────────────────
const AIRPORT_NAMES: Record<string, string> = {
  // UK
  LHR: "London Heathrow", MAN: "Manchester", STN: "London Stansted",
  LGW: "London Gatwick", BHX: "Birmingham", EDI: "Edinburgh",
  GLA: "Glasgow", BRS: "Bristol", LTN: "London Luton",
  // Asia
  ICN: "Seoul Incheon", NRT: "Tokyo Narita", HND: "Tokyo Haneda",
  KIX: "Osaka Kansai", HKG: "Hong Kong", SIN: "Singapore Changi",
  BKK: "Bangkok", KUL: "Kuala Lumpur", MNL: "Manila",
  CGK: "Jakarta", DEL: "Delhi", BOM: "Mumbai",
  PEK: "Beijing", PVG: "Shanghai", TPE: "Taipei",
  // Middle East
  DXB: "Dubai", DOH: "Doha", AUH: "Abu Dhabi",
  // Africa
  NBO: "Nairobi", JNB: "Johannesburg", CPT: "Cape Town",
  // Europe
  CDG: "Paris Charles de Gaulle", AMS: "Amsterdam", FRA: "Frankfurt",
  FCO: "Rome Fiumicino", BCN: "Barcelona", MAD: "Madrid",
  NAP: "Naples", IST: "Istanbul", ATH: "Athens",
  // Americas
  JFK: "New York JFK", LAX: "Los Angeles", ORD: "Chicago O'Hare",
  MIA: "Miami", SFO: "San Francisco", ATL: "Atlanta",
  YYZ: "Toronto", MEX: "Mexico City", GRU: "São Paulo",
  // Oceania
  SYD: "Sydney", MEL: "Melbourne", AKL: "Auckland",
  // Maldives / Indian Ocean
  MLE: "Malé",
};

function friendlyAirport(code: string): string {
  return AIRPORT_NAMES[code.toUpperCase()] ?? code;
}

/** Turn "LHR to ICN" or "MAN to DOH" into "London Heathrow to Seoul Incheon" */
function friendlyRoute(location: string): string {
  const match = location.match(/^([A-Z]{3})\s+to\s+([A-Z]{3})$/i);
  if (match) {
    return `${friendlyAirport(match[1])} to ${friendlyAirport(match[2])}`;
  }
  return location;
}

/** Count nights between two date strings */
function countNights(start: string, end: string): number | null {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return null;
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

/** Find the next event after a given event in chronological order */
function findNextEvent(events: TravelEvent[], afterEvent: TravelEvent, tripDestTz?: string): TravelEvent | null {
  const afterTime = parseEventDateTime(afterEvent, tripDestTz);
  if (!afterTime) return null;

  let closest: TravelEvent | null = null;
  let closestTime = Infinity;

  for (const ev of events) {
    if (ev.id === afterEvent.id) continue;
    const t = parseEventDateTime(ev, tripDestTz);
    if (!t) continue;
    const diff = t.getTime() - afterTime.getTime();
    if (diff > 0 && diff < closestTime) {
      closestTime = diff;
      closest = ev;
    }
  }
  return closest;
}

/** Find the hotel active on a given date */
function findHotelForDate(events: TravelEvent[], date: string): TravelEvent | null {
  return events.find(ev => ev.type === "hotel" && ev.date <= date) ?? null;
}

/**
 * Schedules local push notifications for upcoming trips and events.
 * Includes expanded detail text visible on long-press (iOS) / expand (Android).
 * Uses friendly airport names instead of IATA codes.
 *
 * Debounced to avoid rapid rescheduling on frequent Firestore updates.
 * Respects the tripReminders preference.
 */
export function useTripReminders() {
  const { trips } = useTrips();
  const { prefs } = usePreferences();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tzRef = useRef(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [tz, setTz] = useState(tzRef.current);

  // Detect timezone change when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        const current = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (current !== tzRef.current) {
          tzRef.current = current;
          setTz(current);
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!Notifications || !prefs.tripReminders) {
      if (Notifications && !prefs.tripReminders) {
        cancelAllReminders();
      }
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      scheduleReminders(trips);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [trips, prefs.tripReminders, tz]);
}

async function cancelAllReminders() {
  if (!Notifications) return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (n.identifier.startsWith(REMINDER_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

async function scheduleReminders(trips: Trip[]) {
  if (!Notifications) return;

  await cancelAllReminders();

  const now = Date.now();

  for (const trip of trips) {
    if (trip.status === "Draft") continue;
    // The trip's photo as the notification thumbnail, from the same on-device copy the widget uses
    const photo = await prepareWidgetImage(trip.image || "").catch(() => "");
    const tripDestTz = getDestinationTz(trip.destination);

    // --- Trip starts tomorrow (9 AM day before) ---
    const tripStart = parseDate(trip.start);
    if (tripStart) {
      const dayBefore = new Date(tripStart);
      dayBefore.setDate(dayBefore.getDate() - 1);
      dayBefore.setHours(9, 0, 0, 0);

      if (dayBefore.getTime() > now) {
        const first = firstEventOf(trip);
        const body = first ? `First up: ${first}` : "Your itinerary is ready in the app.";

        await scheduleOne(
          `${REMINDER_PREFIX}trip-${trip.id}`,
          "Your trip starts tomorrow",
          body,
          dayBefore,
          { tripId: trip.id, category: "reminder" },
          trip.name,
          { kind: "trip", photo },
        );
      }

      // --- Trip starts today (8 AM morning of) ---
      const morningOf = new Date(tripStart);
      morningOf.setHours(8, 0, 0, 0);

      if (morningOf.getTime() > now) {
        const first = firstEventOf(trip);
        const body = first ? `First up: ${first}` : "Have a wonderful trip.";

        await scheduleOne(
          `${REMINDER_PREFIX}trip-today-${trip.id}`,
          "Your trip starts today",
          body,
          morningOf,
          { tripId: trip.id, category: "reminder" },
          trip.name,
          { kind: "trip", photo },
        );
      }
    }

    // --- Last day of trip (9 AM) ---
    const tripEnd = parseDate(trip.end);
    if (tripEnd) {
      const lastMorning = new Date(tripEnd);
      lastMorning.setHours(9, 0, 0, 0);

      if (lastMorning.getTime() > now) {
        const lines: string[] = [];
        const hotel = findHotelForDate(trip.events, trip.end);
        if (hotel) lines.push(`Check out of ${hotel.title} by ${hotel.checkout || "11:00 AM"}`);
        const returnFlight = [...trip.events]
          .reverse()
          .find(ev => ev.type === "flight" && ev.date === trip.end);
        if (returnFlight) {
          const label = returnFlight.flightNum || returnFlight.title;
          lines.push(returnFlight.time ? `${label} departs at ${returnFlight.time}` : `${label} departs today`);
        }
        const body = lines.length ? lines.join("\n") : "Leave a little time to pack.";

        await scheduleOne(
          `${REMINDER_PREFIX}trip-end-${trip.id}`,
          "Last day of your trip",
          body,
          lastMorning,
          { tripId: trip.id, category: "reminder" },
          trip.name,
          { kind: "trip", photo },
        );
      }
    }

    // --- Per-event reminders ---
    for (const ev of trip.events) {
      const evDate = parseEventDateTime(ev, tripDestTz);
      if (!evDate || evDate.getTime() <= now) continue;

      if (ev.type === "flight") {
        const remind = new Date(evDate.getTime() - 3 * 60 * 60 * 1000);
        if (remind.getTime() > now) {
          const label = ev.flightNum || ev.title;
          // Where to be first, then the airline and length, then what follows the flight
          const where = [ev.location ? `From ${friendlyRoute(ev.location)}` : null, ev.terminal ? `Terminal ${ev.terminal}` : null, ev.gate ? `Gate ${ev.gate}` : null].filter(Boolean).join(", ");
          const lines = [where || "Time to head to the airport"];
          const details = [ev.airline, ev.duration].filter(Boolean).join(", ");
          if (details) lines.push(details);
          const next = findNextEvent(trip.events, ev, tripDestTz);
          if (next) lines.push(next.time ? `Then ${next.title} at ${next.time}` : `Then ${next.title}`);

          await scheduleOne(
            `${REMINDER_PREFIX}flight-${trip.id}-${ev.id}`,
            `${label} departs in 3 hours`,
            lines.join("\n"),
            remind,
            { tripId: trip.id, category: "reminder", eventId: ev.id, location: ev.location || "" },
            trip.name,
            { kind: "flight", photo, timeSensitive: true },
          );
        }
      }

      if (ev.type === "hotel" && ev.checkin && !ev.title.toLowerCase().includes("check-out") && !ev.title.toLowerCase().includes("checkout")) {
        const checkinDate = parseDate(ev.date);
        if (checkinDate) {
          const todayStr = deviceTodayStr();
          const isToday = ev.date === todayStr;
          if (!isToday) {
            checkinDate.setHours(9, 0, 0, 0);
            if (checkinDate.getTime() > now) {
              const lines = [ev.time ? `${ev.title}, from ${ev.time}` : ev.title];
              if (ev.checkout) lines.push(`Check-out ${ev.checkout}`);
              if (ev.location) lines.push(ev.location);

              await scheduleOne(
                `${REMINDER_PREFIX}hotel-${trip.id}-${ev.id}`,
                "Hotel check-in tomorrow",
                lines.join("\n"),
                checkinDate,
                { tripId: trip.id, category: "reminder", eventId: ev.id, location: ev.location || "" },
                trip.name,
                { kind: "event", photo },
              );
            }
          }
        }
      }

      if (ev.type === "transfer") {
        const remind = new Date(evDate.getTime() - 60 * 60 * 1000);
        if (remind.getTime() > now) {
          const lines = [ev.title];
          if (ev.location) lines.push(`Pickup at ${ev.location}`);
          const next = findNextEvent(trip.events, ev, tripDestTz);
          if (next) lines.push(`Heading to ${next.title}`);

          await scheduleOne(
            `${REMINDER_PREFIX}transfer-${trip.id}-${ev.id}`,
            "Your pickup is in 1 hour",
            lines.join("\n"),
            remind,
            { tripId: trip.id, category: "reminder", eventId: ev.id, location: ev.location || "" },
            trip.name,
            { kind: "event", photo, timeSensitive: true },
          );
        }
      }

      if (ev.type === "activity" || ev.type === "dining") {
        const lower = ev.title.toLowerCase();
        if (lower.includes("free time") || lower.includes("at leisure") || lower.includes("at own leisure")) continue;

        const remind = new Date(evDate.getTime() - 60 * 60 * 1000);
        if (remind.getTime() > now) {
          const body = ev.location || (ev.type === "dining" ? "Your table is booked." : "Starts in an hour.");

          await scheduleOne(
            `${REMINDER_PREFIX}event-${trip.id}-${ev.id}`,
            `${ev.title} in 1 hour`,
            body,
            remind,
            { tripId: trip.id, category: "reminder", eventId: ev.id, location: ev.location || "" },
            trip.name,
            { kind: "event", photo },
          );
        }
      }
    }
  }
}

/** iOS moves an attachment's file into its own store, so each notification gets its own copy of the photo */
function notificationPhoto(path: string, id: string) {
  try {
    const src = new File(path.startsWith("file://") ? path : `file://${path}`);
    if (!src.exists) return null;
    const dest = new File(Paths.cache, `${id}.jpg`);
    if (dest.exists) dest.delete();
    src.copy(dest);
    return [{ identifier: "photo", url: dest.uri, type: null, typeHint: "public.jpeg" }];
  } catch {
    return null;
  }
}

/** "Arrival into Chiang Mai at 08:20", the first thing on the trip's first day */
function firstEventOf(trip: Trip): string | null {
  const firstDay = trip.events.filter(ev => ev.date === trip.start);
  const ev = firstDay.find(e => e.time) ?? firstDay[0];
  if (!ev) return null;
  return ev.time ? `${ev.title} at ${ev.time}` : ev.title;
}

async function scheduleOne(
  id: string,
  title: string,
  body: string,
  date: Date,
  data: Record<string, string>,
  tripName?: string,
  opts: { kind?: "flight" | "event" | "trip"; photo?: string; timeSensitive?: boolean } = {},
) {
  if (!Notifications) return;
  try {
    const attachments = opts.photo ? notificationPhoto(opts.photo, id) : null;
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      // iOS shows the trip as its own line under the title; Android has no subtitle, so the trip leads the body
      content: Platform.OS === "ios"
        ? {
            title, subtitle: tripName, body, data, sound: "default",
            categoryIdentifier: opts.kind,
            // Flights and pickups come through Focus modes once the app has the entitlement
            interruptionLevel: opts.timeSensitive ? "timeSensitive" : "active",
            ...(attachments ? { attachments } : {}),
          }
        : { title, body: tripName ? `${tripName}\n${body}` : body, data, sound: "default", color: NOTIFICATION_ACCENT, categoryIdentifier: opts.kind },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  } catch {
    /* scheduling can fail silently (e.g. date in past due to race) */
  }
}

/** Parse "YYYY-MM-DD" or "MM/DD/YYYY" style date strings. Date-only ISO values
 *  are anchored to local noon so a later setHours() lands on the intended day
 *  in every timezone. */
function parseDate(str: string): Date | null {
  const d = parseTripDate(str);
  return isNaN(d.getTime()) ? null : d;
}

/** Combine event date + time ("HH:MM" or "H:MM AM/PM") into a Date.
 *  Uses event timezone (flights) or trip destination timezone (other types)
 *  so reminders fire at the correct absolute time. */
function parseEventDateTime(ev: TravelEvent, tripDestTz?: string): Date | null {
  const d = parseDate(ev.date);
  if (!d) return null;

  if (ev.time) {
    const match = ev.time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const mins = parseInt(match[2], 10);
      const ampm = match[3]?.toUpperCase();
      if (ampm === "PM" && hours < 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;

      const tz = ev.type === "flight" ? getDepAirportTz(ev) : tripDestTz;
      if (tz) {
        const offsetMins = getUtcOffsetMins(tz, ev.date);
        const h = String(hours).padStart(2, "0");
        const m = String(mins).padStart(2, "0");
        return new Date(new Date(`${ev.date}T${h}:${m}:00Z`).getTime() - offsetMins * 60000);
      }

      d.setHours(hours, mins, 0, 0);
    }
  }

  return d;
}
