import { rateLimit } from "./_rateLimit.js";

export default async function handler(req: any, res: any) {
  if (!rateLimit(req, res, { bucket: "image-proxy", limit: 200, windowMs: 60_000 })) return;

  const { url, photo } = req.query as Record<string, string>;

  let target: string;

  if (photo) {
    // Google Places photo reference — resolved server-side so the API key
    // never appears in URLs returned to the client.
    if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(photo)) {
      return res.status(400).json({ error: "Invalid photo reference" });
    }
    const gKey = process.env.GOOGLE_API_KEY;
    if (!gKey) return res.status(500).json({ error: "GOOGLE_API_KEY not configured" });
    target = `https://places.googleapis.com/v1/${photo}/media?maxHeightPx=400&maxWidthPx=600&key=${gKey}`;
  } else {
    if (!url) return res.status(400).json({ error: "Missing param: url" });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    // Block non-HTTPS and dangerous protocols
    if (parsed.protocol !== "https:") {
      return res.status(403).json({ error: "Only HTTPS allowed" });
    }

    // Block private/internal hostnames (IPv4 and IPv6)
    const host = parsed.hostname;
    const isV6 = host.includes(":");
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.startsWith("0.") ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      (isV6 && (host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"))) ||
      host.endsWith(".internal") ||
      host.endsWith(".local")
    ) {
      return res.status(403).json({ error: "Private addresses not allowed" });
    }

    target = url;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(target, { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) return res.status(resp.status).end();

    const contentType = resp.headers.get("content-type") || "image/jpeg";

    // Verify response is actually an image
    if (!contentType.startsWith("image/")) {
      return res.status(403).json({ error: "Response is not an image" });
    }

    const buffer = Buffer.from(await resp.arrayBuffer());

    // Reject responses over 5MB
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "Image too large" });
    }

    const origin = req.headers.origin ?? "";
    const host = req.headers.host ?? "";
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        if (originHost === host || originHost.endsWith(".vercel.app")) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
      } catch { /* invalid origin — skip header */ }
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch {
    res.status(502).json({ error: "Failed to fetch image" });
  }
}
