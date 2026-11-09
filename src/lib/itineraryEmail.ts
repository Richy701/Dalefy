/**
 * Itinerary email, rendered identically on the client (preview, clipboard)
 * and the server (Resend delivery). Keep this file dependency-free: it is
 * imported from both `src/` and `api/`.
 */

import {
  renderEmailShell, paragraphs, journeyStrip, signature, escapeHtml, PALETTE, APP_STORE_URL, APP_STORE_BADGE_URL, ANDROID_APP_URL, ANDROID_ICON_URL, FONT_BODY, FONT_MONO,
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
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "Dates to be confirmed";
  if (s.toDateString() === e.toDateString()) return fmt(e, { day: "numeric", month: "long", year: "numeric" });
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
  const datesConfirmed = !isNaN(parseDate(input.start).getTime()) && !isNaN(parseDate(input.end).getTime()) && parseDate(input.end) >= parseDate(input.start);
  const nights = nightsBetween(input.start, input.end);
  const org = input.organizer && input.organizer.name?.trim() ? input.organizer : null;
  const body = paragraphs(input.message);


  const departs = fmt(parseDate(input.start), { weekday: "short", day: "numeric", month: "short" });
  const returns = fmt(parseDate(input.end), { weekday: "short", day: "numeric", month: "short" });
  const duration = datesConfirmed ? (nights === 0 ? "Day trip" : `${nights} night${nights === 1 ? "" : "s"}`) : "";
  const hasDates = Boolean(departs || returns);
  const details = {
    html: hasDates ? journeyStrip({ start: departs, end: datesConfirmed && nights === 0 ? "" : returns, between: duration, place: input.destination }) : "",
    text: [
      departs && `Departure: ${departs}`,
      returns && `Return: ${returns}`,
      input.destination && `Destination: ${input.destination}`,
      duration && `Duration: ${duration}`,
    ].filter(Boolean).join("\n"),
  };

  const sig = org ? signature({
    heading: "Your travel organiser",
    name: org.name ?? "",
    line: [org.role, org.company].filter(Boolean).join(", ") || undefined,
    phone: org.phone,
    email: org.email,
  }) : null;

  const app = {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border:1px solid ${PALETTE.border};border-radius:8px;background:${PALETTE.raised};"><tr><td style="padding:18px 20px;">
      <p style="margin:0;font-size:15px;line-height:1.4;font-weight:600;color:${PALETTE.ink};">Get the ${escapeHtml(input.platformName)} app</p>
      <p style="margin:4px 0 14px;font-size:13px;line-height:1.5;color:${PALETTE.muted};">${input.shortCode ? "Download it on your phone, then join your trip with this PIN." : "Download it on your phone to have your trip with you."}</p>
      ${input.shortCode ? `<p style="margin:0 0 14px;font-family:${FONT_MONO};font-size:24px;line-height:1.4;font-weight:600;color:${PALETTE.ink};letter-spacing:0.18em;overflow-wrap:anywhere;">${escapeHtml(input.shortCode)}</p>` : ""}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td class="store-col" valign="middle" style="padding:0 10px 0 0;"><a href="${escapeHtml(APP_STORE_URL)}" style="display:block;width:120px;color:${PALETTE.ink};text-decoration:none;"><img src="${escapeHtml(APP_STORE_BADGE_URL)}" alt="iPhone download" width="120" height="40" style="display:block;width:120px;height:40px;font-family:${FONT_BODY};font-size:13px;line-height:40px;font-weight:600;color:${PALETTE.ink};text-align:center;" /></a></td>
        <td class="store-col" valign="middle" style="padding:0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:7px;background:${PALETTE.ink};mso-padding-alt:4px 12px 4px 10px;"><a href="${escapeHtml(ANDROID_APP_URL)}" style="display:inline-block;padding:4px 12px 4px 10px;border:1px solid ${PALETTE.ink};border-radius:7px;font-family:${FONT_BODY};color:${PALETTE.card};text-decoration:none;white-space:nowrap;"><img src="${escapeHtml(ANDROID_ICON_URL)}" alt="" width="22" height="22" style="display:inline-block;width:22px;height:22px;margin-right:6px;vertical-align:middle;" /><span style="display:inline-block;vertical-align:middle;text-align:left;color:${PALETTE.card};"><span style="display:block;font-size:10px;line-height:12px;">Download for</span><span style="display:block;font-size:16px;line-height:18px;font-weight:600;">Android</span></span></a></td></tr></table></td>
      </tr></table>
    </td></tr></table>`,
    text: `Get the ${input.platformName} app\niPhone: ${APP_STORE_URL}\nAndroid: ${ANDROID_APP_URL}${input.shortCode ? `\nThen join your trip with PIN ${input.shortCode}` : ""}`,
  };
  const ctaNote = {
    html: `<p style="margin:14px 0 0;font-size:12px;color:${PALETTE.muted};line-height:1.5;">Button not working? <a href="${escapeHtml(input.shareUrl)}" style="color:${PALETTE.muted};word-break:break-all;">Open your itinerary</a></p>${app.html}`,
    text: app.text,
  };

  // The journey strip already shows these on invites and reminders; other templates have no strip.
  const subtitle = showDetails && hasDates ? undefined : `${dateRange(input.start, input.end)}${input.destination ? ` · ${input.destination}` : ""}`;

  const { html, text } = renderEmailShell({
    brand: {
      brandName: input.brandName,
      logoUrl: input.logoUrl,
      accentColor: input.accentColor,
      platformName: input.platformName,
    },
    preheader: `${headings[variant]} · ${input.tripName} · ${dateRange(input.start, input.end)}`,
    presentation: "itinerary",
    eyebrow: headings[variant],
    title: input.tripName,
    subtitle,
    image: variant === "invite" || variant === "reminder" ? input.image : undefined,
    imageAfterTitle: true,
    bodyHtml: body.html,
    bodyText: `${body.text}${showDetails ? `\n\n${details.text}` : ""}`,
    contextHtml: showDetails && details.html ? details.html : undefined,
    cta: { label: variant === "update" ? "Review updated itinerary" : variant === "reminder" ? "Check your travel plans" : "View your itinerary", url: input.shareUrl },
    ctaNoteHtml: ctaNote.html,
    ctaNoteText: ctaNote.text,
    afterHtml: sig?.html,
    afterText: sig?.text,
    footerText: "This itinerary is live, so the link always shows the latest version.",
  });

  return { html, text, subjectHint: `Your itinerary: ${input.tripName}` };
}
