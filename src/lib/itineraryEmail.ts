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
  template?: string;
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
  const variant = ["invite", "reminder", "dresscode", "update", "custom"].includes(input.template ?? "") ? input.template! : "invite";
  const headings: Record<string, string> = { invite: "Travel itinerary", reminder: "Before you travel", dresscode: "Dress code", update: "Itinerary updated", custom: "A message from your organiser" };
  const showDetails = variant === "invite" || variant === "reminder";
  const nights = nightsBetween(input.start, input.end);
  const org = input.organizer && input.organizer.name?.trim() ? input.organizer : null;
  const body = paragraphs(input.message);

  // Render actual bullet lines as scannable rows, preserving all edited wording.
  const structuredMessage = input.message.split(/\n{2,}/).filter(p => p.trim()).map(part => {
    const lines = part.trim().split("\n");
    return lines.some(line => /^\s*[•-]\s+/.test(line))
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${lines.map(line => /^\s*[•-]\s+/.test(line)
          ? `<tr><td width="24" valign="top" style="padding:12px 0;border-bottom:1px solid ${PALETTE.border};color:${PALETTE.muted};">&#9633;</td><td style="padding:12px 0;border-bottom:1px solid ${PALETTE.border};font-size:15px;line-height:1.6;color:${PALETTE.body};">${escapeHtml(line.replace(/^\s*[•-]\s+/, ""))}</td></tr>`
          : `<tr><td colspan="2" style="padding:0 0 8px;font-size:15px;font-weight:600;color:${PALETTE.ink};">${escapeHtml(line)}</td></tr>`).join("")}</table>`
      : paragraphs(part).html;
  }).join("");
  const departure = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:${PALETTE.raised};border-radius:8px;"><tr><td style="padding:20px;"><p style="margin:0 0 8px;font-size:12px;color:${PALETTE.muted};">Your departure</p><p style="margin:0;font-size:24px;font-weight:600;letter-spacing:-0.5px;color:${PALETTE.ink};">${escapeHtml(fmt(parseDate(input.start), { weekday: "short", day: "numeric", month: "long" }))}</p>${input.destination ? `<p style="margin:8px 0 0;font-size:14px;color:${PALETTE.muted};">${escapeHtml(input.destination)}</p>` : ""}</td></tr></table>`;
  const updateMessage = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.raised};border-radius:8px;"><tr><td style="padding:20px;"><p style="margin:0 0 12px;font-size:12px;font-weight:600;color:${PALETTE.ink};">A note from your organiser</p>${structuredMessage}</td></tr></table>`;

  const details = detailStrip([
    { label: "Departure", value: fmt(parseDate(input.start), { weekday: "short", day: "numeric", month: "short" }) },
    { label: "Return", value: fmt(parseDate(input.end), { weekday: "short", day: "numeric", month: "short" }) },
    { label: "Destination", value: input.destination ?? "" },
    { label: "Duration", value: `${nights} night${nights === 1 ? "" : "s"}` },
  ], "grid");

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
    eyebrow: variant === "invite" ? "Your next trip" : input.brandName,
    title: variant === "invite" ? input.tripName : headings[variant],
    subtitle: variant === "invite" ? subtitle : `${input.tripName} · ${subtitle}`,
    image: variant === "invite" ? input.image : undefined,
    imageAfterTitle: true,
    bodyHtml: variant === "reminder" ? departure + structuredMessage : variant === "update" ? updateMessage : structuredMessage + (variant === "invite" ? details.html : ""),
    bodyText: `${body.text}${showDetails ? `\n\n${details.text}` : ""}`,
    cta: { label: variant === "update" ? "Review updated itinerary" : variant === "reminder" ? "Check your travel plans" : "View your itinerary", url: input.shareUrl },
    ctaNoteHtml: ctaNote.html,
    ctaNoteText: ctaNote.text,
    afterHtml: sig?.html,
    afterText: sig?.text,
    footerText: `Sent by ${input.brandName} using ${input.platformName}. Your itinerary is live, so the link above always shows the latest version.`,
  });

  return { html, text, subjectHint: `Your itinerary: ${input.tripName}` };
}
