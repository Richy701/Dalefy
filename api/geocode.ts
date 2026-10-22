import { rateLimit } from "./_rateLimit.js";
import { geocode, suggest, PROXIMITY_RE, WITHIN_RE, COUNTRY_RE } from "./_geocodeCore.js";
import { errorToHttp } from "./_httpError.js";
import { incrementCounter } from "./_firebaseAdmin.js";

export default async function handler(req: any, res: any) {
  if (!rateLimit(req, res, { bucket: "geocode", limit: 120, windowMs: 60_000 })) return;

  const { q, proximity, mode, country, within } = req.query as Record<string, string>;

  if (!q) return res.status(400).json({ error: "Missing param: q" });
  if (proximity && !PROXIMITY_RE.test(proximity)) {
    return res.status(400).json({ error: "Invalid proximity — expected lng,lat" });
  }
  if (country && !COUNTRY_RE.test(country)) return res.status(400).json({ error: "Invalid country" });
  if (within && !WITHIN_RE.test(within)) return res.status(400).json({ error: "Invalid within" });

  const token = process.env.MAPBOX_TOKEN;
  if (!token) return res.status(500).json({ error: "MAPBOX_TOKEN not configured" });

  // Saved lookups are Mapbox permanent geocoding: billed per request, no free tier.
  // A hard monthly cap bounds the bill even across many IPs or a runaway client.
  // (Repeat queries are served from the CDN cache and never reach this count.)
  if (mode !== "suggest") {
    const cap = Number(process.env.MAPBOX_PERMANENT_MONTHLY_CAP) || 2000;
    const month = new Date().toISOString().slice(0, 7);
    const used = await incrementCounter("usage", `mapbox-permanent-${month}`, "count").catch((err) => {
      console.warn("geocode usage count failed:", err instanceof Error ? err.message : err);
      return 0;
    });
    if (used > cap) {
      console.warn(`Mapbox permanent geocoding cap reached: ${used} > ${cap} this month`);
      return res.status(429).json({ error: "Location lookups are paused until next month" });
    }
  }

  try {
    const payload = mode === "suggest"
      ? await suggest(q, proximity, token)
      : await geocode(q, proximity, token, { country, within });
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.json(payload);
  } catch (e) {
    const { status, error } = errorToHttp(e, "Failed to geocode");
    res.status(status).json({ error });
  }
}
