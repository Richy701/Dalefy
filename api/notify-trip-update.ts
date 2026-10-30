import { canEditTrip } from "./_tripPermissions.js";
/**
 * Notify trip members of itinerary changes.
 *
 * Called from the web app after a trip leader saves changes.
 * Queries trip_members to find who's on the trip, then push_tokens
 * to get their Expo push tokens, and sends via Expo Push API.
 * Automatic updates are push-only. Email is sent only through explicit
 * invitation and itinerary-send actions, never as a fallback for edits.
 *
 * POST /api/notify-trip-update
 * Body: { tripId, tripName, changes: string[] }
 * Response: { sent (push count), emailed, results }
 */

import { queryDocuments, queryDocumentsIn, getDocument, decodeValue } from "./_firebaseAdmin.js";
import { verifyFirebaseToken, impersonationOf } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { sendPush, logPush, newPushLogId } from "./_expoPush.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers["authorization"] ?? "";
  const token = auth.replace("Bearer ", "");
  const payload = await verifyFirebaseToken(token, { allowImpersonation: true });
  if (!payload) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!rateLimit(req, res, { bucket: "notify-trip-update", limit: 30, windowMs: 60_000 })) return;

  const { tripId, tripName, changes, excludeDeviceId } = req.body ?? {};
  if (!tripId || !tripName || !Array.isArray(changes) || !changes.length) {
    return res.status(400).json({ error: "tripId, tripName, and changes[] required" });
  }

  try {
    // Caller must own the trip or belong to the trip's organization —
    // otherwise any signed-in user could push messages to any trip's members.
    const trip = await getDocument("trips", String(tripId)).catch(() => null);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    const tripFields = trip.fields ?? {};
    const allowed = await canEditTrip(payload.sub!, tripFields, impersonationOf(payload));
    if (!allowed) return res.status(403).json({ error: "Not authorized for this trip" });

    // 1. This trip's members
    const allMembers = await queryDocuments("trip_members", "trip_id", String(tripId), 20000);
    const memberDeviceIds = new Set<string>();

    for (const doc of allMembers) {
      const fields = doc.fields ?? {};
      const docTripId = decodeValue(fields.trip_id);
      const deviceId = decodeValue(fields.device_id);
      if (docTripId === tripId && deviceId && deviceId !== excludeDeviceId) {
        memberDeviceIds.add(deviceId);
      }
    }

    // 2. Push tokens for those devices
    const allTokens = await queryDocumentsIn("push_tokens", "device_id", [...memberDeviceIds]);
    const tokens: string[] = [];

    for (const doc of allTokens) {
      const fields = doc.fields ?? {};
      const deviceId = decodeValue(fields.device_id);
      const token = decodeValue(fields.token);
      if (deviceId && memberDeviceIds.has(deviceId) && token) {
        tokens.push(token);
      }
    }

    // Keep the response field for existing clients; automatic updates never email.
    const emailed = 0;

    if (tokens.length === 0) {
      return res.json({ sent: 0, emailed, reason: memberDeviceIds.size === 0 ? "No members found for trip" : "No push tokens found for trip members" });
    }

    // 3. Build notification
    // The trip goes in the iOS subtitle; the changes read one per line
    const title = changes.every((c: string) => / added \d+ photo/.test(c)) ? "New photos from the trip"
      : changes.length === 1 && changes[0] === "Trip published" ? "Your trip is ready"
      : "Your itinerary has changed";
    const extra = changes.length - 3;
    const body = changes.slice(0, 3).join("\n") + (extra > 0 ? `\nand ${extra} more change${extra === 1 ? "" : "s"}` : "");

    // 4. Send via Expo Push API (batches of 100)
    const logId = newPushLogId();
    const messages = tokens.map(token => ({
      to: token,
      title,
      subtitle: tripName,
      body,
      data: { tripId, category: "update", logId },
      categoryId: "trip",
      // iOS stacks each trip's notifications together
      threadId: String(tripId),
      sound: "default" as const,
    }));

    const results = await sendPush(messages);
    await logPush({
      tripId: String(tripId),
      tripName: String(tripName),
      category: "trip_update",
      title,
      body,
      recipients: allMembers.flatMap(d => [String(decodeValue(d.fields?.device_id) ?? ""), String(decodeValue(d.fields?.uid) ?? "")]),
      sentBy: payload.sub ?? "",
      tickets: results,
    }, logId);

    res.json({ sent: tokens.length, emailed, results });
  } catch (err: any) {
    console.error("[notify-trip-update] Error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
