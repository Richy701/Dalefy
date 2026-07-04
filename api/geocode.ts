import { rateLimit } from "./_rateLimit.js";

export default async function handler(req: any, res: any) {
  if (!rateLimit(req, res, { bucket: "geocode", limit: 120, windowMs: 60_000 })) return;

  const { q, proximity } = req.query as Record<string, string>;

  if (!q) return res.status(400).json({ error: "Missing param: q" });

  const token = process.env.MAPBOX_TOKEN;
  if (!token) return res.status(500).json({ error: "MAPBOX_TOKEN not configured" });

  try {
    const encoded = encodeURIComponent(q);
    let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&limit=1`;
    if (proximity) url += `&proximity=${proximity}`;
    const resp = await fetch(url);
    if (!resp.ok) return res.status(resp.status).json({ error: "Mapbox error" });

    const data = await resp.json();
    const feat = data?.features?.[0];
    if (!feat?.center) return res.json({ coord: null });

    // Return [lat, lng]
    res.json({ coord: [feat.center[1], feat.center[0]] });
  } catch {
    res.status(500).json({ error: "Failed to geocode" });
  }
}
