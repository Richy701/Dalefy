import { randomUUID } from "node:crypto";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";

const PROJECT_ID = (process.env.VITE_FIREBASE_PROJECT_ID || "dalefy-d87c9").trim();
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const APP_URL = (process.env.VITE_APP_URL || "https://dalefy.vercel.app").trim().replace(/\/$/, "");
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Role = "admin" | "agent" | "viewer";
const ROLES: Role[] = ["admin", "agent", "viewer"];

interface InviteRequest {
  email?: unknown;
  role?: unknown;
  orgId?: unknown;
  inviterName?: unknown;
  /** Resend the email for an existing pending invite instead of creating one. */
  resendToken?: unknown;
}

// ── Firestore REST helpers (run as the calling user, so rules apply) ────────

type FsValue = Record<string, unknown>;
interface FsDoc { name: string; fields?: Record<string, FsValue> }

function decode(v: FsValue | undefined): unknown {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  return undefined;
}
function str(doc: FsDoc | null, key: string): string {
  const v = doc?.fields?.[key];
  const d = decode(v);
  return typeof d === "string" ? d : "";
}

async function getDoc(token: string, path: string): Promise<FsDoc | null> {
  const r = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new Error(`Firestore GET ${path} failed: ${r.status}`);
  return (await r.json()) as FsDoc;
}

async function runQuery(
  token: string,
  collectionId: string,
  filters: Array<{ field: string; value: string }>,
  limit = 5,
): Promise<FsDoc[]> {
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: filters.map(f => ({
            fieldFilter: { field: { fieldPath: f.field }, op: "EQUAL", value: { stringValue: f.value } },
          })),
        },
      },
      limit,
    },
  };
  const r = await fetch(`${BASE}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Firestore query ${collectionId} failed: ${r.status}`);
  const rows = (await r.json()) as Array<{ document?: FsDoc }>;
  return rows.map(x => x.document).filter((d): d is FsDoc => !!d);
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, res, { bucket: "send-invite", limit: 30, windowMs: 10 * 60_000 })) return;

  const auth: string = req.headers["authorization"] ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const payload = await verifyFirebaseToken(token);
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const callerUid = payload.sub;

  const body = (req.body ?? {}) as InviteRequest;
  const orgId = typeof body.orgId === "string" ? body.orgId.trim() : "";
  const inviterName = typeof body.inviterName === "string" ? body.inviterName.trim().slice(0, 80) : "";
  const resendToken = typeof body.resendToken === "string" ? body.resendToken.trim() : "";
  if (!orgId) return res.status(400).json({ error: "orgId required" });

  // Caller must be an owner/admin of this org (rules enforce it too, but fail early with a clear message)
  const [member, orgDoc] = await Promise.all([
    getDoc(token, `org_members/${callerUid}_${orgId}`),
    getDoc(token, `organizations/${orgId}`),
  ]);
  if (!orgDoc) return res.status(404).json({ error: "Organization not found" });
  const callerRole = str(member, "role");
  if (callerRole !== "owner" && callerRole !== "admin") {
    return res.status(403).json({ error: "Only owners and admins can invite team members" });
  }
  const orgName = str(orgDoc, "name") || "your team";

  let email: string;
  let role: Role;
  let inviteToken: string;
  let expiresAt: string;
  let resent = false;

  if (resendToken) {
    // ── Resend path: reuse the existing pending invite ──
    const existing = await getDoc(token, `org_invites/${resendToken}`);
    if (!existing || str(existing, "organization_id") !== orgId) {
      return res.status(404).json({ error: "Invite not found" });
    }
    if (str(existing, "status") !== "pending") {
      return res.status(409).json({ error: "That invite is no longer pending" });
    }
    email = str(existing, "email");
    role = str(existing, "role") as Role;
    inviteToken = resendToken;
    expiresAt = str(existing, "expires_at");
    resent = true;
  } else {
    // ── Create path ──
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    role = body.role as Role;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "A valid email is required" });
    if (!ROLES.includes(role)) return res.status(400).json({ error: "role must be admin, agent, or viewer" });

    // Already a member? (profiles are keyed by uid; look up by email, then check membership)
    const profiles = await runQuery(token, "profiles", [{ field: "email", value: email }], 3);
    for (const p of profiles) {
      const uid = p.name.split("/").pop()!;
      const m = await getDoc(token, `org_members/${uid}_${orgId}`);
      if (m) return res.status(409).json({ error: "That person is already a member of this team" });
    }

    // Pending invite already exists for this address? Reuse it (acts as a resend).
    const pending = await runQuery(token, "org_invites", [
      { field: "organization_id", value: orgId },
      { field: "email", value: email },
      { field: "status", value: "pending" },
    ], 1);
    if (pending.length > 0) {
      inviteToken = pending[0].name.split("/").pop()!;
      role = (str(pending[0], "role") as Role) || role;
      expiresAt = str(pending[0], "expires_at");
      resent = true;
    } else {
      inviteToken = randomUUID();
      const expiresMs = Date.now() + INVITE_TTL_MS;
      expiresAt = new Date(expiresMs).toISOString();
      const inviteDoc = {
        fields: {
          email: { stringValue: email },
          role: { stringValue: role },
          organization_id: { stringValue: orgId },
          org_name: { stringValue: orgName },
          invited_by: { stringValue: callerUid },
          inviter_name: { stringValue: inviterName },
          token: { stringValue: inviteToken },
          status: { stringValue: "pending" },
          created_at: { stringValue: new Date().toISOString() },
          expires_at: { stringValue: expiresAt },
          expires_at_ms: { integerValue: String(expiresMs) },
        },
      };
      const w = await fetch(`${BASE}/org_invites/${inviteToken}?currentDocument.exists=false`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(inviteDoc),
      });
      if (!w.ok) {
        console.error("Firestore invite write failed:", w.status, await w.text().catch(() => ""));
        return res.status(500).json({ error: "Failed to create invite" });
      }
    }
  }

  const acceptUrl = `${APP_URL}/#/invite/${inviteToken}`;

  // Delivery happens client-side via a Firebase sign-in link (no external email service).
  return res.status(200).json({ ok: true, inviteToken, acceptUrl, email, role, expiresAt, orgName, resent });
}
