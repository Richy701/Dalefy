import { randomUUID } from "node:crypto";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { sendEmail, renderBrandedEmail, emailConfigured } from "./_email.js";

const PROJECT_ID = (process.env.VITE_FIREBASE_PROJECT_ID || "dalefy-d87c9").trim();
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const APP_URL = (process.env.VITE_APP_URL || "https://dalefy.vercel.app").trim().replace(/\/$/, "");
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Role = "admin" | "agent" | "viewer";
const ROLES: Role[] = ["admin", "agent", "viewer"];
const ROLE_LABEL: Record<Role, string> = { admin: "an admin", agent: "an agent", viewer: "a viewer" };
const ROLE_BLURB: Record<Role, string> = {
  admin: "Admins can manage trips, travelers, branding and the team.",
  agent: "Agents can build and edit trips and manage travelers.",
  viewer: "Viewers can see trips and itineraries but not change them.",
};

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

  // Per-org branding for the email (public read)
  const branding = await getDoc(token, `org_branding/${orgId}`).catch(() => null);
  const org = {
    name: str(branding, "company_name") || orgName,
    logoUrl: str(branding, "logo_url") || null,
    accentColor: str(branding, "accent_color") || null,
  };

  const expiresHuman = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "7 days";
  const who = inviterName || "A team member";

  const { html, text } = renderBrandedEmail({
    preheader: `${who} has invited you to join ${org.name} on Dalefy as ${ROLE_LABEL[role]}.`,
    eyebrow: "Team invitation",
    heading: `Join ${org.name}`,
    paragraphs: [
      `${who} has invited you to join ${org.name} on Dalefy as ${ROLE_LABEL[role]}.`,
      `Dalefy is the itinerary platform ${org.name} uses to build trips, manage travelers and share live itineraries.`,
      ROLE_BLURB[role],
      `Accept with the email address this was sent to (${email}). If you don't have an account yet you'll be asked to create one first.`,
    ],
    cta: { label: "Accept invitation", url: acceptUrl },
    note: `This invitation expires on ${expiresHuman}. If you weren't expecting it, you can ignore this email.`,
    footerLines: [`Sent by ${org.name} via Dalefy.`],
    org,
  });

  let emailSent = false;
  let emailError: string | undefined;
  if (emailConfigured()) {
    const result = await sendEmail({ to: email, subject: `${who} invited you to join ${org.name} on Dalefy`, html, text });
    emailSent = result.sent;
    emailError = result.error;
  } else {
    emailError = "Email sending is not configured";
  }

  return res.status(200).json({ ok: true, inviteToken, acceptUrl, email, role, expiresAt, emailSent, emailError, resent });
}
