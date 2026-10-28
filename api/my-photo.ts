import { queryDocuments, getDocument, updateDocument, touchTripVersion, decodeValue, encodeValue, docId } from "./_firebaseAdmin.js";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";

/**
 * POST /api/my-photo  { avatar }  (bearer token)
 *
 * A traveller's own photo reaches the trips they're linked to, but only where the organiser hasn't attached
 * one: the organiser's headshot always wins and is never replaced from the phone. The photo must be the
 * caller's own upload (avatars/{uid}/ in this project's bucket), and only trips whose membership links this
 * account to a traveller are touched. The trip and its published copy both get it, so the app shows it.
 */
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const payload = await verifyFirebaseToken(String(req.headers["authorization"] ?? "").replace(/^Bearer\s+/i, ""));
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  if (!rateLimit(req, res, { bucket: "my-photo", limit: 10, windowMs: 10 * 60_000 })) return;

  const avatar = typeof req.body?.avatar === "string" ? req.body.avatar.trim() : "";
  const bucket = process.env.VITE_FIREBASE_STORAGE_BUCKET ?? "";
  const own = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/avatars%2F${encodeURIComponent(payload.sub)}%2F`;
  if (!bucket || !avatar.startsWith(own) || avatar.length > 1000) return res.status(400).json({ error: "Not your uploaded photo" });

  const members = await queryDocuments("trip_members", "uid", payload.sub, 50);
  let updated = 0;
  for (const m of members) {
    const tripId = decodeValue(m.fields?.trip_id);
    const linked = decodeValue(m.fields?.linked_traveler_id);
    if (typeof tripId !== "string" || typeof linked !== "string" || !linked) continue;
    try {
      const trip = await getDocument("trips", tripId);
      if (!trip) continue;
      const fill = (list: unknown) => {
        if (!Array.isArray(list)) return null;
        let changed = false;
        const next = list.map((t: Record<string, unknown>) => {
          if (t?.id !== linked || (typeof t.avatar === "string" && t.avatar)) return t;
          changed = true;
          return { ...t, avatar };
        });
        return changed ? next : null;
      };
      const travelers = fill(decodeValue(trip.fields?.travelers));
      const snapshot = decodeValue(trip.fields?.published_snapshot) as Record<string, unknown> | null;
      const snapTravelers = snapshot ? fill(snapshot.travelers) : null;
      if (!travelers && !snapTravelers) continue;
      const fields: Record<string, unknown> = {};
      const mask: string[] = [];
      if (travelers) { fields.travelers = encodeValue(travelers); mask.push("travelers"); }
      if (snapTravelers) { fields.published_snapshot = encodeValue({ travelers: snapTravelers }); mask.push("published_snapshot.travelers"); }
      // Only if nobody saved the trip since we read it; a missed fill is retried the next time they save a photo
      await updateDocument("trips", docId(trip), fields, mask, trip.updateTime);
      await touchTripVersion(docId(trip)).catch(() => {});
      updated++;
    } catch (err) {
      console.warn("my-photo: skipped trip", tripId, err instanceof Error ? err.message : err);
    }
  }
  return res.status(200).json({ updated });
}
