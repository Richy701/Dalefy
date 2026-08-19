import { getDocument, decodeValue } from "./_firebaseAdmin.js";
import { rateLimit } from "./_rateLimit.js";

/**
 * Public preview of a team invite, for the accept page before the user signs in.
 * The invite token is an unguessable UUID, so holding it is the authorisation.
 * Returns only what the email already told the recipient, with the address masked.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, res, { bucket: "invite-preview", limit: 60, windowMs: 10 * 60_000 })) return;

  const token = typeof req.query?.token === "string" ? req.query.token.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return res.status(400).json({ error: "Invalid invite token" });

  const doc = await getDocument("org_invites", token).catch(() => null);
  if (!doc) return res.status(404).json({ error: "Invite not found" });

  const f = doc.fields ?? {};
  const status = decodeValue(f.status) as string;
  const expiresAt = decodeValue(f.expires_at) as string;
  const email = (decodeValue(f.email) as string) || "";
  const orgId = (decodeValue(f.organization_id) as string) || "";

  const branding = orgId ? await getDocument("org_branding", orgId).catch(() => null) : null;
  const b = branding?.fields ?? {};

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    status: status === "pending" && expiresAt && new Date(expiresAt) < new Date() ? "expired" : status,
    orgName: (decodeValue(b.company_name) as string) || (decodeValue(f.org_name) as string) || "",
    logoUrl: (decodeValue(b.logo_url) as string) || null,
    inviterName: (decodeValue(f.inviter_name) as string) || "",
    role: decodeValue(f.role) as string,
    email,
    maskedEmail: maskEmail(email),
    expiresAt,
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "";
  const shown = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(3, local.length - shown.length))}@${domain}`;
}
