import { listCollection, updateDocument, decodeValue, encodeValue, docId, type FirestoreDoc } from "./_firebaseAdmin.js";
import { pickBestFlight } from "./_validate.js";
import { airportTz } from "./_airportTz.js";
import { isCronRequest } from "./_cronAuth.js";
import { isDue, statusGroup, timeToMins, NOTIFY_GROUPS } from "./_flightSchedule.js";

/**
 * Cron job: checks AeroDataBox for status updates on upcoming flights,
 * updates Firestore trip events, and sends push notifications to travelers.
 *
 * Runs every 15 minutes via Vercel Cron (see vercel.json); _flightSchedule.ts
 * decides which flights are due on each run.
 */
export default async function handler(req: any, res: any) {
  // Verify cron secret to prevent unauthorized calls
  if (!isCronRequest(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) return res.status(500).json({ error: "RAPIDAPI_KEY not configured" });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  let flightsChecked = 0;

  try {
    // 1. Fetch all trips from Firestore
    const tripDocs = await listCollection("trips");
    const updates: FlightUpdate[] = [];
    const tripsToUpdate: Map<string, { doc: FirestoreDoc; events: any[] }> = new Map();

    for (const tripDoc of tripDocs) {
      const fields = tripDoc.fields ?? {};
      const tripName = decodeValue(fields.name) ?? "Trip";
      const rawEvents: any[] = decodeValue(fields.events) ?? [];
      let tripChanged = false;

      for (let i = 0; i < rawEvents.length; i++) {
        const ev = rawEvents[i];
        if (ev.type !== "flight" || !ev.flightNum || !ev.date) continue;

        if (!isDue(ev, now)) continue;
        const eventDate = (ev.date as string).slice(0, 10);

        // Query AeroDataBox
        flightsChecked++;
        const result = await lookupFlight(ev.flightNum, eventDate, rapidApiKey);
        if (!result) continue;

        // Save missing route details even when nothing changed: without the
        // departure zone, later runs would time their checks hours off
        for (const k of ["depTz", "arrTz", "depAirport", "arrAirport", "depCoords", "arrCoords"] as const) {
          if (!ev[k] && result[k]) { rawEvents[i][k] = result[k]; tripChanged = true; }
        }

        // Detect changes
        const changes = detectChanges(ev, result);
        if (changes.length === 0) continue;

        // Every change is saved, but only the ones travelers act on send a push
        const statusNews = statusGroup(result.status) !== statusGroup(ev.status) && NOTIFY_GROUPS.has(statusGroup(result.status));
        const notify = statusNews || changes.some(c => !c.startsWith("Status: "));

        // Update event fields
        if (result.status) rawEvents[i].status = result.status;
        if (result.terminal) rawEvents[i].terminal = result.terminal;
        if (result.arrTerminal) rawEvents[i].arrTerminal = result.arrTerminal;
        if (result.gate) rawEvents[i].gate = result.gate;
        if (result.arrGate) rawEvents[i].arrGate = result.arrGate;
        if (result.baggageBelt) rawEvents[i].baggageBelt = result.baggageBelt;
        if (result.departTime) rawEvents[i].time = result.departTime;
        if (result.arriveTime) rawEvents[i].endTime = result.arriveTime;
        if (result.depAirport) rawEvents[i].depAirport = result.depAirport;
        if (result.arrAirport) rawEvents[i].arrAirport = result.arrAirport;
        if (result.aircraft) rawEvents[i].aircraft = result.aircraft;
        if (result.depTz) rawEvents[i].depTz = result.depTz;
        if (result.arrTz) rawEvents[i].arrTz = result.arrTz;
        if (result.depCoords) rawEvents[i].depCoords = result.depCoords;
        if (result.arrCoords) rawEvents[i].arrCoords = result.arrCoords;
        // Backfill location with route if it was missing
        if (result.depAirport && result.arrAirport && !rawEvents[i].location?.includes(" to ")) {
          rawEvents[i].location = `${result.depAirport} to ${result.arrAirport}`;
        }
        tripChanged = true;
        if (!notify) continue;

        updates.push({
          tripId: docId(tripDoc),
          tripName,
          flightNum: ev.flightNum,
          title: ev.title ?? "",
          eventId: ev.id ?? "",
          status: result.status && result.status !== ev.status ? result.status : undefined,
          changes,
        });
      }

      if (tripChanged) {
        tripsToUpdate.set(docId(tripDoc), { doc: tripDoc, events: rawEvents });
      }
    }

    // 2. Write updated events back to Firestore, only if nobody edited the
    // trip since we read it. A skipped trip is picked up again next run.
    const written = new Set<string>();
    for (const [id, { doc, events }] of tripsToUpdate) {
      try {
        await updateDocument("trips", id, {
          events: encodeValue(events),
        }, ["events"], doc.updateTime);
        written.add(id);
      } catch (err) {
        console.warn(`check-flight-status: skipped trip ${id}:`, err instanceof Error ? err.message : err);
      }
    }

    // 3. Send push notifications for what was saved
    const sent = updates.filter(u => written.has(u.tripId));
    if (sent.length > 0) {
      await sendFlightNotifications(sent);
    }

    res.json({
      checked: today,
      tripsScanned: tripDocs.length,
      flightsChecked,
      tripsWritten: written.size,
      notified: sent.map(u => ({ flight: u.flightNum, changes: u.changes })),
    });
  } catch (err: any) {
    console.error("check-flight-status error:", err);
    res.status(500).json({ error: err.message ?? "Internal error" });
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

interface FlightUpdate {
  tripId: string;
  tripName: string;
  flightNum: string;
  title: string;
  eventId: string;
  /** Set when the flight's status itself changed, e.g. "Delayed" */
  status?: string;
  changes: string[];
}

interface LiveFlightData {
  status: string;
  terminal: string;
  arrTerminal: string;
  gate: string;
  arrGate: string;
  baggageBelt: string;
  departTime: string;
  arriveTime: string;
  depAirport: string;
  arrAirport: string;
  aircraft: string;
  depTz: string;
  arrTz: string;
  depCoords?: [number, number];
  arrCoords?: [number, number];
}

// ── AeroDataBox lookup ─────────────────────────────────────────────────────

async function lookupFlight(
  flightNum: string,
  date: string,
  apiKey: string,
): Promise<LiveFlightData | null> {
  const clean = flightNum.replace(/\s+/g, "");
  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${clean}/${date}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": "aerodatabox.p.rapidapi.com",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json();

    const flights = (Array.isArray(data) ? data : [])
      .filter((f: any) => f.codeshareStatus !== "IsCodeshared");

    if (flights.length === 0) return null;

    const f = pickBestFlight(flights);
    const dep = f.departure ?? {};
    const arr = f.arrival ?? {};

    const depLoc = dep.airport?.location;
    const arrLoc = arr.airport?.location;
    return {
      status: f.status ?? "",
      terminal: dep.terminal ?? "",
      arrTerminal: arr.terminal ?? "",
      gate: dep.gate ?? "",
      arrGate: arr.gate ?? "",
      baggageBelt: arr.baggageBelt ?? "",
      departTime: formatTime(dep.scheduledTime?.local ?? dep.actualTime?.local ?? ""),
      arriveTime: formatTime(arr.scheduledTime?.local ?? arr.actualTime?.local ?? ""),
      depAirport: dep.airport?.iata ?? "",
      arrAirport: arr.airport?.iata ?? "",
      aircraft: f.aircraft?.model ?? "",
      depTz: airportTz(dep.airport?.iata ?? "") ?? "",
      arrTz: airportTz(arr.airport?.iata ?? "") ?? "",
      depCoords: depLoc ? [depLoc.lat, depLoc.lon] : undefined,
      arrCoords: arrLoc ? [arrLoc.lat, arrLoc.lon] : undefined,
    };
  } catch {
    return null;
  }
}

function formatTime(t: string): string {
  const match = t.match(/(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

// ── Change detection ───────────────────────────────────────────────────────

function detectChanges(stored: any, live: LiveFlightData): string[] {
  const changes: string[] = [];

  // Written as the lines a traveller reads in the notification, most useful first
  if (live.status && live.status !== stored.status) {
    changes.push(`Status: ${live.status}`);
  }
  if (live.gate && live.gate !== stored.gate) {
    changes.push(`Departs from gate ${live.gate}`);
  }
  if (live.terminal && live.terminal !== stored.terminal) {
    changes.push(`Departs from terminal ${live.terminal}`);
  }
  if (live.arrTerminal && live.arrTerminal !== stored.arrTerminal) {
    changes.push(`Arrives at terminal ${live.arrTerminal}`);
  }
  if (live.arrGate && live.arrGate !== stored.arrGate) {
    changes.push(`Arrives at gate ${live.arrGate}`);
  }
  if (live.baggageBelt && live.baggageBelt !== stored.baggageBelt) {
    changes.push(`Bags on belt ${live.baggageBelt}`);
  }
  if (live.departTime) {
    const liveMins = timeToMins(live.departTime);
    const storedMins = timeToMins(stored.time);
    // Compare by wall-clock minutes so "07:35" vs "7:35 AM" is not a false change
    if (liveMins !== null && liveMins !== storedMins) {
      changes.push(`Now departs at ${live.departTime}`);
    }
  }

  return changes;
}

// ── Push notifications ─────────────────────────────────────────────────────

async function sendFlightNotifications(updates: FlightUpdate[]) {
  // Resolve push tokens per trip: trip_members maps trip_id → device_id,
  // push_tokens maps device_id → token. Only that trip's members get notified.
  let memberDocs: FirestoreDoc[] = [];
  let tokenDocs: FirestoreDoc[] = [];
  try {
    [memberDocs, tokenDocs] = await Promise.all([
      listCollection("trip_members"),
      listCollection("push_tokens"),
    ]);
  } catch {
    return;
  }

  const tokenByDevice = new Map<string, string>();
  for (const d of tokenDocs) {
    const deviceId = decodeValue(d.fields?.device_id);
    const token = decodeValue(d.fields?.token);
    if (deviceId && token) tokenByDevice.set(deviceId, token);
  }

  const tokensByTrip = new Map<string, string[]>();
  for (const m of memberDocs) {
    const tripId = decodeValue(m.fields?.trip_id);
    const deviceId = decodeValue(m.fields?.device_id);
    const token = deviceId ? tokenByDevice.get(deviceId) : undefined;
    if (!tripId || !token) continue;
    const list = tokensByTrip.get(tripId) ?? [];
    if (!list.includes(token)) list.push(token);
    tokensByTrip.set(tripId, list);
  }

  for (const update of updates) {
    const tokens = tokensByTrip.get(update.tripId) ?? [];
    if (tokens.length === 0) continue;

    const { title, body } = flightPushCopy(update);

    const messages = tokens.map(token => ({
      to: token,
      title,
      subtitle: update.tripName,
      body,
      data: { tripId: update.tripId, eventId: update.eventId, category: "flight_status", flightNum: update.flightNum },
      // "View flight" button, and it comes through Focus modes
      categoryId: "flight",
      interruptionLevel: "time-sensitive" as const,
      sound: "default" as const,
    }));

    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(chunk),
        });
      } catch {
        // best-effort
      }
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** The title says what happened ("QR 843 is delayed"), the body lists the details one per line */
function flightPushCopy(update: FlightUpdate): { title: string; body: string } {
  const flight = update.flightNum || update.title || "Your flight";
  const status = (update.status ?? "").toLowerCase().replace(/\s+/g, "");
  const lines = update.changes.filter(c => !c.startsWith("Status: "));
  const has = (prefix: string) => lines.some(l => l.startsWith(prefix));
  const title =
    status.startsWith("cancel") ? `${flight} is cancelled`
    : status === "diverted" ? `${flight} has been diverted`
    : status === "delayed" ? `${flight} is delayed`
    : status === "boarding" ? `${flight} is boarding`
    : status === "departed" || status === "enroute" ? `${flight} has departed`
    : status === "arrived" || status === "landed" ? `${flight} has landed`
    : has("Departs from gate") ? `${flight} gate change`
    : has("Now departs") ? `${flight} has a new departure time`
    : `${flight} update`;
  const body = lines.length ? lines.join("\n") : "Open the trip for the latest details.";
  return { title, body };
}
