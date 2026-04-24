import { useEffect, useRef } from "react";
import { useTrips } from "@/context/TripsContext";
import { useNotifications } from "@/context/NotificationContext";
import type { TravelEvent } from "@/shared/types";

/**
 * Watches trip flight events for status changes (gate, terminal, delay,
 * boarding, landed, cancelled) and generates local in-app notifications
 * when the Firestore data updates.
 */

interface FlightSnapshot {
  status?: string;
  gate?: string;
  terminal?: string;
  arrTerminal?: string;
  time: string;
  endTime?: string;
}

function flightKey(tripId: string, ev: TravelEvent): string {
  return `${tripId}:${ev.id}`;
}

function snapshot(ev: TravelEvent): FlightSnapshot {
  return {
    status: ev.status,
    gate: ev.gate,
    terminal: ev.terminal,
    arrTerminal: ev.arrTerminal,
    time: ev.time,
    endTime: ev.endTime,
  };
}

function detectChanges(
  prev: FlightSnapshot,
  next: FlightSnapshot,
  ev: TravelEvent,
): { message: string; detail: string; type: "info" | "success" | "warning" } | null {
  const changes: string[] = [];
  let type: "info" | "success" | "warning" = "info";
  const label = ev.flightNum || ev.title;

  // Status changes
  if (next.status && next.status !== prev.status) {
    const s = next.status.toLowerCase();
    if (s.includes("cancel")) {
      type = "warning";
      return {
        message: `${label} Cancelled`,
        detail: `Your flight has been cancelled. Contact ${ev.airline || "the airline"} for rebooking.`,
        type,
      };
    }
    if (s.includes("landed") || s.includes("arrived")) {
      type = "success";
      return {
        message: `${label} Landed`,
        detail: ev.location ? `Arrived at ${ev.location}` : "Your flight has landed.",
        type,
      };
    }
    if (s.includes("boarding")) {
      type = "info";
      return {
        message: `${label} Now Boarding`,
        detail: next.gate ? `Head to gate ${next.gate}` : "Proceed to your gate.",
        type,
      };
    }
    if (s.includes("delay")) {
      type = "warning";
      changes.push(`Delayed`);
    } else {
      changes.push(`Status: ${next.status}`);
    }
  }

  // Gate change
  if (next.gate && next.gate !== prev.gate) {
    if (prev.gate) {
      type = "warning";
      changes.push(`Gate changed: ${prev.gate} → ${next.gate}`);
    } else {
      changes.push(`Gate assigned: ${next.gate}`);
    }
  }

  // Terminal change
  if (next.terminal && next.terminal !== prev.terminal) {
    if (prev.terminal) {
      type = "warning";
      changes.push(`Terminal changed: ${prev.terminal} → ${next.terminal}`);
    } else {
      changes.push(`Terminal: ${next.terminal}`);
    }
  }

  // Arrival terminal
  if (next.arrTerminal && next.arrTerminal !== prev.arrTerminal) {
    changes.push(`Arrival terminal: ${next.arrTerminal}`);
  }

  // Departure time change (delay/reschedule)
  if (next.time && next.time !== prev.time) {
    type = "warning";
    changes.push(`Departure time: ${prev.time} → ${next.time}`);
  }

  if (changes.length === 0) return null;

  return {
    message: `${label} Update`,
    detail: changes.join(" · "),
    type,
  };
}

export function useFlightAlerts() {
  const { trips } = useTrips();
  const { addNotification } = useNotifications();
  const prevRef = useRef<Map<string, FlightSnapshot>>(new Map());
  const initialized = useRef(false);

  useEffect(() => {
    const currentMap = new Map<string, FlightSnapshot>();

    for (const trip of trips) {
      for (const ev of trip.events) {
        if (ev.type !== "flight") continue;
        const key = flightKey(trip.id, ev);
        currentMap.set(key, snapshot(ev));

        // Only generate notifications after initial load
        if (initialized.current) {
          const prev = prevRef.current.get(key);
          if (prev) {
            const change = detectChanges(prev, snapshot(ev), ev);
            if (change) {
              addNotification({
                message: change.message,
                detail: change.detail,
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                type: change.type,
              });
            }
          }
        }
      }
    }

    prevRef.current = currentMap;
    if (!initialized.current && trips.length > 0) {
      initialized.current = true;
    }
  }, [trips, addNotification]);
}
