import { useEffect, useRef } from "react";
import { useTrips } from "@/context/TripsContext";
import { useNotifications } from "@/context/NotificationContext";
import type { Trip, TravelEvent, Notification } from "@/shared/types";

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
  return new Date().toISOString().slice(0, 10);
}

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

function eventDateTime(ev: TravelEvent): Date | null {
  const d = new Date(ev.date);
  if (isNaN(d.getTime())) return null;
  if (ev.time) {
    const t = parseTime(ev.time);
    if (t) d.setHours(t.hours, t.mins, 0, 0);
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
  const { notifications, addNotification, clearAll } = useNotifications();
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || trips.length === 0) return;
    seeded.current = true;

    // Clear stale notifications from previous sessions (e.g. past trips)
    // then reseed fresh ones from current trip state
    if (notifications.length > 0) clearAll();

    const now = new Date();
    const today = todayStr();
    const seen = new Set<string>();

    const add = (n: Omit<Notification, "id" | "read">) => {
      if (seen.has(n.message)) return;
      seen.add(n.message);
      addNotification(n);
    };

    for (const trip of trips) {
      const isActive = trip.start <= today && trip.end >= today;
      const startedToday = trip.start === today;

      // Only generate notifications for active trips
      if (!isActive) continue;

      // ── Trip started today ──
      if (startedToday) {
        add({
          message: `${trip.name} starts today!`,
          detail: `Your trip to ${trip.destination} begins. Have an amazing time!`,
          time: "9:00 AM",
          type: "info",
        });
      }

      // ── Welcome / arrived (active trip, first day already past) ──
      if (isActive && !startedToday) {
        add({
          message: `Welcome to ${trip.destination}`,
          detail: `${trip.name} is underway. Check your itinerary for today's plans.`,
          time: "8:00 AM",
          type: "info",
        });
      }

      // ── Flights that already landed ──
      for (const ev of trip.events) {
        if (ev.type !== "flight") continue;
        const status = ev.status?.toLowerCase() ?? "";
        if (status.includes("landed") || status.includes("arrived")) {
          const label = ev.flightNum || ev.title;
          const dest = ev.location ? friendlyDestination(ev.location) : null;
          add({
            message: `${label} Landed`,
            detail: dest ? `Arrived at ${dest}` : "Your flight has landed.",
            time: ev.endTime || ev.time || "",
            type: "landed",
          });
        }
        // Flights that are boarding
        if (status.includes("boarding")) {
          const label = ev.flightNum || ev.title;
          add({
            message: `${label} Now Boarding`,
            detail: ev.gate ? `Head to gate ${ev.gate}` : "Proceed to your gate.",
            time: ev.time || "",
            type: "boarding",
          });
        }
      }

      // ── Today's upcoming events ──
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
    }
  }, [trips, notifications, addNotification]);
}
