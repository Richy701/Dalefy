/**
 * Shared core for AeroDataBox flight search and flight-number lookup.
 * Imported by BOTH api/flights.ts / api/flight-number.ts (Vercel) and
 * vite.config.ts (local dev) so response shapes can never drift.
 */
import { scoreAeroFlight } from "./_validate.js";
import { airportTz } from "./_airportTz.js";
import { HttpError } from "./_httpError.js";

/** The subset of the AeroDataBox response this module reads. */
interface AeroMovement {
  airport?: { iata?: string; name?: string; location?: { lat: number; lon: number } };
  scheduledTime?: { local?: string; utc?: string };
  actualTime?: { local?: string; utc?: string };
  terminal?: string;
  gate?: string;
  baggageBelt?: string;
}
interface AeroFlight {
  number?: string;
  status?: string;
  isCargo?: boolean;
  codeshareStatus?: string;
  airline?: { name?: string };
  aircraft?: { model?: string };
  movement?: AeroMovement;
  departure?: AeroMovement;
  arrival?: AeroMovement;
}
interface AeroDeparturesResponse { departures?: AeroFlight[] }

function aeroHeaders(key: string): Record<string, string> {
  return {
    "x-rapidapi-key": key,
    "x-rapidapi-host": "aerodatabox.p.rapidapi.com",
  };
}

/** Extract HH:mm from an ISO-ish local time string like "2026-04-22 14:30+01:00" or "2026-04-22T14:30" */
function formatTime(t: string): string {
  const match = t.match(/(\d{2}:\d{2})/);
  return match ? match[1] : t;
}

function timeToMins(t: string): number {
  const match = t.match(/(\d{2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

export async function searchFlights(from: string, to: string, date: string, key: string) {
  try {
    // AeroDataBox limits to 12hr windows, so fetch two halves of the day
    const headers = aeroHeaders(key);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const [r1, r2] = await Promise.all([
      fetch(`https://aerodatabox.p.rapidapi.com/flights/airports/iata/${from}/${date}T00:00/${date}T11:59?direction=Departure`, { headers, signal: controller.signal }),
      fetch(`https://aerodatabox.p.rapidapi.com/flights/airports/iata/${from}/${date}T12:00/${date}T23:59?direction=Departure`, { headers, signal: controller.signal }),
    ]);
    clearTimeout(timeout);

    const d1 = (r1.ok ? await r1.json() : {}) as AeroDeparturesResponse;
    const d2 = (r2.ok ? await r2.json() : {}) as AeroDeparturesResponse;

    const allDepartures = [...(d1.departures ?? []), ...(d2.departures ?? [])];

    // Filter to flights heading to the destination, skip codeshares
    const toUpper = to.toUpperCase();
    const matched = allDepartures
      .filter((f: AeroFlight) => f.movement?.airport?.iata?.toUpperCase() === toUpper && f.codeshareStatus !== "IsCodeshared" && !f.isCargo)
      .slice(0, 8);

    const flights = matched.map((f: AeroFlight) => {
      const mov = f.movement ?? {};
      const depTime = mov.scheduledTime?.local ?? "";
      return {
        airline: f.airline?.name ?? "",
        flightNum: f.number ?? "",
        from: from,
        fromCode: from,
        to: mov.airport?.name ?? "",
        toCode: mov.airport?.iata ?? to,
        departTime: formatTime(depTime),
        arriveTime: "",
        durationMins: 0,
        price: 0,
        stops: 0,
        logo: "",
        status: f.status ?? "",
        terminal: mov.terminal ?? "",
        depTz: airportTz(from) ?? "",
        arrTz: airportTz(mov.airport?.iata ?? to) ?? "",
      };
    });

    return { flights };
  } catch {
    throw new HttpError(500, "Failed to fetch from AeroDataBox");
  }
}

export async function lookupFlightNumber(number: string, date: string, key: string) {
  const clean = number.replace(/\s+/g, "");
  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${clean}/${date}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { headers: aeroHeaders(key), signal: controller.signal });
    clearTimeout(timeout);
    const data = await resp.json() as AeroFlight[] | unknown;

    const filtered = (Array.isArray(data) ? data as AeroFlight[] : [])
      .filter((f: AeroFlight) => f.codeshareStatus !== "IsCodeshared");

    // Prefer non-arrived flights when duplicates exist (daily flights return yesterday + today)
    const hasActive = filtered.some((f: AeroFlight) => {
      const s = (f.status ?? "").toLowerCase();
      return !s.includes("arrived") && !s.includes("landed");
    });
    const raw = (hasActive
      ? filtered.filter((f: AeroFlight) => {
          const s = (f.status ?? "").toLowerCase();
          return !s.includes("arrived") && !s.includes("landed");
        })
      : filtered
    )
      .sort((a: AeroFlight, b: AeroFlight) => scoreAeroFlight(b) - scoreAeroFlight(a))
      .slice(0, 8);

    const flights = raw.map((f: AeroFlight) => {
      const dep = f.departure ?? {};
      const arr = f.arrival ?? {};
      const depTime = dep.scheduledTime?.local ?? "";
      const arrTime = arr.scheduledTime?.local ?? "";
      const depUtc = dep.scheduledTime?.utc ?? "";
      const arrUtc = arr.scheduledTime?.utc ?? "";
      const depMins = timeToMins(depUtc);
      const arrMins = timeToMins(arrUtc);
      const duration = arrMins >= depMins ? arrMins - depMins : arrMins + 1440 - depMins;

      const depLoc = dep.airport?.location;
      const arrLoc = arr.airport?.location;
      return {
        airline: f.airline?.name ?? "",
        flightNum: f.number ?? "",
        from: dep.airport?.name ?? "",
        fromCode: dep.airport?.iata ?? "",
        to: arr.airport?.name ?? "",
        toCode: arr.airport?.iata ?? "",
        departTime: formatTime(depTime),
        arriveTime: formatTime(arrTime),
        durationMins: duration,
        price: 0,
        stops: 0,
        logo: "",
        status: f.status ?? "",
        terminal: dep.terminal ?? "",
        arrTerminal: arr.terminal ?? "",
        gate: dep.gate ?? "",
        arrGate: arr.gate ?? "",
        baggageBelt: arr.baggageBelt ?? "",
        aircraft: f.aircraft?.model ?? "",
        depTz: airportTz(dep.airport?.iata ?? "") ?? "",
        arrTz: airportTz(arr.airport?.iata ?? "") ?? "",
        depCoords: depLoc ? [depLoc.lat, depLoc.lon] : undefined,
        arrCoords: arrLoc ? [arrLoc.lat, arrLoc.lon] : undefined,
      };
    });

    return { flights };
  } catch {
    throw new HttpError(500, "Failed to fetch from AeroDataBox");
  }
}
