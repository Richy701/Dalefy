import { useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTrips } from "@/context/TripsContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useNotifications } from "@/context/NotificationContext";
import type { Trip, TravelEvent, Notification } from "@/shared/types";

const SEED_KEY = "daf-notif-seeded";

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
  ACC: "Accra",
  // Europe
  CDG: "Paris Charles de Gaulle", AMS: "Amsterdam", FRA: "Frankfurt",
  FCO: "Rome Fiumicino", BCN: "Barcelona", MAD: "Madrid",
  NAP: "Naples", IST: "Istanbul", ATH: "Athens",
  AYT: "Antalya", SAW: "Istanbul Sabiha", ESB: "Ankara",
  // Americas
  JFK: "New York JFK", LAX: "Los Angeles", ORD: "Chicago O'Hare",
  MIA: "Miami", SFO: "San Francisco", ATL: "Atlanta",
  YYZ: "Toronto", MEX: "Mexico City", GRU: "São Paulo",
  // Oceania
  SYD: "Sydney", MEL: "Melbourne", AKL: "Auckland",
  // Indian Ocean
  MLE: "Malé",
};

function friendlyAirport(code: string): string {
  return AIRPORT_NAMES[code.toUpperCase()] ?? code;
}

function friendlyDestination(location: string): string | null {
  const match = location.match(/^([A-Z]{3})\s+to\s+([A-Z]{3})$/i);
  if (match) return friendlyAirport(match[2]);
  return null;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

const TYPE_LABEL: Record<string, string> = {
  flight: "flight", hotel: "hotel check-in", activity: "activity",
  dining: "dining", transfer: "transfer",
};

function parseTime(time: string): { hours: number; mins: number } | null {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return { hours, mins };
}

const IATA_TZ: Record<string, string> = {
  LHR: "Europe/London", LGW: "Europe/London", STN: "Europe/London", MAN: "Europe/London",
  CDG: "Europe/Paris", AMS: "Europe/Amsterdam", FRA: "Europe/Berlin",
  FCO: "Europe/Rome", NAP: "Europe/Rome", MAD: "Europe/Madrid", BCN: "Europe/Madrid",
  IST: "Europe/Istanbul", SAW: "Europe/Istanbul", AYT: "Europe/Istanbul",
  KEF: "Atlantic/Reykjavik",
  JFK: "America/New_York", EWR: "America/New_York", LAX: "America/Los_Angeles",
  ORD: "America/Chicago", MIA: "America/New_York", SFO: "America/Los_Angeles",
  DXB: "Asia/Dubai", DOH: "Asia/Qatar",
  SIN: "Asia/Singapore", HKG: "Asia/Hong_Kong", BKK: "Asia/Bangkok",
  HND: "Asia/Tokyo", NRT: "Asia/Tokyo", ICN: "Asia/Seoul", DPS: "Asia/Makassar",
  SYD: "Australia/Sydney", MEL: "Australia/Melbourne",
  ACC: "Africa/Accra", NBO: "Africa/Nairobi", MLE: "Indian/Maldives",
};

function getDepAirportTz(ev: TravelEvent): string | undefined {
  const code = ev.depAirport?.toUpperCase()
    || ev.location?.match(/^([A-Z]{3})\s+to\s+/i)?.[1]?.toUpperCase();
  return code ? IATA_TZ[code] : undefined;
}

function getUtcOffsetMins(tz: string, dateStr: string): number {
  try {
    const d = new Date(dateStr + "T12:00:00Z");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d);
    const localH = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    const localM = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
    const localDay = parseInt(parts.find(p => p.type === "day")?.value || "0", 10);
    const utcDay = d.getUTCDate();
    let offsetMins = (localH * 60 + localM) - (12 * 60);
    if (localDay > utcDay) offsetMins += 1440;
    else if (localDay < utcDay) offsetMins -= 1440;
    return offsetMins;
  } catch { return 0; }
}

function eventDateTime(ev: TravelEvent): Date | null {
  const d = new Date(ev.date);
  if (isNaN(d.getTime())) return null;
  if (ev.time) {
    const t = parseTime(ev.time);
    if (!t) return d;
    const tz = ev.type === "flight" ? getDepAirportTz(ev) : undefined;
    if (tz) {
      const offsetMins = getUtcOffsetMins(tz, ev.date);
      const utcMs = new Date(`${ev.date}T${String(t.hours).padStart(2, "0")}:${String(t.mins).padStart(2, "0")}:00Z`).getTime() - offsetMins * 60000;
      return new Date(utcMs);
    }
    d.setHours(t.hours, t.mins, 0, 0);
  }
  return d;
}

/**
 * Seeds the in-app notification list with relevant trip milestones.
 * Runs once per app session — uses a dedup set to avoid recreating
 * notifications that already exist.
 */
export function useTripNotifications() {
  const { trips } = useTrips();
  const { prefs } = usePreferences();
  const { notifications, addNotification, clearAll } = useNotifications();
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || trips.length === 0) return;
    seeded.current = true;

    const today = todayStr();
    AsyncStorage.getItem(SEED_KEY).then(lastSeeded => {
      if (lastSeeded === today) return;
      if (notifications.length > 0) clearAll();

      const now = new Date();
      const seen = new Set<string>();

      const add = (n: Omit<Notification, "id" | "read">) => {
        if (seen.has(n.message)) return;
        seen.add(n.message);
        addNotification(n);
      };

      for (const trip of trips) {
        const isActive = trip.start <= today && trip.end >= today;
        const startedToday = trip.start === today;

        if (!isActive) continue;

        if (startedToday) {
          add({
            message: `${trip.name} starts today!`,
            detail: `Your trip to ${trip.destination} begins. Have an amazing time!`,
            time: "9:00 AM",
            type: "info",
          });
        }

        const isTraveler = !trip.travelerIds?.length || !prefs.uid || trip.travelerIds.includes(prefs.uid);
        if (isActive && !startedToday && isTraveler) {
          add({
            message: `Welcome to ${trip.destination}`,
            detail: `${trip.name} is underway. Check your itinerary for today's plans.`,
            time: "8:00 AM",
            type: "info",
          });
        }

        for (const ev of trip.events) {
          if (ev.type !== "flight") continue;
          const status = ev.status?.toLowerCase() ?? "";
          if (status.includes("landed") || status.includes("arrived")) {
            const evDt = eventDateTime(ev);
            if (evDt && evDt.getTime() > now.getTime()) continue;
            const label = ev.flightNum || ev.title;
            const dest = ev.location ? friendlyDestination(ev.location) : null;
            add({
              message: `${label} Landed`,
              detail: dest ? `Arrived at ${dest}` : "Your flight has landed.",
              time: ev.endTime || ev.time || "",
              type: "landed",
            });
          }
          if (status.includes("boarding")) {
            const label = ev.flightNum || ev.title;
            add({
              message: `${label} Now Boarding`,
              detail: ev.gate ? `Head to gate ${ev.gate}` : "Proceed to your gate.",
              time: ev.time || "",
              type: "boarding",
            });
          }
          if (ev.date === today) {
            const evDt = eventDateTime(ev);
            if (evDt && evDt.getTime() > now.getTime()) {
              const label = ev.flightNum || ev.title;
              const dest = ev.location ? friendlyDestination(ev.location) : null;
              add({
                message: `${label} departs today`,
                detail: dest ? `Flying to ${dest} at ${ev.time || "TBA"}` : `Departure at ${ev.time || "TBA"}`,
                time: ev.time || "",
                type: "flight",
              });
            }
          }
        }

        if (isActive) {
          const todayEvents = trip.events.filter(ev => ev.date === today);
          for (const ev of todayEvents) {
            const evTime = eventDateTime(ev);
            if (!evTime || evTime.getTime() < now.getTime()) continue;

            const timeStr = ev.time || "";
            if (ev.type === "hotel" && ev.checkin) {
              add({
                message: `Check-in: ${ev.title}`,
                detail: `Check-in${ev.checkin ? ` from ${ev.checkin}` : ""} today.${ev.location ? ` ${ev.location}` : ""}`,
                time: ev.checkin || timeStr,
                type: "hotel",
              });
            } else if (ev.type === "dining") {
              add({
                message: ev.title,
                detail: ev.location ? `At ${ev.location} · ${timeStr}` : `Today at ${timeStr}`,
                time: timeStr,
                type: "dining",
              });
            } else if (ev.type === "activity") {
              add({
                message: ev.title,
                detail: ev.location ? `At ${ev.location} · ${timeStr}` : `Today at ${timeStr}`,
                time: timeStr,
                type: "activity",
              });
            } else if (ev.type === "transfer") {
              add({
                message: ev.title,
                detail: ev.location ? `Pickup: ${ev.location} · ${timeStr}` : `Scheduled at ${timeStr}`,
                time: timeStr,
                type: "transfer",
              });
            }
          }
        }

        // ── Tomorrow preview ──
        const tomorrow = tomorrowStr();
        if (tomorrow <= trip.end) {
          const tomorrowEvents = trip.events.filter(ev => ev.date === tomorrow);
          if (tomorrowEvents.length > 0) {
            const types = [...new Set(tomorrowEvents.map(ev => TYPE_LABEL[ev.type] || ev.type))];
            const summary = types.length <= 2 ? types.join(" and ") : `${types.slice(0, 2).join(", ")} and more`;
            add({
              message: `Tomorrow: ${tomorrowEvents.length} event${tomorrowEvents.length > 1 ? "s" : ""}`,
              detail: `You have ${summary} planned for tomorrow.`,
              time: "",
              type: "info",
            });
          }
        }

        // ── Next flight heads-up ──
        const nextFlight = trip.events
          .filter(ev => ev.type === "flight" && ev.date > today)
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        if (nextFlight) {
          const days = daysUntil(nextFlight.date);
          if (days > 0 && days <= 7) {
            const label = nextFlight.flightNum || nextFlight.title;
            const dest = nextFlight.location ? friendlyDestination(nextFlight.location) : null;
            const when = days === 1 ? "tomorrow" : `in ${days} days`;
            add({
              message: `${label} ${when}`,
              detail: dest ? `Flying to ${dest}` : `Departure at ${nextFlight.time || "TBA"}`,
              time: nextFlight.time || "",
              type: "flight",
            });
          }
        }
      }

      AsyncStorage.setItem(SEED_KEY, today);
    });
  }, [trips, notifications, addNotification]);
}
