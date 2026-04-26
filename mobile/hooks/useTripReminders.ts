import { useEffect, useRef } from "react";
import { useTrips } from "@/context/TripsContext";
import { usePreferences } from "@/context/PreferencesContext";
import type { Trip, TravelEvent } from "@/shared/types";

let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications");
} catch {
  /* native module not available in Expo Go */
}

const REMINDER_PREFIX = "daf-reminder-";
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
function findNextEvent(events: TravelEvent[], afterEvent: TravelEvent): TravelEvent | null {
  const afterTime = parseEventDateTime(afterEvent);
  if (!afterTime) return null;

  let closest: TravelEvent | null = null;
  let closestTime = Infinity;

  for (const ev of events) {
    if (ev.id === afterEvent.id) continue;
    const t = parseEventDateTime(ev);
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
  }, [trips, prefs.tripReminders]);
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

    const firstEvent = trip.events.length > 0 ? trip.events[0] : null;

    // --- Trip starts tomorrow (9 AM day before) ---
    const tripStart = parseDate(trip.start);
    if (tripStart) {
      const dayBefore = new Date(tripStart);
      dayBefore.setDate(dayBefore.getDate() - 1);
      dayBefore.setHours(9, 0, 0, 0);

      if (dayBefore.getTime() > now) {
        let body = `"${trip.name}" starts tomorrow, make sure you're packed!`;
        if (firstEvent) {
          const firstLabel = firstEvent.type === "flight"
            ? `${firstEvent.airline || ""} ${firstEvent.flightNum || firstEvent.title}`.trim()
            : firstEvent.title;
          body += `\nFirst up: ${firstLabel} at ${firstEvent.time}`;
        }

        await scheduleOne(
          `${REMINDER_PREFIX}trip-${trip.id}`,
          "Trip Tomorrow",
          body,
          dayBefore,
          { tripId: trip.id, category: "reminder" },
        );
      }

      // --- Trip starts today (8 AM morning of) ---
      const morningOf = new Date(tripStart);
      morningOf.setHours(8, 0, 0, 0);

      if (morningOf.getTime() > now) {
        let body = `"${trip.name}" starts today, have an amazing time!`;
        if (firstEvent) {
          const firstLabel = firstEvent.type === "flight"
            ? `${firstEvent.airline || ""} ${firstEvent.flightNum || firstEvent.title}`.trim()
            : firstEvent.title;
          const loc = firstEvent.type === "flight" && firstEvent.location
            ? ` from ${friendlyRoute(firstEvent.location).split(" to ")[0]}`
            : "";
          body += `\nFirst up: ${firstLabel} at ${firstEvent.time}${loc}`;
        }

        await scheduleOne(
          `${REMINDER_PREFIX}trip-today-${trip.id}`,
          "Trip Day!",
          body,
          morningOf,
          { tripId: trip.id, category: "reminder" },
        );
      }
    }

    // --- Last day of trip (9 AM) ---
    const tripEnd = parseDate(trip.end);
    if (tripEnd) {
      const lastMorning = new Date(tripEnd);
      lastMorning.setHours(9, 0, 0, 0);

      if (lastMorning.getTime() > now) {
        let body = `"${trip.name}" wraps up today, don't forget to pack and check out!`;
        const hotel = findHotelForDate(trip.events, trip.end);
        if (hotel) {
          const checkout = hotel.checkout || "11:00 AM";
          body += `\nCheck-out: ${checkout} · ${hotel.title}`;
        }
        const returnFlight = [...trip.events]
          .reverse()
          .find(ev => ev.type === "flight" && ev.date === trip.end);
        if (returnFlight) {
          const label = returnFlight.flightNum || returnFlight.title;
          body += `\n${label} departs at ${returnFlight.time}`;
        }

        await scheduleOne(
          `${REMINDER_PREFIX}trip-end-${trip.id}`,
          "Last Day!",
          body,
          lastMorning,
          { tripId: trip.id, category: "reminder" },
        );
      }
    }

    // --- Per-event reminders ---
    for (const ev of trip.events) {
      const evDate = parseEventDateTime(ev);
      if (!evDate || evDate.getTime() <= now) continue;

      if (ev.type === "flight") {
        const remind = new Date(evDate.getTime() - 3 * 60 * 60 * 1000);
        if (remind.getTime() > now) {
          const label = ev.flightNum || ev.title;
          const route = ev.location ? friendlyRoute(ev.location) : "the airport";
          const gate = ev.gate ? ` · Gate ${ev.gate}` : "";

          let body = `Departing from ${route}${gate}. Safe travels!`;
          const details: string[] = [];
          if (ev.airline) details.push(ev.airline);
          if (ev.terminal) details.push(`Terminal ${ev.terminal}`);
          if (ev.duration) details.push(ev.duration);
          if (details.length) body += `\n${details.join(" · ")}`;

          // Show what's next after this flight
          const next = findNextEvent(trip.events, ev);
          if (next) {
            body += `\nNext: ${next.title} at ${next.time}`;
          }

          await scheduleOne(
            `${REMINDER_PREFIX}flight-${trip.id}-${ev.id}`,
            `${label} in 3 Hours`,
            body,
            remind,
            { tripId: trip.id, category: "reminder" },
          );
        }
      }

      // Hotel check-in: only schedule for future days (today is covered by Live Activity)
      if (ev.type === "hotel" && ev.checkin) {
        const checkinDate = parseDate(ev.date);
        if (checkinDate) {
          const todayStr = new Date().toISOString().slice(0, 10);
          const isToday = ev.date === todayStr;
          if (!isToday) {
            checkinDate.setHours(9, 0, 0, 0);
            if (checkinDate.getTime() > now) {
              let body = `${ev.title}, check-in is tomorrow${ev.time ? ` at ${ev.time}` : ""}.`;
              if (ev.checkout) body += `\nCheck-out: ${ev.checkout}`;
              if (ev.location) body += `\n${ev.location}`;

              await scheduleOne(
                `${REMINDER_PREFIX}hotel-${trip.id}-${ev.id}`,
                "Hotel Check-in Tomorrow",
                body,
                checkinDate,
                { tripId: trip.id, category: "reminder" },
              );
            }
          }
        }
      }

      if (ev.type === "transfer") {
        const remind = new Date(evDate.getTime() - 60 * 60 * 1000);
        if (remind.getTime() > now) {
          let body = ev.location
            ? `Pickup at ${ev.location}`
            : "Your transfer is coming up, be ready!";
          if (ev.notes) body += `\n${ev.notes}`;
          const next = findNextEvent(trip.events, ev);
          if (next) body += `\nHeading to: ${next.title}`;

          await scheduleOne(
            `${REMINDER_PREFIX}transfer-${trip.id}-${ev.id}`,
            `${ev.title} in 1 Hour`,
            body,
            remind,
            { tripId: trip.id, category: "reminder" },
          );
        }
      }

      if (ev.type === "activity" || ev.type === "dining") {
        const remind = new Date(evDate.getTime() - 60 * 60 * 1000);
        if (remind.getTime() > now) {
          let body = ev.location ? `At ${ev.location}` : "Coming up soon, get ready!";
          if (ev.notes) body += `\n${ev.notes}`;

          await scheduleOne(
            `${REMINDER_PREFIX}event-${trip.id}-${ev.id}`,
            `${ev.title} in 1 Hour`,
            body,
            remind,
            { tripId: trip.id, category: "reminder" },
          );
        }
      }
    }
  }
}

async function scheduleOne(
  id: string,
  title: string,
  body: string,
  date: Date,
  data: Record<string, string>,
) {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body, data, sound: "default" },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  } catch {
    /* scheduling can fail silently (e.g. date in past due to race) */
  }
}

/** Parse "YYYY-MM-DD" or "MM/DD/YYYY" style date strings */
function parseDate(str: string): Date | null {
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/** Combine event date + time ("HH:MM" or "H:MM AM/PM") into a Date */
function parseEventDateTime(ev: TravelEvent): Date | null {
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
      d.setHours(hours, mins, 0, 0);
    }
  }

  return d;
}
