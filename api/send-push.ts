import { canEditTrip } from "./_tripPermissions.js";
import { queryDocuments, queryDocumentsIn, getDocument, decodeValue, type FirestoreDoc } from "./_firebaseAdmin.js";
import { verifyFirebaseToken, impersonationOf, type Impersonation } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { sendPush, logPush, newPushLogId } from "./_expoPush.js";

/** True if the user owns the trip or belongs to the trip's organization. */
async function canManageTrip(uid: string, tripId: string, imp: Impersonation | null): Promise<boolean> {
  const trip = await getDocument("trips", tripId).catch(() => null);
  if (!trip) return false;
  return canEditTrip(uid, trip.fields ?? {}, imp);
}

interface Person { key: string; name: string; uid: string; deviceIds: string[]; travelerIds: string[] }

/** One entry per person on the trip: their account if they signed in, else their device, so two phones aren't two people */
function peopleOf(memberDocs: FirestoreDoc[]): Person[] {
  const byKey = new Map<string, Person>();
  for (const d of memberDocs) {
    const f = d.fields ?? {};
    const uid = String(decodeValue(f.uid) ?? "");
    const deviceId = String(decodeValue(f.device_id) ?? "");
    const key = uid || deviceId;
    if (!key) continue;
    const p = byKey.get(key) ?? { key, name: "", uid, deviceIds: [], travelerIds: [] };
    if (!p.name) p.name = String(decodeValue(f.name) ?? "");
    if (deviceId && !p.deviceIds.includes(deviceId)) p.deviceIds.push(deviceId);
    const linked = String(decodeValue(f.linked_traveler_id) ?? "");
    if (linked && !p.travelerIds.includes(linked)) p.travelerIds.push(linked);
    byKey.set(key, p);
  }
  return [...byKey.values()];
}

type Audience = "all" | { people: string[] } | { eventId: string };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers["authorization"] ?? "";
  const token = auth.replace("Bearer ", "");
  const payload = await verifyFirebaseToken(token, { allowImpersonation: true });
  if (!payload) return res.status(401).json({ error: "Unauthorized" });
  const imp = impersonationOf(payload);

  if (!rateLimit(req, res, { bucket: "send-push", limit: 30, windowMs: 60_000 })) return;

  // Older clients send { deviceId, title, body } for one person
  const { deviceId, body, target, urgent, dryRun } = req.body ?? {};
  let { tripId, to, title } = req.body ?? {};
  if (!to && typeof deviceId === "string") to = { people: [deviceId] };
  if (title === "Dalefy") title = "";
  if (!to || (!dryRun && (typeof body !== "string" || !body.trim()))) {
    return res.status(400).json({ error: "to and body required" });
  }
  if ((title && (typeof title !== "string" || title.length > 200)) || (typeof body === "string" && body.length > 1000)) {
    return res.status(400).json({ error: "Title max 200 chars, body max 1000 chars" });
  }
  const audience = to as Audience;

  try {
    // Without a trip (old one-person requests), use the first trip of theirs this organiser runs
    if (!tripId && audience !== "all" && "people" in audience && audience.people.length === 1) {
      const key = audience.people[0];
      const memberships = [
        ...await queryDocuments("trip_members", "uid", key, 500),
        ...await queryDocuments("trip_members", "device_id", key, 500),
      ];
      for (const id of new Set(memberships.map(d => String(decodeValue(d.fields?.trip_id) ?? "")).filter(Boolean))) {
        if (await canManageTrip(payload.sub!, id, imp)) { tripId = id; break; }
      }
    }
    if (typeof tripId !== "string" || !tripId) return res.status(403).json({ error: "Not authorized to message this user" });
    // Only the trip's own organisers may message its travellers
    if (!(await canManageTrip(payload.sub!, tripId, imp))) return res.status(403).json({ error: "Not authorized for this trip" });

    const trip = await getDocument("trips", tripId);
    const tripName = String(decodeValue(trip?.fields?.name) ?? "");
    const everyone = peopleOf(await queryDocuments("trip_members", "trip_id", tripId, 20000));

    let chosen: Person[];
    if (audience === "all") {
      chosen = everyone;
    } else if ("people" in audience) {
      const keys = new Set(audience.people);
      chosen = everyone.filter(p => keys.has(p.key) || p.deviceIds.some(id => keys.has(id)) || (p.uid && keys.has(p.uid)));
    } else {
      // Everyone the event is assigned to; an event assigned to no one is for the whole group
      const events: { id?: string; assignedTo?: unknown }[] = decodeValue(trip?.fields?.events) ?? [];
      const ev = events.find(e => e?.id === audience.eventId);
      if (!ev) return res.status(404).json({ error: "Event not found" });
      const assigned = new Set<string>(Array.isArray(ev.assignedTo) ? ev.assignedTo : []);
      chosen = assigned.size ? everyone.filter(p => p.travelerIds.some(id => assigned.has(id))) : everyone;
    }

    // Every phone they joined from, plus tokens saved against their account
    const tokenDocs = [
      ...await queryDocumentsIn("push_tokens", "device_id", chosen.flatMap(p => p.deviceIds)),
      ...await queryDocumentsIn("push_tokens", "user_id", chosen.map(p => p.uid).filter(Boolean)),
    ];
    const tokensOf = new Map<string, string[]>();
    for (const p of chosen) {
      const ids = new Set([...p.deviceIds, p.uid].filter(Boolean));
      const tokens = tokenDocs
        .filter(d => ids.has(String(decodeValue(d.fields?.device_id) ?? "")) || ids.has(String(decodeValue(d.fields?.user_id) ?? "")))
        .map(d => decodeValue(d.fields?.token))
        .filter((t): t is string => typeof t === "string" && !!t);
      tokensOf.set(p.key, [...new Set(tokens)]);
    }

    const reachable = chosen.filter(p => (tokensOf.get(p.key) ?? []).length > 0);
    if (dryRun) {
      return res.json({
        recipients: chosen.map(p => ({ key: p.key, name: p.name, reachable: reachable.includes(p) })),
        tripName,
      });
    }

    const tapTarget = {
      ...(typeof target?.eventId === "string" && target.eventId ? { eventId: target.eventId } : {}),
      ...(typeof target?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(target.date) ? { date: target.date } : {}),
      ...(typeof target?.infoId === "string" && target.infoId ? { infoId: target.infoId } : {}),
    };
    const logId = newPushLogId();
    const finalTitle = (title as string)?.trim() || tripName || "Message from your organiser";
    const messages = reachable.flatMap(p => (tokensOf.get(p.key) ?? []).map(to => ({
      to,
      title: finalTitle,
      // The trip in the iOS subtitle, unless it is already the title
      ...(finalTitle !== tripName && tripName ? { subtitle: tripName } : {}),
      body: body.trim(),
      data: { tripId, category: "message", logId, ...tapTarget },
      categoryId: tapTarget.eventId ? "event" : "trip",
      // iOS stacks each trip's notifications together
      threadId: tripId,
      // Urgent ones come through Focus modes, like flight alerts
      interruptionLevel: urgent ? "time-sensitive" as const : "active" as const,
      sound: "default" as const,
    })));

    // Who each message is for, in send order, so tickets map back to people
    const owners = reachable.flatMap(p => (tokensOf.get(p.key) ?? []).map(() => p.key));
    const tickets = await sendPush(messages);
    const delivered = new Set(owners.filter((_, i) => tickets[i]?.status === "ok"));
    const results = chosen.map(p => ({
      key: p.key,
      name: p.name,
      status: delivered.has(p.key) ? "sent" : reachable.includes(p) ? "failed" : "no_notifications",
    }));

    await logPush({
      tripId,
      tripName,
      category: "message",
      title: finalTitle,
      body: body.trim(),
      recipients: chosen.flatMap(p => [p.key, p.uid, ...p.deviceIds]),
      sentBy: payload.sub!,
      tickets,
      target: tapTarget,
      missed: results.filter(r => r.status !== "sent").map(r => r.key),
    }, logId);

    res.json({ sent: delivered.size, total: chosen.length, results, logId });
  } catch (err: any) {
    console.error("[send-push] Error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
