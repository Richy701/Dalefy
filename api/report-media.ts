import { getDocument, queryDocuments, setDocument, deleteDocument, decodeValue, encodeValue, docId, type FirestoreDoc } from "./_firebaseAdmin.js";
import { verifyFirebaseToken, impersonationOf } from "./_verifyToken.js";
import { rateLimit } from "./_rateLimit.js";
import { record, membershipMatches } from "./_tripView.js";
import { sendEmail } from "./_mailer.js";
import { mediaReportedEmail } from "../src/lib/email/templates.js";

function decode(doc: FirestoreDoc | null): Record<string, unknown> {
  return doc ? Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decodeValue(v)])) : {};
}

/**
 * POST /api/report-media  { tripId, mediaId }  (bearer token)
 *
 * A traveller flags someone else's photo in the trip gallery. The app hides it for them straight away;
 * here the report is kept and the trip's owners and admins are emailed so they can remove it in the workspace.
 * Only travellers who joined the trip can report, and only photos that are in it.
 *
 * POST /api/report-media  { tripId, mediaId, action: "dismiss" }  (bearer token)
 *
 * The trip's staff keep a reported photo: every report on it is cleared. Staff are the trip's owner, or an
 * owner, admin or agent of the trip's organisation.
 */
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const payload = await verifyFirebaseToken(String(req.headers["authorization"] ?? "").replace(/^Bearer\s+/i, ""), { allowImpersonation: true });
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const imp = impersonationOf(payload);
  if (!rateLimit(req, res, { bucket: "report-media", limit: 20, windowMs: 10 * 60_000 })) return;

  const body = record(req.body);
  const tripId = body.tripId, mediaId = body.mediaId;
  if (typeof tripId !== "string" || !/^[\w-]{1,150}$/.test(tripId) || typeof mediaId !== "string" || !/^[\w.-]{1,200}$/.test(mediaId)) {
    return res.status(400).json({ error: "Invalid report" });
  }

  if (body.action === "dismiss") {
    const trip = decode(await getDocument("trips", tripId));
    const orgId = typeof trip.organization_id === "string" ? trip.organization_id : "";
    const role = orgId ? decode(await getDocument("org_members", `${payload.sub}_${orgId}`)).role : null;
    const inScope = (!imp || (orgId === imp.org && trip.private !== true))
      // A private trip is its creator's alone
      && (trip.private !== true || trip.user_id === payload.sub);
    const staff = inScope && (trip.user_id === payload.sub || ["owner", "admin", "agent"].includes(String(role ?? "")));
    if (!staff) return res.status(403).json({ error: "Only the trip's team can clear reports" });
    const reports = (await queryDocuments("media_reports", "trip_id", tripId, 500)).filter(d => decode(d).media_id === mediaId);
    await Promise.all(reports.map(d => deleteDocument("media_reports", docId(d))));
    return res.status(200).json({ cleared: reports.length });
  }

  // Reporting is a traveller's own call, never made from a "Sign in as" session
  if (imp) return res.status(403).json({ error: "Join this trip to report a photo" });
  const member = decode(await getDocument("trip_members", `${payload.sub}_${tripId}`));
  if (!membershipMatches(member, payload.sub, tripId)) return res.status(403).json({ error: "Join this trip to report a photo" });
  const trip = decode(await getDocument("trips", tripId));
  const media = Array.isArray(trip.media) ? trip.media.map(record).find(m => m.id === mediaId) : null;
  if (!media) return res.status(404).json({ error: "Photo not found" });

  const name = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
  const reporter = name(member.name) || name(member.email);
  await setDocument("media_reports", `${tripId}_${mediaId}_${payload.sub}`, {
    trip_id: encodeValue(tripId),
    media_id: encodeValue(mediaId),
    media_url: encodeValue(typeof media.url === "string" ? media.url : ""),
    uploader_id: encodeValue(typeof media.uploaderId === "string" ? media.uploaderId : ""),
    reported_by: encodeValue(payload.sub),
    reported_at: encodeValue(new Date().toISOString()),
  });

  // Owners and admins of the trip's organisation, or the person who made the trip
  const orgId = typeof trip.organization_id === "string" ? trip.organization_id : "";
  const uids = orgId
    ? (await queryDocuments("org_members", "organization_id", orgId, 100)).map(decode)
        .filter(m => m.role === "owner" || m.role === "admin").map(m => m.user_id)
    : [trip.user_id];
  const emails = new Set<string>();
  for (const uid of uids) {
    if (typeof uid !== "string" || !uid) continue;
    const profile = decode(await getDocument("profiles", uid).catch(() => null));
    // Settings > Email notifications can switch these off
    if ((profile.email_prefs as Record<string, unknown> | undefined)?.photo_reports === false) continue;
    const email = profile.email;
    if (typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) emails.add(email.toLowerCase());
  }

  const appUrl = (process.env.VITE_APP_URL ?? "https://dalefy.app").replace(/\/$/, "");
  const message = mediaReportedEmail({
    tripName: name(trip.name) || "Your trip",
    photoName: name(media.name) || "Photo",
    uploadedBy: name(media.uploadedBy) || null,
    reportedBy: reporter || null,
    manageUrl: `${appUrl}/#/media`,
  });
  let notified = 0;
  for (const to of emails) {
    const sent = await sendEmail({ to, ...message });
    if (sent.ok) notified++;
    else console.warn("report-media: email failed", "error" in sent ? sent.error : "");
  }
  return res.status(200).json({ reported: true, notified });
}
