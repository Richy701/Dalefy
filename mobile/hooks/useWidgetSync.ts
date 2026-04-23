import { useEffect } from "react";
import { Platform } from "react-native";
import { useTrips } from "@/context/TripsContext";

let TripCountdown: any = null;
try {
  TripCountdown = require("@/widgets/TripCountdown").default;
} catch {
  /* widget module not available in Expo Go or Android */
}

function daysUntil(dateStr: string) {
  return Math.ceil(
    (new Date(dateStr).getTime() - Date.now()) / 86400000
  );
}

/**
 * Syncs the next upcoming trip to the iOS home screen widget.
 * Call once in the root layout — it auto-updates when trips change.
 */
export function useWidgetSync() {
  const { trips, ready } = useTrips();

  useEffect(() => {
    if (!ready || !TripCountdown || Platform.OS !== "ios") return;

    const sorted = [...trips].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    // Find active or next upcoming trip
    const active = sorted.find(
      (t) => daysUntil(t.start) <= 0 && daysUntil(t.end) >= 0
    );
    const next = active ?? sorted.find((t) => daysUntil(t.start) > 0);

    if (!next) {
      TripCountdown.updateSnapshot({
        tripName: "No upcoming trips",
        destination: "",
        daysLeft: 0,
        startDate: "",
      });
      return;
    }

    const days = Math.max(0, daysUntil(next.start));
    const startDate = new Date(next.start).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    TripCountdown.updateSnapshot({
      tripName: next.name,
      destination: next.destination || "",
      daysLeft: days,
      startDate,
    });

    // Schedule timeline entries for the next 7 days so the widget
    // counts down even if the app isn't opened
    const timeline: Array<{ date: Date; props: any }> = [];
    for (let i = 0; i <= Math.min(days, 7); i++) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + i);
      futureDate.setHours(0, 0, 0, 0);

      timeline.push({
        date: futureDate,
        props: {
          tripName: next.name,
          destination: next.destination || "",
          daysLeft: Math.max(0, days - i),
          startDate,
        },
      });
    }

    if (timeline.length > 0) {
      TripCountdown.updateTimeline(timeline);
    }
  }, [trips, ready]);
}
