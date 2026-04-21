export default async function handler(req: any, res: any) {
  const { url } = req.query as Record<string, string>;

  if (!url) return res.status(400).json({ error: "Missing param: url" });

  // Only proxy known image CDNs
  const allowed = [
    "images.unsplash.com",
    "images.pexels.com",
    "api.mapbox.com",
  ];
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!allowed.some((h) => hostname.endsWith(h))) {
    return res.status(403).json({ error: "Domain not allowed" });
  }

  try {
    const resp = await fetch(url);
    if (!resp.ok) return res.status(resp.status).end();

    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await resp.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(buffer);
  } catch {
    res.status(502).json({ error: "Failed to fetch image" });
  }
}
