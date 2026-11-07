import { createHash } from "node:crypto";
import { getDocument, updateDocument, touchTripVersion, decodeValue, encodeValue, type FirestoreDoc } from "./_firebaseAdmin.js";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit, type ApiRequest, type ApiResponse } from "./_rateLimit.js";
import { record, membershipMatches, publishedTripView } from "./_tripView.js";
import { applyPhotoLike } from "./_mediaLikes.js";
import { logPush } from "./_expoPush.js";

const decode = (doc: FirestoreDoc | null) => doc ? Object.fromEntries(Object.entries(doc.fields ?? {}).map(([key, value]) => [key, decodeValue(value)])) : {};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const token = await verifyFirebaseToken(String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
  if (!token?.sub) return res.status(401).json({ error: "Unauthorized" });
  if (!rateLimit(req, res, { bucket: "photo-likes", limit: 60, windowMs: 60_000 })) return;
  const { tripId, mediaId, liked } = record(req.body);
  if (typeof tripId !== "string" || !/^[\w-]{1,150}$/.test(tripId) || typeof mediaId !== "string" || !/^[\w.-]{1,150}$/.test(mediaId) || typeof liked !== "boolean") return res.status(400).json({ error: "Invalid like" });
  try {
    const member = decode(await getDocument("trip_members", `${token.sub}_${tripId}`));
    if (!membershipMatches(member, token.sub, tripId)) return res.status(403).json({ error: "Join this trip to like photos" });
    for (let attempt = 0; attempt < 3; attempt++) {
      const found = await getDocument("trips", tripId);
      const trip = decode(found);
      if (!found?.updateTime || !publishedTripView(tripId, trip, false, true)) return res.status(404).json({ error: "Trip unavailable" });
      const travelers = record(trip.published_snapshot).travelers;
      const traveler = Array.isArray(travelers) ? travelers.map(record).find(person => person.id === member.linked_traveler_id) : null;
      const name = typeof traveler?.name === "string" ? traveler.name : typeof member.name === "string" ? member.name : "Traveller";
      // The picture they set in the app comes first; the organiser's photo of them only fills in without one
      const avatar = typeof member.avatar === "string" && member.avatar ? member.avatar : typeof traveler?.avatar === "string" && traveler.avatar ? traveler.avatar : undefined;
      const result = applyPhotoLike(trip.media, mediaId, token.sub, name, liked, avatar);
      try {
        await updateDocument("trips", tripId, { media: encodeValue(result.media) }, ["media"], found.updateTime);
      } catch (error) {
        if (error instanceof Error && error.message === "Database conflict" && attempt < 2) continue;
        throw error;
      }
      await touchTripVersion(tripId);
      if (result.added && typeof result.photo.uploaderId === "string" && result.photo.uploaderId !== token.sub) {
        await logPush({ tripId, tripName: String(trip.name ?? "Your trip"), category: "trip_update", title: "Someone liked your photo", body: `${name.trim().slice(0, 80) || "A traveller"} liked your photo in ${String(trip.name ?? "your trip")}.`, recipients: [result.photo.uploaderId], sentBy: token.sub, tickets: [], target: { mediaId }, senderAvatar: avatar }, `${Math.floor(Date.now() / 86400000) * 86400000}-like-${createHash("sha256").update(JSON.stringify([tripId, mediaId, token.sub])).digest("hex").slice(0, 24)}`);
      }
      return res.status(200).json({ likes: result.likes });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Photo not found") return res.status(404).json({ error: "Photo not found" });
    console.error("[media-like]", error);
    return res.status(503).json({ error: "Couldn’t save your like. Try again." });
  }
}
