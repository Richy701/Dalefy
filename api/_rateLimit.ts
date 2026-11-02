/**
 * Lightweight in-memory rate limiter for API routes.
 *
 * Keyed by client IP + bucket name, using a sliding window. State lives in the
 * function instance's memory, so on Vercel Fluid Compute it persists across
 * requests handled by the same warm instance and resets on cold start. This is
 * a best-effort abuse throttle, not a distributed quota — it exists to stop a
 * single client from hammering the key-proxying endpoints in a tight loop.
 */

import type { IncomingHttpHeaders } from "node:http";

/** What the Vercel handlers read from a request. Also what vite.config.ts passes them in local dev. */
export interface ApiRequest {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string };
}

/** What the Vercel handlers call on a response. Also what vite.config.ts passes them in local dev. */
export interface ApiResponse {
  setHeader(name: string, value: string | number): unknown;
  status(code: number): ApiResponse;
  json(data: unknown): unknown;
}

/** Vercel's response for handlers that send a non-JSON body. The local dev stand-in doesn't have these. */
export interface ApiSendResponse extends ApiResponse {
  status(code: number): ApiSendResponse;
  send(data: string | Buffer): unknown;
  end(): unknown;
}

const WINDOWS = new Map<string, number[]>();

function clientIp(req: Pick<ApiRequest, "headers" | "socket">): string {
  const fwd = req.headers?.["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * Returns true if the request is allowed. If the limit is exceeded, sends a 429
 * response and returns false — the caller should `return` immediately.
 */
export function rateLimit(
  req: Pick<ApiRequest, "headers" | "socket">,
  res: Pick<ApiResponse, "setHeader"> & { status(code: number): { json(data: unknown): unknown } },
  opts: { bucket: string; limit: number; windowMs: number },
): boolean {
  const key = `${opts.bucket}:${clientIp(req)}`;
  const now = Date.now();
  const recent = (WINDOWS.get(key) ?? []).filter((t) => now - t < opts.windowMs);

  if (recent.length >= opts.limit) {
    res.setHeader("Retry-After", Math.ceil(opts.windowMs / 1000));
    res.status(429).json({ error: "Too many requests, please slow down." });
    return false;
  }

  recent.push(now);
  WINDOWS.set(key, recent);

  // Opportunistic cleanup so the map can't grow unbounded across many IPs.
  if (WINDOWS.size > 5000) {
    for (const [k, times] of WINDOWS) {
      if (times.every((t) => now - t >= opts.windowMs)) WINDOWS.delete(k);
    }
  }

  return true;
}
