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

    // Destinations — use location field, skip descriptions/sentences
    const isSentence = (s: string) => s.length > 40 || /\.\s|followed by|transfer|arrival|depart/i.test(s);
    const destinations = new Set<string>();
    allEvents.forEach(e => {
      if ((e.type === "hotel" || e.type === "activity") && e.location && !isSentence(e.location)) {
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

    // Upcoming trips sorted by start date for timeline (future or in-progress only)
    const now = new Date();
    const tripTimeline = [...trips]
      .filter(t => new Date(t.end) >= now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 8)
      .map(t => {
        const start = new Date(t.start);
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

    // Top airlines — extract from airline field, title, or location
    const KNOWN_AIRLINES: Record<string, string> = {
      BA: "British Airways", EK: "Emirates", QR: "Qatar Airways", TK: "Turkish Airlines",
      LH: "Lufthansa", AF: "Air France", KL: "KLM", QF: "Qantas", SQ: "Singapore Airlines",
      CX: "Cathay Pacific", NH: "ANA", JL: "Japan Airlines", DL: "Delta", AA: "American Airlines",
      UA: "United Airlines", WN: "Southwest", FR: "Ryanair", U2: "easyJet", W6: "Wizz Air",
      KQ: "Kenya Airways", ET: "Ethiopian Airlines", SA: "South African Airways",
      XQ: "SunExpress", PC: "Pegasus", TG: "Thai Airways", MH: "Malaysia Airlines",
      EY: "Etihad Airways", VS: "Virgin Atlantic", DY: "Norwegian", FI: "Icelandair",
      AY: "Finnair", SK: "SAS", LX: "Swiss", OS: "Austrian", IB: "Iberia",
    };
    const airlineRe = /\b([A-Z]{2})\s*\d{2,4}\b/;
    const airlineNameRe = /\b(British Airways|Emirates|Qatar Airways|Turkish Airlines|Lufthansa|Air France|KLM|Qantas|Singapore Airlines|Cathay Pacific|ANA|Japan Airlines|Delta|American Airlines|United Airlines|Ryanair|easyJet|Kenya Airways|Ethiopian Airlines|Etihad|Virgin Atlantic|SunExpress|Pegasus|Thai Airways|Swiss|Iberia|Norwegian|Finnair|SAS|Austrian)\b/i;
    // Reverse lookup: airline name → IATA code
    const NAME_TO_IATA: Record<string, string> = {};
    Object.entries(KNOWN_AIRLINES).forEach(([code, name]) => { NAME_TO_IATA[name.toLowerCase()] = code; });
    const airlineCounts: Record<string, number> = {};
    const airlineIata: Record<string, string> = {};
    allEvents.forEach(e => {
      if (e.type !== "flight") return;
      let name = e.airline;
      let iata = "";
      if (!name) {
        // Try to match airline name in title or location
        const nameMatch = (e.title + " " + e.location).match(airlineNameRe);
        if (nameMatch) { name = nameMatch[1]; }
        else {
          // Try IATA code from flightNum, title, or location
          const codeMatch = (e.flightNum || e.title + " " + e.location).match(airlineRe);
          if (codeMatch && KNOWN_AIRLINES[codeMatch[1]]) { name = KNOWN_AIRLINES[codeMatch[1]]; iata = codeMatch[1]; }
        }
      }
      if (name) {
        if (!iata) iata = NAME_TO_IATA[name.toLowerCase()] || "";
        airlineCounts[name] = (airlineCounts[name] || 0) + 1;
        if (iata) airlineIata[name] = iata;
      }
    });
    const topAirlines = Object.entries(airlineCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count, iata: airlineIata[name] || "" }));

    // Top hotels — prefer location (property name), fall back to short title
    const hotelCounts: Record<string, number> = {};
    allEvents.forEach(e => {
      if (e.type === "hotel") {
        // Clean hotel name: strip prefixes like "Site visit of", "Check in at", etc.
        const cleanHotelName = (s: string) => s
          .replace(/^(?:site\s+visit\s+(?:of|to)|check[\s-]?in\s+(?:at|to)|arrive\s+(?:at|in)|arrival\s+(?:at|in)|transfer\s+to|stay\s+at|overnight\s+at)\s+/i, "")
          .replace(/\.\s*$/, "")
          .trim();
        const isSentence = (s: string) => /followed by|lunch at|afternoon|morning|game drive|departure|depart for/i.test(s);
        const loc = e.location ? cleanHotelName(e.location) : "";
        const title = e.title ? cleanHotelName(e.title) : "";
        const name = (loc && !isSentence(loc)) ? loc : (title && !isSentence(title)) ? title : "Unknown Hotel";
        hotelCounts[name] = (hotelCounts[name] || 0) + 1;
      }
    });
    const topHotels = Object.entries(hotelCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // ── Travel Insights ──
    const longestTrip = trips.length > 0
      ? [...trips].sort((a, b) => {
          const dA = Math.ceil((new Date(a.end).getTime() - new Date(a.start).getTime()) / (1000 * 60 * 60 * 24));
          const dB = Math.ceil((new Date(b.end).getTime() - new Date(b.start).getTime()) / (1000 * 60 * 60 * 24));
          return dB - dA;
        })[0]
      : null;
    const longestTripDays = longestTrip
      ? Math.ceil((new Date(longestTrip.end).getTime() - new Date(longestTrip.start).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const busiestTrip = trips.length > 0
      ? [...trips].sort((a, b) => b.events.length - a.events.length)[0]
      : null;

    const busiestMonth = tripsByMonth.length > 0
      ? [...tripsByMonth].sort((a, b) => b.count - a.count)[0]
      : null;

    const avgTripDays = trips.length > 0 ? Math.round(totalDays / trips.length) : 0;

    const flightCount = allEvents.filter(e => e.type === "flight").length;
    const hotelCount = allEvents.filter(e => e.type === "hotel").length;
    const activityCount = allEvents.filter(e => e.type === "activity").length;

    const insights = {
      longestTrip: longestTrip ? { name: longestTrip.name, days: longestTripDays } : null,
      busiestTrip: busiestTrip ? { name: busiestTrip.name, events: busiestTrip.events.length } : null,
      busiestMonth,
      avgTripDays,
      flightCount,
      hotelCount,
      activityCount,
      destinationCount: destinations.size,
    };

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
      insights,
    };
  }, [trips]);
}
