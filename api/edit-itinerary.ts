import Anthropic from "@anthropic-ai/sdk";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { aiErrorToHttp } from "./_parseItineraryCore.js";
import { runEdit, validateEditInput } from "./_editItineraryCore.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Require a valid Firebase token — this endpoint spends Anthropic credits.
  const auth = req.headers["authorization"] ?? "";
  const payload = await verifyFirebaseToken(auth.replace("Bearer ", ""), { allowImpersonation: true });
  if (!payload) return res.status(401).json({ error: "Unauthorized" });

  if (!rateLimit(req, res, { bucket: "edit-itinerary", limit: 20, windowMs: 60_000 })) return;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  try {
    const input = validateEditInput(req.body);
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const result = await runEdit(client, input);
    return res.status(200).json(result);
  } catch (err) {
    console.error("edit-itinerary error:", err);
    const { status, error } = aiErrorToHttp(err);
    return res.status(status).json({ error });
  }
}
