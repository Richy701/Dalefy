import { getDocument, queryDocuments, updateDocument, decodeValue, encodeValue, type FirestoreDoc } from "./_firebaseAdmin.js";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { record, publishedTripView, membershipMatches, mergeTravelerMedia } from "./_tripView.js";

interface Request {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface Response {
  setHeader(name: string, value: string): void;
  status(code: number): Response;
  json(body: unknown): void;
}
function decode(doc: FirestoreDoc | null): Record<string, unknown> {
  return doc ? Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decodeValue(v)])) : {};
}

export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, res, { bucket: "trip-access", limit: 90, windowMs: 60_000 })) return;
  const authorization = req.headers.authorization;
  const payload = typeof authorization === "string" ? await verifyFirebaseToken(authorization.replace(/^Bearer\s+/i, "")) : null;
  if (authorization && !payload) return res.status(401).json({ error: "Unauthorized" });
  const body = record(req.body);
  const id = req.method === "GET" ? req.query.id : body.tripId;
  const code = req.query.code;
  if (id !== undefined && (typeof id !== "string" || !/^[\w-]{1,150}$/.test(id))) return res.status(400).json({ error: "Invalid trip ID" });
  if (code !== undefined && (typeof code !== "string" || !/^[A-Z0-9]{4,6}$/.test(code))) return res.status(400).json({ error: "Invalid code" });
  if (!id && !code) return res.status(400).json({ error: "Trip ID or code required" });
  try {
    const matches = id ? [] : await queryDocuments("trips", "short_code", code as string, 2);
    const found = id ? await getDocument("trips", id as string) : matches.length === 1 ? matches[0] : null;
    if (!found) return res.status(404).json({ error: "Itinerary unavailable" });
    const tripId = found.name.split("/").pop()!;
    const trip = decode(found);
    const member = payload?.sub ? decode(await getDocument("trip_members", `${payload.sub}_${tripId}`)) : {};
    const joined = !!payload?.sub && membershipMatches(member, payload.sub, tripId);
    const view = publishedTripView(tripId, trip, joined && member.role === "leader", joined);
    if (!view) return res.status(404).json({ error: "Itinerary unavailable" });
    if (req.method === "GET") return res.json({ trip: view });
    if (!payload?.sub || !joined) return res.status(403).json({ error: "Join this trip before changing its gallery" });
    const bucket = process.env.VITE_FIREBASE_STORAGE_BUCKET;
    if (!bucket) return res.status(503).json({ error: "Storage not configured" });
    const media = mergeTravelerMedia(trip.media, body.add ?? [], body.remove ?? [], payload.sub, tripId, bucket);
    // Precondition prevents replacing a concurrent organizer/gallery update.
    if (!found.updateTime) throw new Error("Missing database revision");
    await updateDocument("trips", tripId, { media: encodeValue(media) }, ["media"], found.updateTime);
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Database conflict") return res.status(409).json({ error: "Trip changed. Refresh and try again." });
    if (error instanceof Error && /^(Invalid media|Invalid upload|You can only|Upload must|Trip media)/.test(error.message)) return res.status(400).json({ error: error.message });
    console.error("[trip] Request failed", error);
    return res.status(503).json({ error: "Itinerary temporarily unavailable" });
  }
}
