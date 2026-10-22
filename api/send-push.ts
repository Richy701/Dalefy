import { queryDocuments, getDocument, decodeValue } from "./_firebaseAdmin.js";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { sendPush } from "./_expoPush.js";

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
    // Only an organizer of a trip this device has joined may message it,
    // otherwise any signed-in user (travelers included) could push to anyone.
    const memberships = await queryDocuments("trip_members", "device_id", deviceId, 500);
    const tripIds = [...new Set(memberships.map(d => decodeValue(d.fields?.trip_id)).filter(Boolean))] as string[];
    let allowed = false;
    for (const tripId of tripIds) {
      if (await canManageTrip(payload.sub!, tripId)) { allowed = true; break; }
    }
    if (!allowed) return res.status(403).json({ error: "Not authorized to message this user" });

    const allTokens = await queryDocuments("push_tokens", "device_id", deviceId, 10);
    let pushToken: string | null = null;

    for (const doc of allTokens) {
      const fields = doc.fields ?? {};
      if (decodeValue(fields.device_id) === deviceId) {
        pushToken = decodeValue(fields.token);
        break;
      }
    }

    if (!pushToken) {
      return res.json({ sent: 0, reason: "No push token found for this device" });
    }

    const [result] = await sendPush([{ to: pushToken, title, body, sound: "default" }]);

    res.json({ sent: result?.status === "ok" ? 1 : 0, result });
  } catch (err: any) {
    console.error("[send-push] Error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
