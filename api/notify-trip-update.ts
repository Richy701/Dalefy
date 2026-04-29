/**
 * Notify trip members of itinerary changes via Expo push notifications.
 *
 * Called from the web app after a trip leader saves changes.
 * Queries trip_members to find who's on the trip, then push_tokens
 * to get their Expo push tokens, and sends via Expo Push API.
 *
 * POST /api/notify-trip-update
 * Body: { tripId, tripName, changes: string[] }
 */

import { listCollection, decodeValue, type FirestoreDoc } from "./_firebaseAdmin";
import { verifyFirebaseToken } from "./_verifyToken.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers["authorization"] ?? "";
  const token = auth.replace("Bearer ", "");
  const payload = await verifyFirebaseToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { tripId, tripName, changes } = req.body ?? {};
  if (!tripId || !tripName || !Array.isArray(changes) || !changes.length) {
    return res.status(400).json({ error: "tripId, tripName, and changes[] required" });
  }

  try {
    // 1. Get all trip members for this trip
    const allMembers = await listCollection("trip_members");
    const memberDeviceIds = new Set<string>();

    for (const doc of allMembers) {
      const fields = doc.fields ?? {};
      const docTripId = decodeValue(fields.trip_id);
      const deviceId = decodeValue(fields.device_id);
      if (docTripId === tripId && deviceId) {
        memberDeviceIds.add(deviceId);
      }
    }

    if (memberDeviceIds.size === 0) {
      return res.json({ sent: 0, reason: "No members found for trip" });
    }

    // 2. Get push tokens for those devices
    const allTokens = await listCollection("push_tokens");
    const tokens: string[] = [];

    for (const doc of allTokens) {
      const fields = doc.fields ?? {};
      const deviceId = decodeValue(fields.device_id);
      const token = decodeValue(fields.token);
      if (deviceId && memberDeviceIds.has(deviceId) && token) {
        tokens.push(token);
      }
    }

    if (tokens.length === 0) {
      return res.json({ sent: 0, reason: "No push tokens found for trip members" });
    }

    // 3. Build notification
    const title = `${tripName} Updated`;
    const body = changes.length === 1
      ? changes[0]
      : changes.slice(0, 3).join(", ") + (changes.length > 3 ? ` +${changes.length - 3} more` : "");

    // 4. Send via Expo Push API (batches of 100)
    const messages = tokens.map(token => ({
      to: token,
      title,
      body,
      data: { tripId, category: "update" },
      sound: "default" as const,
    }));

    const results: any[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        const resp = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(chunk),
        });
        results.push(await resp.json());
      } catch {
        results.push({ error: "Failed to send chunk" });
      }
    }

    res.json({ sent: tokens.length, results });
  } catch (err: any) {
    console.error("[notify-trip-update] Error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
