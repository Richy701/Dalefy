import { canEditTrip } from "./_tripPermissions.js";
/**
 * Send the branded itinerary email to travellers through Resend.
 *
 * GET  /api/send-itinerary            -> { enabled } (is a verified sender configured?)
 * POST /api/send-itinerary            -> { sent, failed, results[] }
 *   Body: { tripId, subject, message, recipients: [{ name, email }] }
 *
 * Requires RESEND_API_KEY plus RESEND_FROM_EMAIL on a domain verified in Resend.
 * The caller must own the trip or belong to its organisation.
 */

import { getDocument, decodeValue, encodeValue, updateDocument } from "./_firebaseAdmin.js";
import { verifyFirebaseToken, impersonationOf } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { sendEmail, emailEnabled } from "./_mailer.js";
import { renderItineraryEmail } from "../src/lib/itineraryEmail.js";

const env = (k: string) => (process.env[k] ?? "").trim();
const APP_URL = (env("VITE_APP_URL") || "https://dalefy.app").replace(/\/$/, "");
const PLATFORM_NAME = "Dalefy";
const MAX_RECIPIENTS = 50;
const PER_SECOND = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Recipient { name: string; email: string }

function parseRecipients(value: unknown): Recipient[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RECIPIENTS) return null;
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const item of value) {
    const email = typeof item?.email === "string" ? item.email.trim().toLowerCase() : "";
    const name = typeof item?.name === "string" ? item.name.trim().slice(0, 120) : "";
    if (!EMAIL_RE.test(email)) return null;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ name, email });
  }
  return out;
}

export default async function handler(req: any, res: any) {
  if (req.method === "GET") return res.status(200).json({ enabled: emailEnabled() });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!emailEnabled()) return res.status(501).json({ error: "Email sending isn't set up yet. Add RESEND_FROM_EMAIL on a verified domain." });

  const auth: string = req.headers["authorization"] ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const payload = await verifyFirebaseToken(token, { allowImpersonation: true });
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  if (!rateLimit(req, res, { bucket: "send-itinerary", limit: 20, windowMs: 10 * 60_000 })) return;

  const body = req.body ?? {};
  const tripId = typeof body.tripId === "string" ? body.tripId.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 200) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 5000) : "";
  const recipients = parseRecipients(body.recipients);
  if (!tripId || !subject || !recipients) {
    return res.status(400).json({ error: "tripId, subject and valid recipients are required" });
  }

  const trip = await getDocument("trips", tripId).catch(() => null);
  if (!trip) return res.status(404).json({ error: "Trip not found" });
  const f = trip.fields ?? {};
  const orgId = decodeValue(f.organization_id);
  const allowed = await canEditTrip(payload.sub!, f, impersonationOf(payload));
  if (!allowed) return res.status(403).json({ error: "Not authorized for this trip" });

  const branding = typeof orgId === "string" && orgId
    ? await getDocument("org_branding", orgId).catch(() => null)
    : null;
  const bf = branding?.fields ?? {};
  // Itinerary emails go out as Dalefy with the Dalefy icon: a sender name that differs from the sending
  // domain gets flagged by work mail filters, and organisation logos are often embedded images that
  // Gmail and Outlook won't show. The organiser still appears in the email and receives the replies.
  const brandName = PLATFORM_NAME;
  const logoUrl = null;
  const accentColor = (decodeValue(bf.accent_color) as string) || null;

  const organizer = decodeValue(f.organizer) as ItineraryOrganizer | null;
  const callerEmail = typeof payload.email === "string" ? payload.email : undefined;
  const replyTo = organizer?.email || callerEmail;

  const { html, text } = renderItineraryEmail({
    template: typeof body.template === "string" ? body.template : "invite",
    brandName,
    logoUrl,
    accentColor,
    platformName: PLATFORM_NAME,
    tripName: String(decodeValue(f.name) ?? "Your trip"),
    destination: (decodeValue(f.destination) as string) || null,
    start: String(decodeValue(f.start) ?? ""),
    end: String(decodeValue(f.end_date) ?? ""),
    image: (decodeValue(f.image) as string) || null,
    message,
    shareUrl: `${APP_URL}/shared/${tripId}`,
    shortCode: (decodeValue(f.short_code) as string) || null,
    organizer,
  });

  const sendTo = async (r: Recipient) => {
    const sent = await sendEmail({ to: r.email, toName: r.name, subject, html, text, replyTo, fromName: brandName });
    return sent.ok === true ? { email: r.email, ok: true, id: sent.id } : { email: r.email, ok: false, error: sent.error };
  };
  // Resend takes 10 emails a second across the account: send in groups of 5, one group a second
  const results: Awaited<ReturnType<typeof sendTo>>[] = [];
  for (let i = 0; i < recipients.length; i += PER_SECOND) {
    const started = Date.now();
    results.push(...await Promise.all(recipients.slice(i, i + PER_SECOND).map(sendTo)));
    if (i + PER_SECOND < recipients.length) await new Promise(r => setTimeout(r, Math.max(0, 1000 - (Date.now() - started))));
  }

  const sent = results.filter(r => r.ok).length;
  // Stamp "invited" here rather than from the browser: this writes onto the newest copy of the trip, so it can't
  // clash with an organiser's open editor or another save. A failed stamp never fails the send.
  await stampInvited(tripId, new Set(results.filter(r => r.ok).map(r => r.email.toLowerCase()))).catch(err =>
    console.warn("send-itinerary: invitedAt stamp failed:", err instanceof Error ? err.message : err));
  return res.status(200).json({ sent, failed: results.length - sent, results });
}

async function stampInvited(tripId: string, delivered: Set<string>) {
  if (!delivered.size) return;
  const at = new Date().toISOString();
  // Retried once: a save landing between the read and the write makes the first attempt stale
  for (let attempt = 0; attempt < 2; attempt++) {
    const doc = await getDocument("trips", tripId);
    if (!doc) return;
    const travelers = (decodeValue(doc.fields?.travelers) ?? []) as Array<Record<string, unknown>>;
    let touched = false;
    const next = travelers.map(t => {
      if (!delivered.has(String(t.email ?? "").trim().toLowerCase())) return t;
      touched = true;
      return { ...t, invitedAt: at };
    });
    if (!touched) return;
    try {
      await updateDocument("trips", tripId, { travelers: encodeValue(next) }, ["travelers"], doc.updateTime);
      return;
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
}

interface ItineraryOrganizer {
  name?: string;
  role?: string;
  company?: string;
  email?: string;
  phone?: string;
}
