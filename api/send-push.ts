import { queryDocuments, queryDocumentsIn, getDocument, decodeValue } from "./_firebaseAdmin.js";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { sendPush, logPush } from "./_expoPush.js";

/** True if the user owns the trip or belongs to the trip's organization. */
async function canManageTrip(uid: string, tripId: string): Promise<boolean> {
  const trip = await getDocument("trips", tripId).catch(() => null);
  if (!trip) return false;
  const fields = trip.fields ?? {};
  if (decodeValue(fields.user_id) === uid) return true;
  const orgId = decodeValue(fields.organization_id);
  if (!orgId) return false;
  return !!(await getDocument("org_members", `${uid}_${orgId}`).catch(() => null));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers["authorization"] ?? "";
  const token = auth.replace("Bearer ", "");
  const payload = await verifyFirebaseToken(token);
  if (!payload) return res.status(401).json({ error: "Unauthorized" });

  if (!rateLimit(req, res, { bucket: "send-push", limit: 30, windowMs: 60_000 })) return;

  const { deviceId, title, body } = req.body ?? {};
  if (!deviceId || !title || !body) {
    return res.status(400).json({ error: "deviceId, title, and body required" });
  }
  if (typeof deviceId !== "string" || typeof title !== "string" || title.length > 200 || typeof body !== "string" || body.length > 1000) {
    return res.status(400).json({ error: "Title max 200 chars, body max 1000 chars" });
  }

  try {
    // The key names a person: their account (uid), or their device for joins made before accounts.
    // Only an organizer of a trip they've joined may message them, otherwise any
    // signed-in user (travelers included) could push to anyone.
    const memberships = [
      ...await queryDocuments("trip_members", "uid", deviceId, 500),
      ...await queryDocuments("trip_members", "device_id", deviceId, 500),
    ];
    const tripIds = [...new Set(memberships.map(d => decodeValue(d.fields?.trip_id)).filter(Boolean))] as string[];
    let allowedTrip: string | null = null;
    for (const tripId of tripIds) {
      if (await canManageTrip(payload.sub!, tripId)) { allowedTrip = tripId; break; }
    }
    if (!allowedTrip) return res.status(403).json({ error: "Not authorized to message this user" });

    // Every phone this person has joined from, plus tokens saved against their account
    const deviceIds = [...new Set([deviceId, ...memberships.map(d => String(decodeValue(d.fields?.device_id) ?? ""))].filter(Boolean))];
    const tokenDocs = [
      ...await queryDocumentsIn("push_tokens", "device_id", deviceIds),
      ...await queryDocuments("push_tokens", "user_id", deviceId, 10),
    ];
    const tokens = [...new Set(tokenDocs.map(d => decodeValue(d.fields?.token)).filter((t): t is string => typeof t === "string" && !!t))];

    if (!tokens.length) {
      return res.json({ sent: 0, reason: "No push token found for this user" });
    }

    const results = await sendPush(tokens.map(to => ({ to, title, body, sound: "default" })));
    const sent = results.filter(r => r?.status === "ok").length;
    const tripName = memberships.find(d => decodeValue(d.fields?.trip_id) === allowedTrip)?.fields?.trip_name;
    await logPush({
      tripId: allowedTrip,
      tripName: String(decodeValue(tripName) ?? ""),
      category: "message",
      title,
      body,
      recipients: [deviceId, ...deviceIds, ...memberships.map(d => String(decodeValue(d.fields?.uid) ?? ""))],
      sentBy: payload.sub!,
      tickets: results,
    });

    res.json({ sent, result: results[0] });
  } catch (err: any) {
    console.error("[send-push] Error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
