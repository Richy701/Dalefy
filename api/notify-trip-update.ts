/**
 * Notify trip members of itinerary changes.
 *
 * Called from the web app after a trip leader saves changes.
 * Queries trip_members to find who's on the trip, then push_tokens
 * to get their Expo push tokens, and sends via Expo Push API.
 * Anyone on the trip with an email address but no push-capable device
 * gets the same update by email instead.
 *
 * POST /api/notify-trip-update
 * Body: { tripId, tripName, changes: string[] }
 * Response: { sent (push count), emailed, results }
 */

import { listCollection, getDocument, decodeValue } from "./_firebaseAdmin.js";
import { verifyFirebaseToken } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { sendEmail, emailEnabled } from "./_mailer.js";
import { tripUpdatedEmail } from "../src/lib/email/templates.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const APP_URL = (process.env.VITE_APP_URL || "https://dalefy.app").trim().replace(/\/$/, "");
const PLATFORM_NAME = "Dalefy";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers["authorization"] ?? "";
  const token = auth.replace("Bearer ", "");
  const payload = await verifyFirebaseToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!rateLimit(req, res, { bucket: "notify-trip-update", limit: 30, windowMs: 60_000 })) return;

  const { tripId, tripName, changes, excludeDeviceId } = req.body ?? {};
  if (!tripId || !tripName || !Array.isArray(changes) || !changes.length) {
    return res.status(400).json({ error: "tripId, tripName, and changes[] required" });
  }

  try {
    // Caller must own the trip or belong to the trip's organization —
    // otherwise any signed-in user could push messages to any trip's members.
    const trip = await getDocument("trips", String(tripId)).catch(() => null);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    const tripFields = trip.fields ?? {};
    const ownerId = decodeValue(tripFields.user_id);
    const orgId = decodeValue(tripFields.organization_id);
    let allowed = !!payload.sub && payload.sub === ownerId;
    if (!allowed && orgId && payload.sub) {
      const member = await getDocument("org_members", `${payload.sub}_${orgId}`).catch(() => null);
      allowed = !!member;
    }
    if (!allowed) return res.status(403).json({ error: "Not authorized for this trip" });

    // 1. Get all trip members for this trip
    const allMembers = await listCollection("trip_members");
    const memberDeviceIds = new Set<string>();
    interface Member { deviceId: string; email: string; linkedTravelerId: string }
    const members: Member[] = [];

    for (const doc of allMembers) {
      const fields = doc.fields ?? {};
      const docTripId = decodeValue(fields.trip_id);
      const deviceId = decodeValue(fields.device_id);
      if (docTripId === tripId && deviceId && deviceId !== excludeDeviceId) {
        memberDeviceIds.add(deviceId);
        members.push({
          deviceId,
          email: String(decodeValue(fields.email) ?? "").trim().toLowerCase(),
          linkedTravelerId: String(decodeValue(fields.linked_traveler_id) ?? ""),
        });
      }
    }

    // 2. Get push tokens for those devices
    const allTokens = await listCollection("push_tokens");
    const tokens: string[] = [];
    const pushedDevices = new Set<string>();

    for (const doc of allTokens) {
      const fields = doc.fields ?? {};
      const deviceId = decodeValue(fields.device_id);
      const token = decodeValue(fields.token);
      if (deviceId && memberDeviceIds.has(deviceId) && token) {
        tokens.push(token);
        pushedDevices.add(deviceId);
      }
    }

    // Email leg: travellers on the trip who won't get a push (no device, or a device without a token).
    const emailed = await emailUpdate({ tripFields, tripId: String(tripId), tripName: String(tripName), changes, members, pushedDevices, orgId: typeof orgId === "string" ? orgId : "" });

    if (tokens.length === 0) {
      return res.json({ sent: 0, emailed, reason: memberDeviceIds.size === 0 ? "No members found for trip" : "No push tokens found for trip members" });
    }

    // 3. Build notification
    const title = `${tripName} Updated`;
    const body = changes.length === 1
      ? changes[0]
      : changes.slice(0, 3).join(", ") + (changes.length > 3 ? ` +${changes.length - 3} more` : "");

    // 4. Send via Expo Push API (batches of 100)
    const messages = tokens.map(token => ({
      to: token,
      title,
      body,
      data: { tripId, category: "update" },
      sound: "default" as const,
    }));

    const results: any[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        const resp = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(chunk),
        });
        results.push(await resp.json());
      } catch {
        results.push({ error: "Failed to send chunk" });
      }
    }

    res.json({ sent: tokens.length, emailed, results });
  } catch (err: any) {
    console.error("[notify-trip-update] Error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

interface EmailUpdateInput {
  tripFields: Record<string, unknown>;
  tripId: string;
  tripName: string;
  changes: string[];
  members: Array<{ deviceId: string; email: string; linkedTravelerId: string }>;
  pushedDevices: Set<string>;
  orgId: string;
}

/** Returns how many update emails were sent. Never throws; email is best-effort alongside push. */
async function emailUpdate(input: EmailUpdateInput): Promise<number> {
  if (!emailEnabled()) return 0;
  try {
    const coveredTravelers = new Set(input.members.filter(m => input.pushedDevices.has(m.deviceId) && m.linkedTravelerId).map(m => m.linkedTravelerId));
    const coveredEmails = new Set(input.members.filter(m => input.pushedDevices.has(m.deviceId) && m.email).map(m => m.email));

    const recipients = new Map<string, string>();
    const travelers = decodeValue(input.tripFields.travelers);
    if (Array.isArray(travelers)) {
      for (const t of travelers) {
        const email = String(t?.email ?? "").trim().toLowerCase();
        const id = String(t?.id ?? "");
        if (!EMAIL_RE.test(email) || coveredEmails.has(email) || (id && coveredTravelers.has(id))) continue;
        recipients.set(email, String(t?.name ?? ""));
      }
    }
    for (const m of input.members) {
      if (!EMAIL_RE.test(m.email) || coveredEmails.has(m.email) || recipients.has(m.email)) continue;
      recipients.set(m.email, "");
    }
    if (recipients.size === 0) return 0;

    const branding = input.orgId ? await getDocument("org_branding", input.orgId).catch(() => null) : null;
    const bf = branding?.fields ?? {};
    const mail = tripUpdatedEmail({
      brand: {
        brandName: (decodeValue(bf.company_name) as string) || PLATFORM_NAME,
        logoUrl: (decodeValue(bf.logo_url) as string) || null,
        accentColor: (decodeValue(bf.accent_color) as string) || null,
        platformName: PLATFORM_NAME,
      },
      tripName: input.tripName,
      destination: (decodeValue(input.tripFields.destination) as string) || null,
      image: (decodeValue(input.tripFields.image) as string) || null,
      changes: input.changes.map(String),
      shareUrl: `${APP_URL}/#/shared/${input.tripId}`,
      shortCode: (decodeValue(input.tripFields.short_code) as string) || null,
    });
    const organizer = decodeValue(input.tripFields.organizer);
    const replyTo = typeof organizer?.email === "string" && organizer.email ? organizer.email : undefined;
    const fromName = (decodeValue(bf.company_name) as string) || PLATFORM_NAME;

    const results = await Promise.all([...recipients].map(([email, name]) =>
      sendEmail({ to: email, toName: name, subject: mail.subject, html: mail.html, text: mail.text, replyTo, fromName }),
    ));
    return results.filter(r => r.ok).length;
  } catch (err) {
    console.error("[notify-trip-update] email leg failed:", err);
    return 0;
  }
}
