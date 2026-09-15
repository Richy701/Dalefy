/**
 * Itinerary email, rendered identically on the client (preview, clipboard)
 * and the server (Resend delivery). Keep this file dependency-free: it is
 * imported from both `src/` and `api/`.
 */

import {
  renderEmailShell, paragraphs, detailStrip, signature, pinLine, escapeHtml, PALETTE,
} from "./email/layout.js";

export { escapeHtml };

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

export function renderItineraryEmail(input: ItineraryEmailInput): { html: string; text: string; subjectHint: string } {
  const nights = nightsBetween(input.start, input.end);
  const org = input.organizer && input.organizer.name?.trim() ? input.organizer : null;
  const body = paragraphs(input.message);

  const details = detailStrip([
    { label: "Departure", value: fmt(parseDate(input.start), { weekday: "short", day: "numeric", month: "short" }) },
    { label: "Return", value: fmt(parseDate(input.end), { weekday: "short", day: "numeric", month: "short" }) },
    { label: "Duration", value: `${nights} night${nights === 1 ? "" : "s"}` },
    { label: "Destination", value: input.destination ?? "" },
  ]);

  const sig = org ? signature({
    heading: "Your travel organiser",
    name: org.name ?? "",
    line: [org.role, org.company].filter(Boolean).join(", ") || undefined,
    phone: org.phone,
    email: org.email,
  }) : null;

  const pin = input.shortCode ? pinLine(input.platformName, input.shortCode) : null;
  const ctaNote = {
    html: `<p style="margin:12px 0 0;font-size:12px;color:${PALETTE.muted};line-height:1.5;">Button not working? <a href="${escapeHtml(input.shareUrl)}" style="color:${PALETTE.muted};word-break:break-all;">Open your itinerary</a></p>${pin?.html ?? ""}`,
    text: pin?.text ?? "",
  };

  const subtitle = `${dateRange(input.start, input.end)}${input.destination ? ` · ${input.destination}` : ""}`;

  const { html, text } = renderEmailShell({
    brand: {
      brandName: input.brandName,
      logoUrl: input.logoUrl,
      accentColor: input.accentColor,
      platformName: input.platformName,
    },
    preheader: body.first || input.tripName,
    eyebrow: "Travel itinerary",
    title: input.tripName,
    subtitle,
    image: input.image,
    bodyHtml: body.html + details.html,
    bodyText: `${body.text}\n\n${details.text}`,
    cta: { label: "View your itinerary", url: input.shareUrl },
    ctaNoteHtml: ctaNote.html,
    ctaNoteText: ctaNote.text,
    afterHtml: sig?.html,
    afterText: sig?.text,
    footerText: `Sent by ${input.brandName} using ${input.platformName}. Your itinerary is live, so the link above always shows the latest version.`,
  });

  return { html, text, subjectHint: `Your itinerary: ${input.tripName}` };
}
