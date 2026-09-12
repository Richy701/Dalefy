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

import { getDocument, decodeValue } from "./_firebaseAdmin.js";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { renderItineraryEmail } from "../src/lib/itineraryEmail.js";

const env = (k: string) => (process.env[k] ?? "").trim();
const APP_URL = (env("VITE_APP_URL") || "https://dalefy.app").replace(/\/$/, "");
const PLATFORM_NAME = "Dalefy";
const MAX_RECIPIENTS = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function enabled(): boolean {
  return !!env("RESEND_API_KEY") && !!env("RESEND_FROM_EMAIL");
}

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
  if (req.method === "GET") return res.status(200).json({ enabled: enabled() });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!enabled()) return res.status(501).json({ error: "Email sending isn't set up yet. Add RESEND_FROM_EMAIL on a verified domain." });

  const auth: string = req.headers["authorization"] ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const payload = await verifyFirebaseToken(token);
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
  const ownerId = decodeValue(f.user_id);
  const orgId = decodeValue(f.organization_id);
  let allowed = payload.sub === ownerId;
  if (!allowed && typeof orgId === "string" && orgId) {
    const member = await getDocument("org_members", `${payload.sub}_${orgId}`).catch(() => null);
    allowed = !!member;
  }
  if (!allowed) return res.status(403).json({ error: "Not authorized for this trip" });

  const branding = typeof orgId === "string" && orgId
    ? await getDocument("org_branding", orgId).catch(() => null)
    : null;
  const bf = branding?.fields ?? {};
  const brandName = (decodeValue(bf.company_name) as string) || PLATFORM_NAME;
  const logoUrl = (decodeValue(bf.logo_url) as string) || null;
  const accentColor = (decodeValue(bf.accent_color) as string) || null;

  const organizer = decodeValue(f.organizer) as ItineraryOrganizer | null;
  const callerEmail = typeof payload.email === "string" ? payload.email : undefined;
  const replyTo = organizer?.email || callerEmail;

  const { html, text } = renderItineraryEmail({
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
    shareUrl: `${APP_URL}/#/shared/${tripId}`,
    shortCode: (decodeValue(f.short_code) as string) || null,
    organizer,
  });

  const { Resend } = await import("resend");
  const resend = new Resend(env("RESEND_API_KEY"));
  const from = `${brandName.replace(/[<>"]/g, "")} <${env("RESEND_FROM_EMAIL")}>`;

  const results = await Promise.all(recipients.map(async r => {
    try {
      const { data, error } = await resend.emails.send({
        from,
        to: r.name ? `${r.name.replace(/[<>"]/g, "")} <${r.email}>` : r.email,
        replyTo,
        subject,
        html,
        text,
      });
      if (error) return { email: r.email, ok: false, error: error.message };
      return { email: r.email, ok: true, id: data?.id };
    } catch (err) {
      return { email: r.email, ok: false, error: err instanceof Error ? err.message : "Send failed" };
    }
  }));

  const sent = results.filter(r => r.ok).length;
  return res.status(200).json({ sent, failed: results.length - sent, results });
}

interface ItineraryOrganizer {
  name?: string;
  role?: string;
  company?: string;
  email?: string;
  phone?: string;
}
