/**
 * Shared core for the image proxy: target resolution (Google Places photo
 * references + SSRF-guarded external URLs) and the guarded image fetch.
 * Imported by BOTH api/image-proxy.ts (Vercel) and vite.config.ts (local dev)
 * so the security checks can never drift.
 */
import { HttpError } from "./_httpError.js";

export function resolveTarget(
  url: string | undefined,
  photo: string | undefined,
  googleKey: string | undefined,
): { target: string } {
  if (photo) {
    // Google Places photo reference — resolved server-side so the API key
    // never appears in URLs returned to the client.
    if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(photo)) {
      throw new HttpError(400, "Invalid photo reference");
    }
    if (!googleKey) throw new HttpError(500, "GOOGLE_API_KEY not configured");
    return { target: `https://places.googleapis.com/v1/${photo}/media?maxHeightPx=400&maxWidthPx=600&key=${googleKey}` };
  }

  if (!url) throw new HttpError(400, "Missing param: url");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(400, "Invalid URL");
  }

  // Block non-HTTPS and dangerous protocols
  if (parsed.protocol !== "https:") {
    throw new HttpError(403, "Only HTTPS allowed");
  }

  // Block private/internal hostnames (IPv4 and IPv6).
  // URL.hostname keeps the brackets on IPv6 literals ("[::1]"), so strip them
  // before matching or every v6 check below silently misses.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
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
    (isV6 && (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80") ||
      // IPv4-mapped/compatible forms such as ::ffff:127.0.0.1
      host.startsWith("::ffff:") ||
      host.startsWith("::127.") ||
      host.startsWith("::10.")
    )) ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new HttpError(403, "Private addresses not allowed");
  }

  return { target: url };
}

export async function fetchImage(target: string): Promise<{ contentType: string; buffer: Buffer }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  let resp: Response;
  try {
    resp = await fetch(target, { signal: controller.signal });
  } catch {
    throw new HttpError(502, "Failed to fetch image");
  } finally {
    clearTimeout(timeout);
  }

  // Empty message → respond with the upstream status and no body
  if (!resp.ok) throw new HttpError(resp.status, "");

  const contentType = resp.headers.get("content-type") || "image/jpeg";

  // Verify response is actually an image
  if (!contentType.startsWith("image/")) {
    throw new HttpError(403, "Response is not an image");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await resp.arrayBuffer());
  } catch {
    throw new HttpError(502, "Failed to fetch image");
  }

  // Reject responses over 5MB
  if (buffer.length > 5 * 1024 * 1024) {
    throw new HttpError(413, "Image too large");
  }

  return { contentType, buffer };
}
