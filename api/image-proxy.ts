import { rateLimit } from "./_rateLimit.js";
import { resolveTarget, fetchImage } from "./_imageProxyCore.js";
import { HttpError } from "./_httpError.js";

export default async function handler(req: any, res: any) {
  if (!rateLimit(req, res, { bucket: "image-proxy", limit: 200, windowMs: 60_000 })) return;

  const { url, photo } = req.query as Record<string, string>;

  try {
    const { target } = resolveTarget(url, photo, process.env.GOOGLE_API_KEY);
    const { contentType, buffer } = await fetchImage(target);

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
  } catch (e) {
    if (e instanceof HttpError) {
      if (!e.message) return res.status(e.status).end();
      return res.status(e.status).json({ error: e.message });
    }
    res.status(502).json({ error: "Failed to fetch image" });
  }
}
