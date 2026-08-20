import { rateLimit } from "./_rateLimit.js";
import { geocode, suggest, PROXIMITY_RE } from "./_geocodeCore.js";
import { errorToHttp } from "./_httpError.js";

export default async function handler(req: any, res: any) {
  if (!rateLimit(req, res, { bucket: "geocode", limit: 120, windowMs: 60_000 })) return;

  const { q, proximity, mode } = req.query as Record<string, string>;

  if (!q) return res.status(400).json({ error: "Missing param: q" });
  if (proximity && !PROXIMITY_RE.test(proximity)) {
    return res.status(400).json({ error: "Invalid proximity — expected lng,lat" });
  }

  const token = process.env.MAPBOX_TOKEN;
  if (!token) return res.status(500).json({ error: "MAPBOX_TOKEN not configured" });

  try {
    const payload = mode === "suggest"
      ? await suggest(q, proximity, token)
      : await geocode(q, proximity, token);
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.json(payload);
  } catch (e) {
    const { status, error } = errorToHttp(e, "Failed to geocode");
    res.status(status).json({ error });
  }
}
