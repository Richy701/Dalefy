export default async function handler(req: any, res: any) {
  const { url } = req.query as Record<string, string>;

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

  // Block private/internal hostnames
  const host = parsed.hostname;
  if (
    host === "localhost" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    return res.status(403).json({ error: "Private addresses not allowed" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(url, { signal: controller.signal });
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

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(buffer);
  } catch {
    res.status(502).json({ error: "Failed to fetch image" });
  }
}
