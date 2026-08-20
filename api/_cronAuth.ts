import { timingSafeEqual } from "node:crypto";

/**
 * True only when CRON_SECRET is configured AND the Authorization header
 * matches it exactly. Guarding on the env var matters: without it, an unset
 * CRON_SECRET would make `Bearer undefined` a valid credential.
 */
export function isCronRequest(req: any): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = String(req.headers?.["authorization"] ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(auth);
  return got.length === expected.length && timingSafeEqual(got, expected);
}
