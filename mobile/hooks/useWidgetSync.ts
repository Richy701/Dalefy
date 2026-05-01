import { useEffect } from "react";
import { Platform } from "react-native";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";

let TripCountdown: any = null;
try {
  TripCountdown = require("@/widgets/TripCountdown").default;
} catch {
  /* widget module not available in Expo Go or Android */
}

function daysUntil(dateStr: string) {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function daysBetween(startStr: string, endStr: string) {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

function formatEventLine(ev: { time: string; title: string }): string {
  const time = ev.time || "";
  const title = ev.title.length > 22 ? ev.title.slice(0, 21) + "…" : ev.title;
  return time ? `${time}  ${title}` : title;
}

/**
 * Syncs the next upcoming trip to the iOS home screen widget.
 * Call once in the root layout — it auto-updates when trips change.
 */
export function useWidgetSync() {
  const { trips, ready } = useTrips();
  const { C } = useTheme();

  useEffect(() => {
    if (!ready || !TripCountdown || Platform.OS !== "ios") return;

    const accent = C.teal;
    const sorted = [...trips].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    const active = sorted.find(
      (t) => daysUntil(t.start) <= 0 && daysUntil(t.end) >= 0
    );
    const upcoming = active ? undefined : sorted.find((t) => daysUntil(t.start) > 0);

    if (active) {
      const totalDays = daysBetween(active.start, active.end);
      const currentDay = -daysUntil(active.start) + 1;
      const city = (active.destination || active.name).split(",")[0].trim();

      const todayStr = new Date().toISOString().split("T")[0];
      const todayEvents = active.events
        .filter((e) => e.date === todayStr)
        .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
        .slice(0, 2);

      TripCountdown.updateSnapshot({
        state: "active",
        tripName: active.name,
        destination: city,
        daysLeft: 0,
        startDate: "",
        currentDay,
        totalDays,
        accentColor: accent,
        event1: todayEvents[0] ? formatEventLine(todayEvents[0]) : "",
        event2: todayEvents[1] ? formatEventLine(todayEvents[1]) : "",
      });
      return;
    }

    if (upcoming) {
      const days = daysUntil(upcoming.start);
      const startDate = new Date(upcoming.start + "T12:00:00").toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric" }
      );

      const firstDayEvents = upcoming.events
        .filter((e) => e.date === upcoming.start)
        .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
        .slice(0, 2);

      const baseProps = {
        state: "upcoming",
        tripName: upcoming.name,
        destination: upcoming.destination || upcoming.name,
        daysLeft: days,
        startDate,
        currentDay: 0,
        totalDays: 0,
        accentColor: accent,
        event1: firstDayEvents[0] ? formatEventLine(firstDayEvents[0]) : "",
        event2: firstDayEvents[1] ? formatEventLine(firstDayEvents[1]) : "",
      };

      TripCountdown.updateSnapshot(baseProps);

      const timeline: Array<{ date: Date; props: any }> = [];
      for (let i = 0; i <= Math.min(days, 7); i++) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + i);
        futureDate.setHours(0, 0, 0, 0);

        const remaining = days - i;
        if (remaining > 0) {
          timeline.push({
            date: futureDate,
            props: { ...baseProps, daysLeft: remaining },
          });
        } else {
          const totalDays = daysBetween(upcoming.start, upcoming.end);
          timeline.push({
            date: futureDate,
            props: {
              ...baseProps,
              state: "active",
              destination: (upcoming.destination || upcoming.name).split(",")[0].trim(),
              daysLeft: 0,
              startDate: "",
              currentDay: 1,
              totalDays,
            },
          });
        }
      }

      if (timeline.length > 0) {
        TripCountdown.updateTimeline(timeline);
      }
      return;
    }

    TripCountdown.updateSnapshot({
      state: "empty",
      tripName: "",
      destination: "",
      daysLeft: 0,
      startDate: "",
      currentDay: 0,
      totalDays: 0,
      accentColor: accent,
      event1: "",
      event2: "",
    });
  }, [trips, ready, C.teal]);
}
