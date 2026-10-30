import { randomUUID } from "node:crypto";
import { verifyFirebaseToken, verifyImpersonationToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { createCustomToken, authAdminConfigured } from "./_firebaseAuthAdmin.js";
import { getDocument, setDocument, updateDocument, decodeValue, encodeValue, type FirestoreDoc } from "./_firebaseAdmin.js";

/**
 * "Sign in as": an owner or admin opens a session as a teammate with a lower role, to see the app the way
 * they do. The session's ID tokens carry who opened it, the one team it reaches and when it ends; the
 * Firestore rules and the API keep it inside that team and away from the person's private and personal
 * trips, and refuse it after an hour.
 *
 *   POST { action: "start", orgId, uid }  with your own session      -> { token, until }
 *   POST { action: "return" }             with the "Sign in as" one  -> { token }
 *
 * Both hand back a custom token for signInWithCustomToken. Every session is kept in impersonation_log.
 */

const SESSION_MS = 60 * 60_000;
// Past this, switching back needs a normal sign-in
const RETURN_WINDOW_MS = 24 * 60 * 60_000;
const RANK: Record<string, number> = { viewer: 0, agent: 1, admin: 2, owner: 3 };

interface Request {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface Response {
  setHeader(name: string, value: string): void;
  status(code: number): Response;
  json(data: unknown): unknown;
}

const bearer = (req: Request) => String(req.headers["authorization"] ?? "").replace(/^Bearer\s+/i, "").trim();
const text = (doc: FirestoreDoc | null, key: string) => {
  const v = decodeValue(doc?.fields?.[key]);
  return typeof v === "string" ? v : "";
};

async function start(req: Request, res: Response, body: Record<string, unknown>) {
  // A "Sign in as" session can't open another one: verifyFirebaseToken refuses it here
  const payload = await verifyFirebaseToken(bearer(req));
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const orgId = typeof body.orgId === "string" ? body.orgId.trim() : "";
  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  if (!/^[\w-]{1,128}$/.test(orgId) || !/^[\w-]{1,128}$/.test(uid)) return res.status(400).json({ error: "orgId and uid required" });
  if (uid === payload.sub) return res.status(400).json({ error: "You're already signed in as yourself" });

  const [me, them, myProfile, theirProfile] = await Promise.all([
    getDocument("org_members", `${payload.sub}_${orgId}`),
    getDocument("org_members", `${uid}_${orgId}`),
    getDocument("profiles", payload.sub),
    getDocument("profiles", uid),
  ]);
  const myRole = text(me, "role");
  const theirRole = text(them, "role");
  if (myRole !== "owner" && myRole !== "admin") return res.status(403).json({ error: "Only owners and admins can sign in as a teammate" });
  if (!them) return res.status(404).json({ error: "That person isn't on this team" });
  if (!(RANK[theirRole] < RANK[myRole])) return res.status(403).json({ error: "You can only sign in as someone whose role is below yours" });

  const now = Date.now();
  const until = now + SESSION_MS;
  const logId = randomUUID();
  const byName = text(myProfile, "name").slice(0, 80) || text(myProfile, "email") || "A teammate";
  const token = await createCustomToken(uid, { imp_by: payload.sub, imp_by_name: byName, imp_org: orgId, imp_until: until, imp_id: logId });
  // No log, no session: the token is only handed over once the entry is saved
  await setDocument("impersonation_log", logId, {
    organization_id: encodeValue(orgId),
    by_uid: encodeValue(payload.sub),
    by_name: encodeValue(byName),
    by_role: encodeValue(myRole),
    as_uid: encodeValue(uid),
    as_name: encodeValue(text(theirProfile, "name") || text(theirProfile, "email")),
    as_role: encodeValue(theirRole),
    started_at: encodeValue(new Date(now).toISOString()),
    ends_at: encodeValue(new Date(until).toISOString()),
  });
  return res.status(200).json({ token, until });
}

async function giveBack(req: Request, res: Response) {
  const session = await verifyImpersonationToken(bearer(req));
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  const { imp } = session;
  if (Date.now() > imp.until + RETURN_WINDOW_MS) return res.status(410).json({ error: "That was too long ago to switch back. Sign in again." });
  const token = await createCustomToken(imp.by);
  if (imp.logId) {
    await updateDocument("impersonation_log", imp.logId, { ended_at: encodeValue(new Date().toISOString()) }, ["ended_at"])
      .catch(err => console.warn("impersonation_log end:", err instanceof Error ? err.message : err));
  }
  return res.status(200).json({ token });
}

export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, res, { bucket: "impersonate", limit: 20, windowMs: 10 * 60_000 })) return;
  // Signing needs the service account, which local dev doesn't have (no Vercel OIDC token)
  if (!authAdminConfigured()) return res.status(503).json({ error: "Sign in as works on the live site only. This server has no service account to sign with." });
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    if (body.action === "start") return await start(req, res, body);
    if (body.action === "return") return await giveBack(req, res);
    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("impersonate error:", err instanceof Error ? err.message : err);
    return res.status(502).json({ error: "Couldn't switch accounts. Try again in a moment." });
  }
}
