import Anthropic from "@anthropic-ai/sdk";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { runParse, runAssist, aiErrorToHttp } from "./_parseItineraryCore.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Require a valid Firebase token — this endpoint spends Anthropic credits.
  const auth = req.headers["authorization"] ?? "";
  const payload = await verifyFirebaseToken(auth.replace("Bearer ", ""));
  if (!payload) return res.status(401).json({ error: "Unauthorized" });

  // Cap per-user request rate as a second line of defence against abuse.
  if (!rateLimit(req, res, { bucket: "parse-itinerary", limit: 20, windowMs: 60_000 })) return;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const url = new URL(req.url!, `http://${req.headers.host}`);

  if (url.searchParams.get("mode") === "assist") {
    const { type, title, location, date, time, destination } = req.body ?? {};
    if (!title && !location) {
      return res.status(400).json({ error: "Provide at least a title or location" });
    }
    try {
      const result = await runAssist(client, { type, title, location, date, time, destination });
      return res.status(200).json(result);
    } catch (err) {
      console.error("assist-event error:", err);
      const { status, error } = aiErrorToHttp(err);
      return res.status(status).json({ error });
    }
  }

  const { text, images, pdf } = req.body ?? {};
  const hasText = text && typeof text === "string";
  const hasImages = Array.isArray(images) && images.length > 0;
  const hasPdf = pdf && typeof pdf === "string";
  if (!hasText && !hasImages && !hasPdf) {
    return res.status(400).json({ error: "Missing 'text', 'images', or 'pdf' in request body" });
  }

  try {
    const result = await runParse(client, { text, images, pdf });
    return res.status(200).json(result);
  } catch (err) {
    console.error("parse-itinerary error:", err);
    const { status, error } = aiErrorToHttp(err);
    return res.status(status).json({ error });
  }
}
