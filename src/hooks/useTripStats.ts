import { useMemo } from "react";
import type { Trip } from "@/types";

export function useTripStats(trips: Trip[]) {
  return useMemo(() => {
    const allEvents = trips.flatMap(t => t.events);
    const totalEvents = allEvents.length;
    const avgEventsPerTrip = trips.length > 0 ? Math.round(totalEvents / trips.length) : 0;

    // Type counts
    const typeCounts: Record<string, number> = {};
    allEvents.forEach(e => { typeCounts[e.type] = (typeCounts[e.type] || 0) + 1; });
    const mostCommonType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

    // Total travel days
    let totalDays = 0;
    trips.forEach(t => {
      const start = new Date(t.start);
      const end = new Date(t.end);
      totalDays += Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    });

    // Destinations
    const destinations = new Set<string>();
    allEvents.forEach(e => {
      if (e.type === "hotel" || e.type === "activity") {
        destinations.add(e.location);
      }
    });

    // Events per trip (chart data)
    const eventsPerTrip = trips.map(t => ({
      name: t.name.length > 15 ? t.name.slice(0, 15) + "..." : t.name,
      flights: t.events.filter(e => e.type === "flight").length,
      hotels: t.events.filter(e => e.type === "hotel").length,
      activities: t.events.filter(e => e.type === "activity").length,
      dining: t.events.filter(e => e.type === "dining").length,
      total: t.events.length,
    }));

    const typeDistribution = Object.entries(typeCounts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));

    // Upcoming trips (next 7 days)
    const upcoming = trips.filter(t => {
      const start = new Date(t.start);
      const now = new Date();
      const diff = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    }).length;

    // ── Trip Operations data ──

    // Pipeline: count by status
    const pipeline = {
      draft: trips.filter(t => t.status === "Draft").length,
      published: trips.filter(t => t.status === "Published").length,
      inProgress: trips.filter(t => t.status === "In Progress").length,
      total: trips.length,
    };

    // Active trips (In Progress)
    const activeTrips = pipeline.inProgress;

    // Upcoming trips (next 30 days)
    const upcomingTrips = trips
      .filter(t => {
        const start = new Date(t.start);
        const now = new Date();
        const diff = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 30;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    // All trips sorted by start date for timeline
    const tripTimeline = [...trips]
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 8)
      .map(t => {
        const start = new Date(t.start);
        const now = new Date();
        const daysUntil = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const duration = Math.max(0, Math.ceil((new Date(t.end).getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        return { ...t, daysUntil, duration };
      });

    // Trips by month (chart data)
    const monthCounts: Record<string, number> = {};
    trips.forEach(t => {
      const d = new Date(t.start);
      const key = `${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}`;
      monthCounts[key] = (monthCounts[key] || 0) + 1;
    });
    const tripsByMonth = Object.entries(monthCounts)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => {
        const parse = (s: string) => new Date(s + " 1").getTime();
        return parse(a.month) - parse(b.month);
      });

    // Top airlines
    const airlineCounts: Record<string, number> = {};
    allEvents.forEach(e => {
      if (e.type === "flight" && e.airline) {
        airlineCounts[e.airline] = (airlineCounts[e.airline] || 0) + 1;
      }
    });
    const topAirlines = Object.entries(airlineCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Top hotels
    const hotelCounts: Record<string, number> = {};
    allEvents.forEach(e => {
      if (e.type === "hotel") {
        hotelCounts[e.title] = (hotelCounts[e.title] || 0) + 1;
      }
    });
    const topHotels = Object.entries(hotelCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return {
      totalEvents,
      avgEventsPerTrip,
      mostCommonType,
      totalDays,
      typeCounts,
      eventsPerTrip,
      typeDistribution,
      uniqueLocations: [...destinations],
      destinationCount: destinations.size,
      upcoming,
      // Operations
      pipeline,
      activeTrips,
      upcomingTrips,
      tripTimeline,
      tripsByMonth,
      topAirlines,
      topHotels,
    };
  }, [trips]);
}
