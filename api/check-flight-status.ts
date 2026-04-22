import { listCollection, updateDocument, decodeValue, encodeValue, docId, type FirestoreDoc } from "./_firebaseAdmin.js";

/**
 * Cron job: checks AeroDataBox for status updates on today's flights,
 * updates Firestore trip events, and sends push notifications to travelers.
 *
 * Runs every 30 minutes via Vercel Cron.
 */
export default async function handler(req: any, res: any) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers["authorization"];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) return res.status(500).json({ error: "RAPIDAPI_KEY not configured" });

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = nextDay(today);

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

        // Only check flights happening today or tomorrow
        const eventDate = (ev.date as string).slice(0, 10);
        if (eventDate !== today && eventDate !== tomorrow) continue;

        // Query AeroDataBox
        const result = await lookupFlight(ev.flightNum, eventDate, rapidApiKey);
        if (!result) continue;

        // Detect changes
        const changes = detectChanges(ev, result);
        if (changes.length === 0) continue;

        // Update event fields
        if (result.status) rawEvents[i].status = result.status;
        if (result.terminal) rawEvents[i].terminal = result.terminal;
        if (result.arrTerminal) rawEvents[i].arrTerminal = result.arrTerminal;
        if (result.gate) rawEvents[i].gate = result.gate;
        if (result.departTime) rawEvents[i].time = result.departTime;
        if (result.arriveTime) rawEvents[i].endTime = result.arriveTime;
        tripChanged = true;

        updates.push({
          tripId: docId(tripDoc),
          tripName,
          flightNum: ev.flightNum,
          title: ev.title ?? "",
          changes,
        });
      }

      if (tripChanged) {
        tripsToUpdate.set(docId(tripDoc), { doc: tripDoc, events: rawEvents });
      }
    }

    // 2. Write updated events back to Firestore
    for (const [id, { events }] of tripsToUpdate) {
      await updateDocument("trips", id, {
        events: encodeValue(events),
      }, ["events"]);
    }

    // 3. Send push notifications
    if (updates.length > 0) {
      await sendFlightNotifications(updates);
    }

    res.json({
      checked: today,
      tripsScanned: tripDocs.length,
      flightsUpdated: updates.length,
      updates: updates.map(u => ({ flight: u.flightNum, changes: u.changes })),
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
  changes: string[];
}

interface LiveFlightData {
  status: string;
  terminal: string;
  arrTerminal: string;
  gate: string;
  departTime: string;
  arriveTime: string;
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
    const resp = await fetch(url, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": "aerodatabox.p.rapidapi.com",
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json();

    const flights = (Array.isArray(data) ? data : [])
      .filter((f: any) => f.codeshareStatus !== "IsCodeshared");

    if (flights.length === 0) return null;

    const f = flights[0];
    const dep = f.departure ?? {};
    const arr = f.arrival ?? {};

    return {
      status: f.status ?? "",
      terminal: dep.terminal ?? "",
      arrTerminal: arr.terminal ?? "",
      gate: dep.gate ?? "",
      departTime: formatTime(dep.scheduledTime?.local ?? dep.actualTime?.local ?? ""),
      arriveTime: formatTime(arr.scheduledTime?.local ?? arr.actualTime?.local ?? ""),
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

  if (live.status && live.status !== stored.status) {
    changes.push(`Status: ${live.status}`);
  }
  if (live.terminal && live.terminal !== stored.terminal) {
    changes.push(`Terminal: ${live.terminal}`);
  }
  if (live.arrTerminal && live.arrTerminal !== stored.arrTerminal) {
    changes.push(`Arrival terminal: ${live.arrTerminal}`);
  }
  if (live.gate && live.gate !== stored.gate) {
    changes.push(`Gate: ${live.gate}`);
  }
  if (live.departTime && live.departTime !== stored.time) {
    changes.push(`Departure: ${live.departTime}`);
  }

  return changes;
}

// ── Push notifications ─────────────────────────────────────────────────────

async function sendFlightNotifications(updates: FlightUpdate[]) {
  // Get push tokens from Firestore
  let tokens: string[] = [];
  try {
    const tokenDocs = await listCollection("push_tokens");
    tokens = tokenDocs
      .map(d => decodeValue(d.fields?.token))
      .filter((t): t is string => !!t);
  } catch {
    return;
  }
  if (tokens.length === 0) return;

  for (const update of updates) {
    const title = `Flight ${update.flightNum} Update`;
    const body = update.changes.join(" · ");

    const messages = tokens.map(token => ({
      to: token,
      title,
      body,
      data: { tripId: update.tripId, category: "flight_status", flightNum: update.flightNum },
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

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
