/**
 * Shared core for the image proxy: target resolution (Google Places photo
 * references + SSRF-guarded external URLs) and the guarded image fetch.
 * Imported by BOTH api/image-proxy.ts (Vercel) and vite.config.ts (local dev)
 * so the security checks can never drift.
 */
import https from "node:https";
import type { IncomingMessage } from "node:http";
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

  assertPublicHost(parsed);

  return { target: url };
}

function assertPublicHost(parsed: URL): void {
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
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 5000;

/**
 * Raw https GET. Unlike global fetch (undici) this never decodes
 * Content-Encoding, so attacker-controlled Brotli bytes never reach the
 * zlib decoder (CVE-2026-111497). Redirects are followed by hand so every
 * hop passes the same HTTPS + public-host guard as the original URL.
 */
function getRaw(url: string, deadline: number): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new HttpError(502, "Failed to fetch image"));
    const req = https.get(url, { headers: { "accept-encoding": "identity", "user-agent": "node" } }, (resp) => {
      clearTimeout(timer);
      resolve(resp);
    });
    const timer = setTimeout(() => req.destroy(new Error("timeout")), remaining);
    req.on("error", () => {
      clearTimeout(timer);
      reject(new HttpError(502, "Failed to fetch image"));
    });
  });
}

function readBody(resp: IncomingMessage, deadline: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => resp.destroy(new Error("timeout")), Math.max(0, deadline - Date.now()));
    resp.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        clearTimeout(timer);
        resp.destroy();
        reject(new HttpError(413, "Image too large"));
        return;
      }
      chunks.push(chunk);
    });
    resp.on("end", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    resp.on("error", () => {
      clearTimeout(timer);
      reject(new HttpError(502, "Failed to fetch image"));
    });
  });
}

/** Wikimedia originals can be tens of megabytes; its own 1280px copy (a standard width it serves) is plenty for a photo and fits the limit */
function wikimediaThumb(target: string): string {
  const m = target.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/([a-z-]+)\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+\.(?:jpe?g|png|webp))(?:[?#].*)?$/i);
  return m ? `https://upload.wikimedia.org/wikipedia/${m[1]}/thumb/${m[2]}/${m[3]}/${m[4]}/1280px-${m[4]}` : target;
}

export async function fetchImage(target: string): Promise<{ contentType: string; buffer: Buffer }> {
  const deadline = Date.now() + TIMEOUT_MS;
  let url = wikimediaThumb(target);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const resp = await getRaw(url, deadline);
    const status = resp.statusCode ?? 0;

    if (status >= 300 && status < 400 && resp.headers.location) {
      resp.resume();
      let next: URL;
      try {
        next = new URL(resp.headers.location, url);
      } catch {
        throw new HttpError(502, "Failed to fetch image");
      }
      if (next.protocol !== "https:") throw new HttpError(403, "Only HTTPS allowed");
      assertPublicHost(next);
      url = next.href;
      continue;
    }

    // Empty message → respond with the upstream status and no body
    if (status < 200 || status >= 300) {
      resp.resume();
      throw new HttpError(status || 502, "");
    }

    // Compressed bodies are refused rather than decoded (see getRaw).
    const encoding = String(resp.headers["content-encoding"] ?? "identity").toLowerCase();
    if (encoding !== "identity") {
      resp.destroy();
      throw new HttpError(502, "Failed to fetch image");
    }

    const length = Number(resp.headers["content-length"]);
    if (Number.isFinite(length) && length > MAX_BYTES) {
      resp.destroy();
      throw new HttpError(413, "Image too large");
    }

    const contentType = resp.headers["content-type"] || "image/jpeg";

    // Verify response is actually an image
    if (!contentType.startsWith("image/")) {
      resp.destroy();
      throw new HttpError(403, "Response is not an image");
    }

    const buffer = await readBody(resp, deadline);
    return { contentType, buffer };
  }

  throw new HttpError(502, "Failed to fetch image");
}
