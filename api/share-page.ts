import { getDocument, decodeValue, type FirestoreDoc } from "./_firebaseAdmin.js";
import { rateLimit } from "./_rateLimit.js";
import { publishedTripView } from "./_tripView.js";

/**
 * /shared/:tripId for link previews. iMessage, WhatsApp, Slack and the iOS share sheet read the
 * trip's own title, dates and cover photo from these tags; people are sent straight on to the
 * trip page. Only a published trip's name, place, dates and cover are exposed, the same as the
 * public shared page shows.
 */
const APP_URL = (process.env.VITE_APP_URL || "https://dalefy.vercel.app").replace(/\/$/, "");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function decode(doc: FirestoreDoc | null): Record<string, unknown> {
  return doc ? Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decodeValue(v)])) : {};
}

function fmt(date: string, withYear: boolean): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

export default async function handler(req: any, res: any) {
  const id = typeof req.query?.tripId === "string" ? req.query.tripId : "";
  const valid = /^[\w-]{1,150}$/.test(id);
  const target = valid ? `/#/shared/${id}` : "/";

  let title = "A trip on Dalefy";
  let description = "Your itinerary, flights and documents from your organiser, in one place.";
  let image = `${APP_URL}/og-image.jpg`;

  // rateLimit sends its own 429 when it trips
  if (valid && !rateLimit(req, res, { bucket: "share-page", limit: 120, windowMs: 60_000 })) return;

  if (valid) {
    try {
      const view = publishedTripView(id, decode(await getDocument("trips", id)));
      if (view) {
        const name = String(view.name || "").trim();
        const place = String(view.destination || "").trim();
        const start = String(view.start || "");
        const end = String(view.end_date || "");
        const dates = start && end ? `${fmt(start, false)} – ${fmt(end, true)}` : "";
        if (name) title = name;
        description = [place, dates].filter(Boolean).join(", ") || description;
        if (typeof view.image === "string" && /^https:\/\//.test(view.image)) image = view.image;
      }
    } catch {
      // Fall back to the generic card; the redirect still works
    }
  }

  const url = valid ? `${APP_URL}/shared/${id}` : APP_URL;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Dalefy">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#0E0E10">
<link rel="icon" href="/favicon.svg">
<script src="/share-redirect.js" data-to="${esc(target)}"></script>
</head>
<body style="background:#0E0E10;color:#fff;font-family:-apple-system,system-ui,sans-serif">
<p style="padding:24px"><a href="${esc(target)}" style="color:#0bd2b5">Open ${esc(title)}</a></p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Previews are fetched repeatedly by chat apps; a short shared cache keeps Firestore quiet
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
  return res.status(200).send(html);
}
