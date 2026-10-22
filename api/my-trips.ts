/**
 * The trips a signed-in traveller's email is on, and who they are on each.
 *
 * Organisers list travellers by (work) email; the app can't search trips itself, so it asks here after sign-in.
 * The email comes from the verified Firebase ID token, never from the request, and the reply carries only the
 * caller's own traveller id and name plus the same published view /api/trip serves. Other travellers' emails
 * are never returned.
 *
 * Trips are found through `traveler_emails`, which the web app writes on every save. Trips saved before that
 * field existed are filled in once, on the first lookup after deploy (additive: only that field is written).
 */
import { getDocument, listCollection, queryArrayContains, setDocument, updateDocument, decodeValue, encodeValue, docId, type FirestoreDoc } from "./_firebaseAdmin.js";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { record, publishedTripView } from "./_tripView.js";

interface Request {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface Response {
  setHeader(name: string, value: string): void;
  status(code: number): Response;
  json(body: unknown): void;
}

const BACKFILL_FLAG = ["app_config", "traveler_emails_backfill"] as const;

function decode(doc: FirestoreDoc | null): Record<string, unknown> {
  return doc ? Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decodeValue(v)])) : {};
}

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

function emailsOf(travelers: unknown): string[] {
  return [...new Set((Array.isArray(travelers) ? travelers : []).map(t => norm(record(t).email)).filter(Boolean))];
}

let backfillDone = false;

/** One pass over trips saved before traveler_emails existed; remembered in app_config so it runs once */
async function ensureBackfill(): Promise<void> {
  if (backfillDone) return;
  const flag = await getDocument(BACKFILL_FLAG[0], BACKFILL_FLAG[1]);
  if (flag && decode(flag).done === true) { backfillDone = true; return; }
  const trips = await listCollection("trips");
  let filled = 0;
  for (const doc of trips) {
    const data = decode(doc);
    if (Array.isArray(data.traveler_emails)) continue;
    const emails = [...new Set([...emailsOf(data.travelers), ...emailsOf(record(data.published_snapshot).travelers)])];
    await updateDocument("trips", docId(doc), { traveler_emails: encodeValue(emails) }, ["traveler_emails"]);
    filled++;
  }
  await setDocument(BACKFILL_FLAG[0], BACKFILL_FLAG[1], { done: encodeValue(true), trips: encodeValue(filled), at: encodeValue(new Date().toISOString()) });
  console.log(`[my-trips] backfilled traveler_emails on ${filled} trips`);
  backfillDone = true;
}

export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, res, { bucket: "my-trips", limit: 30, windowMs: 60_000 })) return;

  const authorization = req.headers.authorization;
  const payload = typeof authorization === "string" ? await verifyFirebaseToken(authorization.replace(/^Bearer\s+/i, "")) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const email = norm(payload.email);
  // Only an email the sign-in proved belongs to them (email link, Google, Apple)
  if (!email || payload.email_verified !== true) return res.json({ name: null, trips: [] });

  try {
    await ensureBackfill();
    const docs = await queryArrayContains("trips", "traveler_emails", email, 50);
    const trips: Array<{ trip: Record<string, unknown>; travelerId: string | null; travelerName: string | null }> = [];
    for (const doc of docs) {
      const id = docId(doc);
      const data = decode(doc);
      const view = publishedTripView(id, data);
      if (!view) continue; // drafts and unpublished trips stay hidden, as with a PIN
      // Prefer the published traveller (the id the app links to), else the working list
      const pool = [...(Array.isArray(record(data.published_snapshot).travelers) ? record(data.published_snapshot).travelers as unknown[] : []),
        ...(Array.isArray(data.travelers) ? data.travelers : [])];
      const me = record(pool.find(t => norm(record(t).email) === email));
      trips.push({
        trip: view,
        travelerId: typeof me.id === "string" ? me.id : null,
        travelerName: typeof me.name === "string" && me.name.trim() ? me.name.trim() : null,
      });
    }
    // Soonest first, so the app can lead with the next trip
    trips.sort((a, b) => String(a.trip.start ?? "").localeCompare(String(b.trip.start ?? "")));
    return res.json({ name: trips.find(t => t.travelerName)?.travelerName ?? null, trips });
  } catch (error) {
    console.error("[my-trips] lookup failed", error);
    return res.status(503).json({ error: "Couldn't look up your trips right now" });
  }
}
