import { Resend } from "resend";
import { verifyFirebaseToken } from "./_verifyToken.js";

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID ?? "";
const API_KEY = process.env.VITE_FIREBASE_API_KEY ?? "";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const RESEND_KEY = process.env.RESEND_API_KEY ?? "";
const APP_URL = process.env.VITE_APP_URL || "https://dalefy.com";

interface InviteRequest {
  email: string;
  role: "admin" | "agent" | "viewer";
  orgId: string;
  orgName: string;
  inviterName: string;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers["authorization"] ?? "";
  const token = auth.replace("Bearer ", "");
  const payload = await verifyFirebaseToken(token);
  if (!payload) return res.status(401).json({ error: "Unauthorized" });

  const { email, role, orgId, orgName, inviterName } = req.body as InviteRequest;
  if (!email || !role || !orgId || !orgName) {
    return res.status(400).json({ error: "email, role, orgId, and orgName required" });
  }

  if (!["admin", "agent", "viewer"].includes(role)) {
    return res.status(400).json({ error: "role must be admin, agent, or viewer" });
  }

  const inviteToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Write invite to Firestore via REST
  const inviteDoc = {
    fields: {
      email: { stringValue: email },
      role: { stringValue: role },
      organization_id: { stringValue: orgId },
      org_name: { stringValue: orgName },
      invited_by: { stringValue: payload.sub! },
      inviter_name: { stringValue: inviterName || "" },
      token: { stringValue: inviteToken },
      status: { stringValue: "pending" },
      created_at: { stringValue: new Date().toISOString() },
      expires_at: { stringValue: expiresAt },
    },
  };

  const firestoreResp = await fetch(`${BASE}/org_invites/${inviteToken}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(inviteDoc),
  });

  if (!firestoreResp.ok) {
    const errText = await firestoreResp.text();
    console.error("Firestore write failed:", firestoreResp.status, errText);
    return res.status(500).json({ error: "Failed to create invite" });
  }

  const acceptUrl = `${APP_URL}/#/invite/${inviteToken}`;

  // Send email via Resend (skip if no API key — return link for copy-paste)
  if (RESEND_KEY) {
    try {
      const resend = new Resend(RESEND_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "DAF Adventures <onboarding@resend.dev>",
        to: email,
        subject: `You're invited to join ${orgName}`,
        html: buildInviteEmail(orgName, inviterName, role, acceptUrl),
      });
    } catch (err) {
      console.error("Resend failed:", err);
      // Non-fatal — return the link so user can share manually
    }
  }

  return res.status(200).json({
    ok: true,
    inviteToken,
    acceptUrl,
    emailSent: !!RESEND_KEY,
  });
}

function buildInviteEmail(orgName: string, inviterName: string, role: string, acceptUrl: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h1 style="font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; margin: 0 0 8px;">
        You're Invited
      </h1>
      <p style="color: #666; font-size: 14px; margin: 0 0 24px;">
        ${inviterName || "A team member"} has invited you to join <strong>${orgName}</strong> as ${role === "admin" ? "an admin" : "an agent"}.
      </p>
      <a href="${acceptUrl}" style="display: inline-block; background: #0bd2b5; color: #000; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 13px; padding: 14px 28px; border-radius: 12px; text-decoration: none;">
        Accept Invitation
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">
        This invitation expires in 7 days. If you didn't expect this, you can ignore it.
      </p>
    </div>
  `;
}
