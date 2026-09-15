/**
 * Branded auth emails. Firebase mints the action link, we deliver it through
 * Resend on the shared email shell.
 *
 * POST /api/auth-email
 *   { kind: "magic-link", email }   unauthenticated; mobile one-tap sign-in
 *   { kind: "reset", email }        unauthenticated; password reset
 *   { kind: "verify" }              bearer token required; verifies the caller's own address
 *
 * The unauthenticated kinds always answer { ok: true } so addresses can't be
 * probed. They're rate limited per IP.
 */

import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { sendEmail, emailEnabled } from "./_mailer.js";
import { generateSignInLink, generateVerificationLink, generatePasswordResetLink, authAdminConfigured } from "./_firebaseAuthAdmin.js";
import { magicLinkEmail, resetPasswordEmail, verifyEmail } from "../src/lib/email/templates.js";

const APP_URL = (process.env.VITE_APP_URL || "https://dalefy.app").trim().replace(/\/$/, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!emailEnabled() || !authAdminConfigured()) {
    return res.status(501).json({ error: "Email sign-in isn't available right now. Please try again later." });
  }

  const body = req.body ?? {};
  const kind = typeof body.kind === "string" ? body.kind : "";

  if (kind === "verify") {
    const auth: string = req.headers["authorization"] ?? "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    const payload = await verifyFirebaseToken(token);
    const email = typeof payload?.email === "string" ? payload.email : "";
    if (!payload?.sub || !email) return res.status(401).json({ error: "Unauthorized" });
    if (payload.email_verified === true) return res.status(200).json({ ok: true, alreadyVerified: true });
    if (!rateLimit(req, res, { bucket: "auth-email-verify", limit: 5, windowMs: 10 * 60_000 })) return;

    const link = await generateVerificationLink(email, { url: `${APP_URL}/` });
    if (link.ok === false) return res.status(500).json({ error: friendly(link.error, link.code) });
    const name = typeof payload.name === "string" ? payload.name : null;
    const mail = verifyEmail({ name, verifyUrl: link.url });
    const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
    if (sent.ok === false) return res.status(502).json({ error: sent.error });
    return res.status(200).json({ ok: true });
  }

  if (kind !== "magic-link" && kind !== "reset") return res.status(400).json({ error: "Unknown kind" });
  if (!rateLimit(req, res, { bucket: `auth-email-${kind}`, limit: 8, windowMs: 10 * 60_000 })) return;

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "A valid email is required" });

  if (kind === "magic-link") {
    const link = await generateSignInLink(email, { url: `${APP_URL}/auth-callback`, handleCodeInApp: true });
    if (link.ok === false) {
      console.error("[auth-email] magic-link failed:", link.code, link.error);
      return res.status(500).json({ error: friendly(link.error, link.code) });
    }
    const mail = magicLinkEmail({ signInUrl: link.url });
    const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
    if (sent.ok === false) return res.status(502).json({ error: sent.error });
    return res.status(200).json({ ok: true });
  }

  // reset: never reveal whether the account exists
  const link = await generatePasswordResetLink(email, { url: `${APP_URL}/#/login` });
  if (link.ok === false) {
    if (link.code !== "auth/user-not-found" && link.code !== "auth/email-not-found") {
      console.error("[auth-email] reset failed:", link.code, link.error);
      return res.status(500).json({ error: friendly(link.error, link.code) });
    }
    return res.status(200).json({ ok: true });
  }
  const mail = resetPasswordEmail({ resetUrl: link.url });
  const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  if (sent.ok === false) return res.status(502).json({ error: sent.error });
  return res.status(200).json({ ok: true });
}

function friendly(message: string, code?: string): string {
  if (code === "not-configured") return message;
  if (code === "auth/too-many-requests") return "Too many attempts - try again later";
  return "We couldn't send that email right now. Please try again.";
}
