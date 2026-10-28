import Anthropic from "@anthropic-ai/sdk";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { runParse, aiErrorToHttp } from "./_parseItineraryCore.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * POST /api/parse-itinerary-stream: the live import screen's version of /api/parse-itinerary.
 * A web-standard handler, because Vercel only streams a returned ReadableStream; the Node
 * (req, res) helpers hold the body until the function ends. One JSON line per update while
 * the trip is written ({type:"partial"}), then {type:"done", result} or {type:"error"}.
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await verifyFirebaseToken((request.headers.get("authorization") ?? "").replace("Bearer ", ""));
  if (!payload) return json(401, { error: "Unauthorized" });

  let limited: Response | null = null;
  const reqLike = { headers: { "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "" } };
  const resLike = {
    setHeader: () => {},
    status: (code: number) => ({ json: (body: unknown) => { limited = json(code, body); } }),
  };
  if (!rateLimit(reqLike, resLike, { bucket: "parse-itinerary", limit: 20, windowMs: 60_000 })) return limited ?? json(429, { error: "Too many requests" });

  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: "ANTHROPIC_API_KEY not configured" });

  const body = await request.json().catch(() => null) as { text?: unknown; images?: unknown; pdf?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : undefined;
  const images = Array.isArray(body?.images) ? body.images.filter((i): i is string => typeof i === "string") : undefined;
  const pdf = typeof body?.pdf === "string" ? body.pdf : undefined;
  if (!text && !images?.length && !pdf) return json(400, { error: "Missing 'text', 'images', or 'pdf' in request body" });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const line = (data: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
      try {
        const result = await runParse(client, { text, images, pdf }, partial => line({ type: "partial", partial }));
        line({ type: "done", result });
      } catch (err) {
        console.error("parse-itinerary-stream error:", err);
        line({ type: "error", ...aiErrorToHttp(err) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
