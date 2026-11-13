import { getDocument, queryDocumentsRange, queryDocumentsIn, updateDocument, setDocument, touchTripVersion, decodeValue, encodeValue, docId, type FirestoreDoc } from "./_firebaseAdmin.js";
import { pickBookedFlight } from "./_validate.js";
import type { AeroFlight } from "./_flightsCore.js";
import type { ApiRequest, ApiResponse } from "./_rateLimit.js";
import { airportTz } from "./_airportTz.js";
import { isCronRequest } from "./_cronAuth.js";
import { isDue, isFarOut, scheduleDifference, statusGroup, timeToMins, NOTIFY_GROUPS } from "./_flightSchedule.js";
import { fetchAero, isPerSecondLimit } from "./_flightsCore.js";
import { flightNumberOf } from "./_flightNumber.js";
import { readAllowance, allowanceLevel, shouldWarn, isAllowanceRefusal, type Allowance } from "./_flightAllowance.js";
import { sendPush, logPush, checkPushReceipts, newPushLogId } from "./_expoPush.js";
import { sendEmail } from "./_mailer.js";
import { flightProblemEmail, flightScheduleEmail, flightAllowanceEmail } from "../src/lib/email/templates.js";

/**
 * Cron job: checks AeroDataBox for status updates on upcoming flights,
 * updates Firestore trip events, and sends push notifications to travelers.
 *
 * Runs every 15 minutes via Vercel Cron (see vercel.json); _flightSchedule.ts
 * decides which flights are due on each run.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  // Verify cron secret to prevent unauthorized calls
  if (!isCronRequest(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log(`check-flight-status running on Node ${process.version}`);

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) return res.status(500).json({ error: "RAPIDAPI_KEY not configured" });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  let flightsChecked = 0;

  try {
    // 1. Trips still running (or ending yesterday, for overnight arrivals); the rest can't have a due flight
    const since = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
    const tripDocs = await queryDocumentsRange("trips", "end_date", "GREATER_THAN_OR_EQUAL", since);
    const updates: FlightUpdate[] = [];
    const scheduleAlerts: ScheduleAlert[] = [];
    // One lookup per flight per run, however many events or trips share it
    const usage: LookupUsage = { allowance: null, refused: false };
    const lookups = new Map<string, Promise<LiveFlightData | null>>();
    const lookup = (flightNum: string, date: string, event: StoredFlightEvent) => {
      const key = `${flightNum.replace(/\s+/g, "").toUpperCase()}:${date}:${event.depAirport || ''}:${event.arrAirport || ''}:${event.time || ''}`;
      let pending = lookups.get(key);
      if (!pending) {
        flightsChecked++;
        pending = lookupFlight(flightNum, date, rapidApiKey, usage, event);
        lookups.set(key, pending);
      }
      return pending;
    };
    const tripsToUpdate: Map<string, { doc: FirestoreDoc; events: StoredFlightEvent[] }> = new Map();

    for (const tripDoc of tripDocs) {
      const fields = tripDoc.fields ?? {};
      const tripName = (decodeValue(fields.name) ?? "Trip") as string;
      const rawEvents = (decodeValue(fields.events) ?? []) as StoredFlightEvent[];
      const travellerNames = new Map(((decodeValue(fields.travelers) ?? []) as { id?: unknown; name?: unknown }[])
        .filter(t => typeof t?.id === "string").map(t => [t.id as string, String(t.name ?? "")]));
      let tripChanged = false;

      for (let i = 0; i < rawEvents.length; i++) {
        const ev = rawEvents[i];
        const flightNum = flightNumberOf(ev);
        if (ev.type !== "flight" || !flightNum || !ev.date) continue;

        if (!isDue(ev, now)) continue;
        const eventDate = (ev.date as string).slice(0, 10);

        // Query AeroDataBox
        const result = await lookup(flightNum, eventDate, ev);
        if (!result) continue;

        // Save missing route details even when nothing changed: without the
        // departure zone, later runs would time their checks hours off
        for (const k of ["depTz", "arrTz", "depAirport", "arrAirport", "depCoords", "arrCoords"] as const) {
          if (!ev[k] && result[k]) { (rawEvents[i] as Record<string, unknown>)[k] = result[k]; tripChanged = true; }
        }

        // Days away, the feed can be wrong and plans can still change: an organiser hears about it and decides
        if (isFarOut(ev, now)) {
          const difference = scheduleDifference(ev, result);
          if (difference) {
            rawEvents[i].scheduleNotified = difference.key;
            tripChanged = true;
            scheduleAlerts.push({ tripId: docId(tripDoc), tripName, flightNum: ev.flightNum, eventId: ev.id ?? "", details: difference.lines });
          }
          continue;
        }

        // Revised times and the landing moment are saved quietly: the board shows how late a
        // flight is, and the belt checks after landing count from arrivedAt
        // Only a move of 5 minutes or more is saved: every save reloads travellers' apps and makes an
        // organiser's open editor start again, and estimates drift by a minute between runs
        for (const k of ["revisedTime", "revisedEndTime"] as const) {
          const live = timeToMins(result[k]), stored = timeToMins(ev[k]);
          if (live !== null && (stored === null || Math.abs(live - stored) >= 5)) { rawEvents[i][k] = result[k]; tripChanged = true; }
          // An estimate the feed has withdrawn goes too, so the flight stops reading as late
          else if (live === null && ev[k]) { rawEvents[i][k] = ""; tripChanged = true; }
        }
        // Useful to have, not worth a notification
        if (result.checkInDesk && result.checkInDesk !== ev.checkInDesk) { rawEvents[i].checkInDesk = result.checkInDesk; tripChanged = true; }
        if (statusGroup(result.status) === "arrived" && !ev.arrivedAt) { rawEvents[i].arrivedAt = now.toISOString(); tripChanged = true; }

        // Detect changes
        const changes = detectChanges(ev, result);
        if (changes.length === 0) continue;

        // Every change is saved, but only the ones travelers act on send a push
        const statusNews = statusGroup(result.status) !== statusGroup(ev.status) && NOTIFY_GROUPS.has(statusGroup(result.status));
        const notify = statusNews || changes.some(c => !c.startsWith("Status: "));
        // ev is rawEvents[i], so read the old status before the fields below overwrite it
        const statusChanged = !!result.status && result.status !== ev.status;

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
          status: statusChanged ? result.status : undefined,
          changes,
          gate: rawEvents[i].gate || undefined,
          terminal: rawEvents[i].terminal || undefined,
          assignedTo: Array.isArray(ev.assignedTo) ? ev.assignedTo.filter((id): id is string => typeof id === "string") : [],
          assignedNames: (Array.isArray(ev.assignedTo) ? ev.assignedTo : []).map(id => travellerNames.get(String(id)) ?? "").filter(Boolean),
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
        await touchTripVersion(id);
      } catch (err) {
        console.warn(`check-flight-status: skipped trip ${id}:`, err instanceof Error ? err.message : err);
      }
    }

    // 3. Send push notifications for what was saved
    const sent = updates.filter(u => written.has(u.tripId));
    if (sent.length > 0) {
      await sendFlightNotifications(sent);
    }
    // A failed alert email must never stop the job that keeps flights current
    await emailCoordinators(sent, tripDocs).catch(err => {
      console.warn("check-flight-status: coordinator emails failed:", err instanceof Error ? err.message : err);
    });

    await emailScheduleChanges(scheduleAlerts.filter(a => written.has(a.tripId)), tripDocs).catch(err => {
      console.warn("check-flight-status: schedule emails failed:", err instanceof Error ? err.message : err);
    });
    await reportAllowance(usage, now).catch(err => {
      console.warn("check-flight-status: allowance report failed:", err instanceof Error ? err.message : err);
    });

    // Receipts of earlier pushes: drops tokens of phones that uninstalled the app
    const receipts = await checkPushReceipts().catch((err) => {
      console.warn("push receipts:", err instanceof Error ? err.message : err);
      return null;
    });

    res.json({
      checked: today,
      receipts,
      tripsScanned: tripDocs.length,
      flightsChecked,
      allowance: usage.allowance,
      allowanceRefused: usage.refused,
      tripsWritten: written.size,
      notified: sent.map(u => ({ flight: u.flightNum, changes: u.changes })),
    });
  } catch (err) {
    console.error("check-flight-status error:", err);
    res.status(500).json({ error: (err as { message?: string }).message ?? "Internal error" });
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

interface ScheduleAlert {
  tripId: string;
  tripName: string;
  flightNum: string;
  eventId: string;
  details: string[];
}

/** What this run's lookups said about the allowance */
interface LookupUsage {
  allowance: Allowance | null;
  refused: boolean;
}

interface FlightUpdate {
  tripId: string;
  tripName: string;
  flightNum: string;
  title: string;
  eventId: string;
  /** Set when the flight's status itself changed, e.g. "Delayed" */
  status?: string;
  changes: string[];
  /** The gate and terminal as now known, so a boarding notice can say where to go even when neither changed */
  gate?: string;
  terminal?: string;
  /** The travellers on this flight; none means the whole group */
  assignedTo: string[];
  assignedNames: string[];
}

/** The fields of a stored trip event this job reads and writes; events carry others that pass through untouched. */
interface StoredFlightEvent {
  id?: string;
  type?: string;
  title?: string;
  date?: string;
  endDate?: string;
  time?: string;
  endTime?: string;
  location?: string;
  flightNum?: string;
  /** Traveller ids on this flight; empty or missing means the whole group */
  assignedTo?: unknown[];
  /** The schedule difference an organiser was last emailed about, so it's sent once */
  scheduleNotified?: string;
  status?: string;
  terminal?: string;
  arrTerminal?: string;
  gate?: string;
  arrGate?: string;
  checkInDesk?: string;
  baggageBelt?: string;
  aircraft?: string;
  revisedTime?: string;
  revisedEndTime?: string;
  arrivedAt?: string;
  depAirport?: string;
  arrAirport?: string;
  depTz?: string;
  arrTz?: string;
  depCoords?: [number, number];
  arrCoords?: [number, number];
}

interface LiveFlightData {
  status: string;
  terminal: string;
  arrTerminal: string;
  gate: string;
  arrGate: string;
  checkInDesk: string;
  baggageBelt: string;
  departTime: string;
  arriveTime: string;
  /** Best current estimate, "" when AeroDataBox has none */
  revisedTime: string;
  revisedEndTime: string;
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
  usage: LookupUsage,
  event: StoredFlightEvent,
): Promise<LiveFlightData | null> {
  const clean = flightNum.replace(/\s+/g, "");
  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${clean}/${date}`;

  try {
    const resp = await fetchAero(url, apiKey);
    usage.allowance = readAllowance(resp.headers) ?? usage.allowance;
    // Going too fast isn't running out, so it doesn't send the "allowance used up" email
    if (isAllowanceRefusal(resp.status) && !await isPerSecondLimit(resp)) usage.refused = true;
    if (!resp.ok) return null;
    const data: unknown = await resp.json();

    const flights = (Array.isArray(data) ? data as AeroFlight[] : [])
      .filter((f) => f.codeshareStatus !== "IsCodeshared");

    if (flights.length === 0) return null;

    const f = pickBookedFlight(flights, { ...event, date });
    if (!f) return null;
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
      checkInDesk: dep.checkInDesk ?? "",
      baggageBelt: arr.baggageBelt ?? "",
      departTime: formatTime(dep.scheduledTime?.local ?? dep.actualTime?.local ?? ""),
      arriveTime: formatTime(arr.scheduledTime?.local ?? arr.actualTime?.local ?? ""),
      revisedTime: formatTime(dep.revisedTime?.local ?? dep.predictedTime?.local ?? ""),
      revisedEndTime: formatTime(arr.revisedTime?.local ?? arr.predictedTime?.local ?? arr.runwayTime?.local ?? arr.actualTime?.local ?? ""),
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

function detectChanges(stored: StoredFlightEvent, live: LiveFlightData): string[] {
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

/** Logs what's left on every run, and warns once per level per billing period. Set FLIGHT_ALERTS_EMAIL to get the warning by email. */
async function reportAllowance(usage: LookupUsage, now: Date) {
  const { allowance, refused } = usage;
  if (!allowance && !refused) return;
  const resetsAt = allowance?.resetsInSeconds ? new Date(now.getTime() + allowance.resetsInSeconds * 1000) : null;
  console.log(`check-flight-status: allowance ${allowance ? `${allowance.remaining} of ${allowance.limit} units left` : "unknown"}${refused ? ", lookups refused" : ""}`);
  const level = allowanceLevel(allowance, refused);
  if (!level) return;
  console.error(`check-flight-status: flight lookups ${level}`);
  const period = resetsAt ? resetsAt.toISOString().slice(0, 10) : "unknown";
  const stored = await getDocument("usage", "flight-allowance").catch(() => null);
  const warned = { level: decodeValue(stored?.fields?.level), period: decodeValue(stored?.fields?.period) };
  if (!shouldWarn(level, warned, period)) return;
  const to = process.env.FLIGHT_ALERTS_EMAIL;
  if (to) {
    const sent = await sendEmail({ to, ...flightAllowanceEmail({
      level,
      remaining: allowance?.remaining ?? null,
      limit: allowance?.limit ?? null,
      resetsOn: resetsAt ? resetsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }) : null,
      url: "https://rapidapi.com/developer/billing/subscriptions-and-usage",
    }) });
    // Not recorded as warned, so the next run tries again
    if (!sent.ok) { console.warn("check-flight-status: allowance email failed:", "error" in sent ? sent.error : ""); return; }
  }
  await setDocument("usage", "flight-allowance", { level: encodeValue(level), period: encodeValue(period) });
}

/** A profile's email, if it has a usable one */
async function profileEmail(uid: unknown): Promise<string | null> {
  if (typeof uid !== "string" || !uid) return null;
  const profile = await getDocument("profiles", uid).catch(() => null);
  const email = profile?.fields ? decodeValue(profile.fields.email) : null;
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Tells a trip's creator and coordinators a flight days away no longer matches. A private trip is its creator's alone. */
async function emailScheduleChanges(alerts: ScheduleAlert[], tripDocs: FirestoreDoc[]) {
  const appUrl = (process.env.VITE_APP_URL ?? "https://dalefy.app").replace(/\/$/, "");
  for (const alert of alerts) {
    const fields = tripDocs.find(doc => docId(doc) === alert.tripId)?.fields ?? {};
    const coordinators = decodeValue(fields.private) === true ? [] : decodeValue(fields.coordinators);
    const uids = [decodeValue(fields.user_id), ...(Array.isArray(coordinators) ? coordinators.map(c => (c as { userId?: unknown }).userId) : [])];
    const emails = new Set((await Promise.all(uids.map(profileEmail))).filter((e): e is string => !!e));
    const message = flightScheduleEmail({
      tripName: alert.tripName,
      flight: alert.flightNum,
      details: alert.details,
      manageUrl: `${appUrl}/#/trip/${alert.tripId}?event=${alert.eventId}`,
    });
    for (const to of emails) {
      const sent = await sendEmail({ to, ...message });
      if (!sent.ok) console.warn("check-flight-status: schedule email failed:", "error" in sent ? sent.error : "");
    }
  }
}

/** Tells a trip's coordinators when one of its flights goes wrong. Travellers hear separately, by push. */
async function emailCoordinators(updates: FlightUpdate[], tripDocs: FirestoreDoc[]) {
  const PROBLEMS: Record<string, string> = { delayed: "delayed", cancelled: "cancelled", diverted: "diverted" };
  const appUrl = (process.env.VITE_APP_URL ?? "https://dalefy.app").replace(/\/$/, "");
  for (const update of updates) {
    const problem = PROBLEMS[statusGroup(update.status)];
    if (!problem) continue;
    const fields = tripDocs.find(doc => docId(doc) === update.tripId)?.fields ?? {};
    // Only the creator can open a private trip, so an alert would point nobody anywhere
    if (decodeValue(fields.private) === true) continue;
    const coordinators = decodeValue(fields.coordinators);
    if (!Array.isArray(coordinators) || coordinators.length === 0) continue;
    const message = flightProblemEmail({
      tripName: update.tripName,
      flight: update.flightNum,
      problem,
      details: update.changes.filter(change => !change.startsWith("Status: ")),
      manageUrl: `${appUrl}/#/trip/${update.tripId}?event=${update.eventId}`,
    });
    for (const coordinator of coordinators) {
      const uid = (coordinator as { userId?: unknown }).userId;
      if (typeof uid !== "string" || !uid) continue;
      const profileDoc = await getDocument("profiles", uid).catch(() => null);
      const email = profileDoc?.fields ? decodeValue(profileDoc.fields.email) : null;
      if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      const sent = await sendEmail({ to: email, ...message });
      if (!sent.ok) console.warn("check-flight-status: coordinator email failed:", "error" in sent ? sent.error : "");
    }
  }
}

async function sendFlightNotifications(updates: FlightUpdate[]) {
  // Resolve push tokens per trip: trip_members maps trip_id → device_id,
  // push_tokens maps device_id → token. Only that trip's members get notified.
  let memberDocs: FirestoreDoc[] = [];
  let tokenDocs: FirestoreDoc[] = [];
  try {
    // Only the updated trips' members, then only their devices' tokens
    memberDocs = await queryDocumentsIn("trip_members", "trip_id", updates.map(u => u.tripId));
    tokenDocs = await queryDocumentsIn("push_tokens", "device_id", memberDocs.map(m => String(decodeValue(m.fields?.device_id) ?? "")));
  } catch {
    return;
  }

  const tokenByDevice = new Map<string, string>();
  for (const d of tokenDocs) {
    const deviceId = decodeValue(d.fields?.device_id) as string | null;
    const token = decodeValue(d.fields?.token) as string | null;
    if (deviceId && token) tokenByDevice.set(deviceId, token);
  }

  // Each member's phone, which traveller they are, and whether they lead the trip
  type Member = { tripId: string; token?: string; people: string[]; traveller: string; leader: boolean };
  const members: Member[] = [];
  for (const m of memberDocs) {
    const tripId = decodeValue(m.fields?.trip_id) as string | null;
    if (!tripId) continue;
    const deviceId = decodeValue(m.fields?.device_id) as string | null;
    members.push({
      tripId,
      token: deviceId ? tokenByDevice.get(deviceId) : undefined,
      people: [String(deviceId ?? ""), String(decodeValue(m.fields?.uid) ?? "")],
      traveller: String(decodeValue(m.fields?.linked_traveler_id) ?? ""),
      leader: decodeValue(m.fields?.role) === "leader",
    });
  }

  for (const update of updates) {
    const onTrip = members.filter(m => m.tripId === update.tripId);
    // A flight assigned to some travellers goes to them; one assigned to no one is the whole group's.
    // Leaders not on it still hear, told whose flight it is.
    const assigned = new Set(update.assignedTo);
    const onFlight = assigned.size ? onTrip.filter(m => assigned.has(m.traveller)) : onTrip;
    const leadersOnly = assigned.size ? onTrip.filter(m => m.leader && !assigned.has(m.traveller)) : [];
    const own = flightPushCopy(update);
    const groups = [
      { who: onFlight, ...own },
      { who: leadersOnly, title: `${whoseFlight(update.assignedNames)}: ${own.title}`, body: own.body },
    ];

    for (const { who, title, body } of groups) {
      const tokens = [...new Set(who.map(m => m.token).filter((t): t is string => !!t))];
      if (tokens.length === 0) continue;
      const logId = newPushLogId();

      const messages = tokens.map(token => ({
        to: token,
        title,
        subtitle: update.tripName,
        body,
        data: { tripId: update.tripId, eventId: update.eventId, category: "flight_status", flightNum: update.flightNum, logId },
        // "View flight" button, and it comes through Focus modes
        categoryId: "flight",
        // iOS stacks each trip's notifications together
        threadId: update.tripId,
        interruptionLevel: "time-sensitive" as const,
        sound: "default" as const,
      }));

      const tickets = await sendPush(messages);
      await logPush({
        tripId: update.tripId,
        tripName: update.tripName,
        category: "flight",
        title,
        body,
        // Only these people, so the inbox on other phones doesn't pick it up either
        recipients: who.flatMap(m => m.people),
        sentBy: "system",
        tickets,
        target: { eventId: update.eventId },
      }, logId);
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** "Kieran's flight", "Laura and Michelle's flight", "3 travellers' flight", by first name */
function whoseFlight(names: string[]): string {
  const first = names.map(n => n.trim().split(/\s+/)[0]).filter(Boolean);
  if (first.length === 0) return "Group flight";
  if (first.length === 1) return `${first[0]}'s flight`;
  if (first.length === 2) return `${first[0]} and ${first[1]}'s flight`;
  return `${first.length} travellers' flight`;
}

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
  // With nothing new to list, say where the flight goes from rather than a generic line
  const where = [update.terminal ? `Terminal ${update.terminal}` : "", update.gate ? `gate ${update.gate}` : ""].filter(Boolean).join(", ");
  const body = lines.length ? lines.join("\n")
    : where ? `${status === "boarding" ? "Head to" : "Departs from"} ${where}`
    : "Open the trip for the latest details.";
  return { title, body };
}
