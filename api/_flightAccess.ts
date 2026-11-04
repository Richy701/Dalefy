/**
 * Who may spend flight lookups. They cost money, so a signed-in request gets the normal limit and an
 * anonymous one a tight limit. Phones on older versions don't send a token yet, so anonymous requests
 * stay allowed until FLIGHT_LOOKUP_REQUIRE_SIGN_IN is "true"; set it once phones have updated.
 */
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit, type ApiRequest, type ApiResponse } from "./_rateLimit.js";

const SIGNED_IN_PER_MINUTE = 40;
const ANONYMOUS_PER_MINUTE = 10;

/** Returns whether the caller is signed in, or null when a response has already been sent */
export async function allowFlightLookup(req: ApiRequest, res: ApiResponse, bucket: string): Promise<{ signedIn: boolean } | null> {
  const auth = req.headers.authorization;
  const token = typeof auth === "string" ? auth.replace(/^Bearer\s+/i, "") : "";
  const signedIn = !!token && !!(await verifyFirebaseToken(token, { allowImpersonation: true }).catch(() => null));
  if (!signedIn && process.env.FLIGHT_LOOKUP_REQUIRE_SIGN_IN === "true") {
    res.status(401).json({ error: "Sign in to look up flights" });
    return null;
  }
  const allowed = signedIn
    ? rateLimit(req, res, { bucket, limit: SIGNED_IN_PER_MINUTE, windowMs: 60_000 })
    : rateLimit(req, res, { bucket: `${bucket}-anonymous`, limit: ANONYMOUS_PER_MINUTE, windowMs: 60_000 });
  return allowed ? { signedIn } : null;
}

const CACHE_MS = 120_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; value: unknown }>();

/**
 * The CDN doesn't share responses to requests carrying a token, so signed-in phones share lookups here
 * instead: a group watching one flight costs one lookup every two minutes, not one per phone.
 * Empty answers aren't kept, since one can mean the allowance ran out rather than no such flight.
 */
export async function sharedLookup<T extends { flights?: unknown[] }>(key: string, lookup: () => Promise<T>, now = Date.now()): Promise<T> {
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.value as T;
  const value = await lookup();
  if (value.flights?.length) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: now, value });
  }
  return value;
}

/** Anonymous answers can sit on the CDN; a signed-in one stays with the caller */
export const lookupCacheControl = (signedIn: boolean) => (signedIn ? "private, max-age=60" : "public, max-age=60, s-maxage=120");
