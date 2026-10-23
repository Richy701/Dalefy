import Anthropic from "@anthropic-ai/sdk";
import { getDocument, incrementCounter, decodeValue, type FirestoreDoc } from "./_firebaseAdmin.js";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { aiErrorToHttp } from "./_parseItineraryCore.js";
import { publishedTripView, membershipMatches, record } from "./_tripView.js";
import { runTripChat, tripContext, validateChatInput } from "./_tripChatCore.js";

function decode(doc: FirestoreDoc | null): Record<string, unknown> {
  return doc ? Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decodeValue(v)])) : {};
}

interface Request {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface Response {
  setHeader(name: string, value: string | number): void;
  status(code: number): Response;
  json(body: unknown): void;
}

export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Spends Anthropic credits: signed-in trip members only
  const auth = req.headers["authorization"] ?? "";
  const payload = await verifyFirebaseToken(String(auth).replace(/^Bearer\s+/i, ""));
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });

  if (!rateLimit(req, res, { bucket: "trip-chat", limit: 10, windowMs: 60_000 })) return;

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const body = record(req.body);
  const tripId = body.tripId;
  if (typeof tripId !== "string" || !/^[\w-]{1,150}$/.test(tripId)) return res.status(400).json({ error: "Invalid trip ID" });

  try {
    const input = validateChatInput(body);
    const [found, memberDoc] = await Promise.all([
      getDocument("trips", tripId),
      getDocument("trip_members", `${payload.sub}_${tripId}`),
    ]);
    const member = decode(memberDoc);
    if (!found || !membershipMatches(member, payload.sub, tripId)) return res.status(403).json({ error: "Join this trip to ask about it" });
    const view = publishedTripView(tripId, decode(found), member.role === "leader", true);
    if (!view) return res.status(404).json({ error: "Itinerary unavailable" });

    // A hard daily cap per person bounds the bill, whatever the client does
    const cap = Number(process.env.TRIP_CHAT_DAILY_CAP) || 40;
    const day = new Date().toISOString().slice(0, 10);
    const used = await incrementCounter("usage", `trip-chat-${payload.sub}-${day}`, "count").catch((err) => {
      console.warn("trip-chat usage count failed:", err instanceof Error ? err.message : err);
      return 0;
    });
    if (used > cap) return res.status(429).json({ error: "That's a lot of questions for one day. Ask again tomorrow, or get in touch with your organiser." });

    const linked = typeof member.linked_traveler_id === "string" && member.linked_traveler_id ? member.linked_traveler_id : null;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const result = await runTripChat(client, tripContext(view, linked), input);
    return res.status(200).json(result);
  } catch (err) {
    console.error("trip-chat error:", err);
    const { status, error } = aiErrorToHttp(err);
    return res.status(status).json({ error });
  }
}
