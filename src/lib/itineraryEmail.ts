/**
 * Itinerary email, rendered identically on the client (preview, clipboard)
 * and the server (Resend delivery). Keep this file dependency-free: it is
 * imported from both `src/` and `api/`.
 */

export interface ItineraryEmailInput {
  brandName: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  platformName: string;
  tripName: string;
  destination?: string | null;
  start: string;
  end: string;
  image?: string | null;
  /** Plain-text message; blank lines separate paragraphs. */
  message: string;
  shareUrl: string;
  shortCode?: string | null;
  organizer?: {
    name?: string;
    role?: string;
    company?: string;
    email?: string;
    phone?: string;
  } | null;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : new Date(value);
}

function fmt(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", opts);
}

function dateRange(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${start} - ${end}`;
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const first = sameMonth ? fmt(s, { day: "numeric" }) : fmt(s, { day: "numeric", month: "long" });
  return `${first} - ${fmt(e, { day: "numeric", month: "long", year: "numeric" })}`;
}

function nightsBetween(start: string, end: string): number {
  const s = parseDate(start);
  const e = parseDate(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
}

/** Black or white text for a given background hex. */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111111" : "#ffffff";
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const INK = "#18181b";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

export function renderItineraryEmail(input: ItineraryEmailInput): { html: string; text: string; subjectHint: string } {
  const accent = input.accentColor && /^#[0-9a-f]{6}$/i.test(input.accentColor) ? input.accentColor : "#111111";
  const accentFg = readableOn(accent);
  const nights = nightsBetween(input.start, input.end);
  const org = input.organizer && input.organizer.name?.trim() ? input.organizer : null;
  const paragraphs = input.message
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const paragraphHtml = paragraphs
    .map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");

  const cell = (label: string, value: string) => `
    <td style="padding:12px 16px 12px 0;vertical-align:top;">
      <div style="font-size:12px;color:${MUTED};margin-bottom:3px;">${escapeHtml(label)}</div>
      <div style="font-size:14px;color:${INK};font-weight:500;white-space:nowrap;">${escapeHtml(value)}</div>
    </td>`;

  const details = [
    cell("Departure", fmt(parseDate(input.start), { weekday: "short", day: "numeric", month: "short" })),
    cell("Return", fmt(parseDate(input.end), { weekday: "short", day: "numeric", month: "short" })),
    cell("Duration", `${nights} night${nights === 1 ? "" : "s"}`),
    input.destination ? cell("Destination", input.destination) : "",
  ].join("");

  const masthead = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" alt="${escapeHtml(input.brandName)}" height="28" style="height:28px;width:auto;max-width:160px;display:block;" />`
    : `<span style="font-size:15px;font-weight:600;color:${INK};letter-spacing:-0.01em;">${escapeHtml(input.brandName)}</span>`;

  const signature = org ? `
    <tr><td style="padding:24px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${LINE};">
        <tr><td style="padding-top:20px;">
          <div style="font-size:12px;color:${MUTED};margin-bottom:4px;">Your travel organiser</div>
          <div style="font-size:15px;font-weight:600;color:${INK};">${escapeHtml(org.name)}</div>
          ${org.role || org.company ? `<div style="font-size:13px;color:${MUTED};margin-top:2px;">${escapeHtml([org.role, org.company].filter(Boolean).join(", "))}</div>` : ""}
          ${org.phone ? `<div style="font-size:13px;margin-top:8px;"><a href="tel:${escapeHtml(org.phone.replace(/\s+/g, ""))}" style="color:${INK};text-decoration:none;">${escapeHtml(org.phone)}</a></div>` : ""}
          ${org.email ? `<div style="font-size:13px;margin-top:2px;"><a href="mailto:${escapeHtml(org.email)}" style="color:${INK};text-decoration:underline;">${escapeHtml(org.email)}</a></div>` : ""}
        </td></tr>
      </table>
    </td></tr>` : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(input.tripName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(paragraphs[0] ?? input.tripName)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${LINE};border-radius:12px;">

      <tr><td style="padding:24px 32px 20px;border-bottom:1px solid ${LINE};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="vertical-align:middle;">${masthead}</td>
          <td align="right" style="vertical-align:middle;font-size:12px;color:${MUTED};">Travel itinerary</td>
        </tr></table>
      </td></tr>

      ${input.image ? `<tr><td style="padding:24px 32px 0;">
        <img src="${escapeHtml(input.image)}" alt="" width="536" style="width:100%;height:auto;max-height:220px;object-fit:cover;border-radius:8px;display:block;background:#f4f4f5;" />
      </td></tr>` : ""}

      <tr><td style="padding:28px 32px 0;">
        <h1 style="margin:0;font-size:26px;line-height:1.15;font-weight:600;letter-spacing:-0.02em;color:${INK};">${escapeHtml(input.tripName)}</h1>
        <p style="margin:8px 0 0;font-size:15px;color:${MUTED};">${escapeHtml(dateRange(input.start, input.end))}${input.destination ? ` &middot; ${escapeHtml(input.destination)}` : ""}</p>
      </td></tr>

      ${paragraphHtml ? `<tr><td style="padding:24px 32px 0;">${paragraphHtml}</td></tr>` : ""}

      <tr><td style="padding:10px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};">
          <tr>${details}</tr>
        </table>
      </td></tr>

      <tr><td style="padding:24px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="border-radius:8px;background:${accent};">
            <a href="${escapeHtml(input.shareUrl)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:${accentFg};text-decoration:none;border-radius:8px;">View your itinerary</a>
          </td>
        </tr></table>
        <p style="margin:12px 0 0;font-size:12px;color:${MUTED};line-height:1.5;">Or open this link: <a href="${escapeHtml(input.shareUrl)}" style="color:${MUTED};">${escapeHtml(input.shareUrl)}</a></p>
        ${input.shortCode ? `<p style="margin:6px 0 0;font-size:13px;color:${MUTED};">In the ${escapeHtml(input.platformName)} app, join with PIN <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-weight:600;color:${INK};letter-spacing:0.08em;">${escapeHtml(input.shortCode)}</span></p>` : ""}
      </td></tr>

      ${signature}

      <tr><td style="padding:28px 32px 24px;">
        <p style="margin:0;font-size:11px;line-height:1.5;color:#9ca3af;">Sent by ${escapeHtml(input.brandName)} using ${escapeHtml(input.platformName)}. Your itinerary is live, so the link above always shows the latest version.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  const textLines: string[] = [
    input.tripName,
    `${dateRange(input.start, input.end)}${input.destination ? ` · ${input.destination}` : ""}`,
    "",
    ...paragraphs.flatMap(p => [p, ""]),
    `Departure: ${fmt(parseDate(input.start), { weekday: "short", day: "numeric", month: "short" })}`,
    `Return: ${fmt(parseDate(input.end), { weekday: "short", day: "numeric", month: "short" })}`,
    `Duration: ${nights} night${nights === 1 ? "" : "s"}`,
    ...(input.destination ? [`Destination: ${input.destination}`] : []),
    "",
    `View your itinerary: ${input.shareUrl}`,
    ...(input.shortCode ? [`In the ${input.platformName} app, join with PIN ${input.shortCode}`] : []),
  ];
  if (org) {
    textLines.push("", "Your travel organiser", org.name ?? "");
    const line = [org.role, org.company].filter(Boolean).join(", ");
    if (line) textLines.push(line);
    if (org.phone) textLines.push(org.phone);
    if (org.email) textLines.push(org.email);
  }
  textLines.push("", `Sent by ${input.brandName} using ${input.platformName}.`);

  return { html, text: textLines.join("\n"), subjectHint: `Your itinerary: ${input.tripName}` };
}
