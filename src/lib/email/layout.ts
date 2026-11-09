/**
 * Shared email shell. Every outbound email (itinerary, invites, auth, trip
 * updates) renders through this so they look like one product.
 *
 * Keep this file dependency-free: it is imported from both `src/` (previews)
 * and `api/` (Resend delivery).
 */

export interface EmailBrand {
  /** Sender identity shown in the masthead, e.g. the organisation's name. */
  brandName: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  /** The product name used in the footer, always "Dalefy". */
  platformName: string;
}

export interface EmailCta {
  label: string;
  url: string;
}

export interface EmailShellInput {
  brand: EmailBrand;
  presentation?: "itinerary";
  contextHtml?: string;
  /** Inbox preview line. */
  preheader: string;
  /** Small uppercase label above the heading, e.g. "Team invitation". */
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  image?: string | null;
  imageAfterTitle?: boolean;
  /** Inner HTML for the body. Use the helpers below to build it. */
  bodyHtml: string;
  bodyText: string;
  cta?: EmailCta | null;
  /** HTML and text shown directly under the button. */
  ctaNoteHtml?: string;
  ctaNoteText?: string;
  /** HTML and text after the button, e.g. a details strip or a signature. */
  afterHtml?: string;
  afterText?: string;
  footerText: string;
}

export const PALETTE = {
  page: "#f7f7f9",
  card: "#ffffff",
  raised: "#f1f1f4",
  border: "#e4e4e9",
  ink: "#0e0e10",
  body: "#26272e",
  muted: "#616875",
  accent: "#0bd2b5",
} as const;

/** Public site, used for the legal links in the footer. */
export const SITE_URL = "https://dalefy.app";

/** Where travellers download the iPhone app. */
export const APP_STORE_URL = "https://apps.apple.com/gb/app/id6765462755";
/** Apple's official badge, as PNG because Gmail and Outlook don't show SVG. */
export const APP_STORE_BADGE_URL = `${SITE_URL}/app-store-badge.png`;
/** Redirects to the current APK, so emails already sent keep working after a new build. */
export const ANDROID_APP_URL = `${SITE_URL}/android`;
export const ANDROID_ICON_URL = `${SITE_URL}/android-icon-white.png`;

export const FONT_BODY = "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
export const FONT_DISPLAY = FONT_BODY;
export const FONT_MONO = "'SF Mono', Menlo, Consolas, monospace";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function relativeLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Ink or white text for a given background hex, whichever has the higher WCAG contrast. */
export function readableOn(hex: string): string {
  const bg = relativeLuminance(hex);
  if (bg === null) return "#ffffff";
  const ink = relativeLuminance(PALETTE.ink) ?? 0;
  return contrast(bg, ink) >= contrast(bg, 1) ? PALETTE.ink : "#ffffff";
}

export function resolveAccent(accent?: string | null): string {
  return accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : PALETTE.accent;
}

/** Plain text with blank-line paragraphs -> HTML paragraphs + normalised text. */
export function paragraphs(message: string): { html: string; text: string; first: string } {
  const parts = message.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const html = parts
    .map(p => {
      const lines = p.split("\n");
      const bulletStart = lines.findIndex(line => /^\s*[•*-]\s+/.test(line));
      if (bulletStart < 0 || !lines.slice(bulletStart).every(line => /^\s*[•*-]\s+/.test(line))) {
        return paragraph(escapeHtml(p).replace(/\n/g, "<br />"));
      }
      const introduction = lines.slice(0, bulletStart).join("\n");
      const items = lines.slice(bulletStart).map(line => `<li style="padding:0 0 8px;">${escapeHtml(line.replace(/^\s*[•*-]\s+/, ""))}</li>`).join("");
      return (introduction ? paragraph(escapeHtml(introduction).replace(/\n/g, "<br />")) : "") + `<ul style="margin:0 0 18px;padding-left:22px;font-size:15px;line-height:1.6;color:${PALETTE.body};">${items}</ul>`;
    })
    .join("");
  return { html, text: parts.join("\n\n"), first: parts[0] ?? "" };
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${PALETTE.body};">${html}</p>`;
}

export function eyebrowLabel(text: string): string {
  return `<div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${PALETTE.muted};">${escapeHtml(text)}</div>`;
}

/** Trip dates as a boarding-pass style line: depart, nights, return, then the place. */
export function journeyStrip(input: { start: string; end: string; between?: string; place?: string | null }): string {
  const label = (text: string, align: string) => `<div style="font-family:${FONT_BODY};font-size:11px;line-height:1.5;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${PALETTE.muted};text-align:${align};">${escapeHtml(text)}</div>`;
  const date = (text: string, align: string) => `<div class="journey-date" style="margin-top:4px;font-family:${FONT_BODY};font-size:20px;line-height:1.3;font-weight:600;letter-spacing:-0.3px;color:${PALETTE.ink};text-align:${align};white-space:nowrap;">${escapeHtml(text)}</div>`;
  const rule = `<div style="height:1px;line-height:1px;font-size:1px;background:${PALETTE.border};">&nbsp;</div>`;
  const place = input.place?.trim();

  let dates = "";
  if (input.start && input.end) {
    const between = input.between
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td width="50%" valign="middle">${rule}</td>
          <td valign="middle" style="padding:0 8px;font-family:${FONT_BODY};font-size:12px;line-height:1.5;font-weight:500;color:${PALETTE.muted};white-space:nowrap;">${escapeHtml(input.between)}</td>
          <td width="50%" valign="middle">${rule}</td>
        </tr></table>`
      : rule;
    dates = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td valign="bottom">${label("Depart", "left")}${date(input.start, "left")}</td>
        <td class="journey-between" width="100%" valign="bottom" style="padding:0 12px 3px;">${between}</td>
        <td valign="bottom">${label("Return", "right")}${date(input.end, "right")}</td>
      </tr></table>`;
  } else if (input.start || input.end) {
    dates = `${label(input.between || (input.start ? "Depart" : "Return"), "left")}${date(input.start || input.end, "left")}`;
  }

  const placeHtml = place ? `<div style="${dates ? "margin-top:14px;" : ""}font-family:${FONT_BODY};font-size:15px;line-height:1.5;font-weight:500;color:${PALETTE.body};overflow-wrap:anywhere;">${escapeHtml(place)}</div>` : "";
  return dates || placeHtml ? `<div style="padding:8px 0;">${dates}${placeHtml}</div>` : "";
}

/** A bulleted list on a raised card. */
export function listCard(items: string[]): { html: string; text: string } {
  const rows = items.map(i => `
      <tr><td style="padding:6px 0;font-size:15px;line-height:1.5;color:${PALETTE.body};">
        <span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:${PALETTE.muted};vertical-align:middle;margin:0 12px 2px 0;"></span>${escapeHtml(i)}
      </td></tr>`).join("");
  const html = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PALETTE.raised};border-radius:12px;">
      <tr><td style="padding:14px 18px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table></td></tr>
    </table>`;
  return { html, text: items.map(i => `- ${i}`).join("\n") };
}

export interface SignatureInput {
  heading: string;
  name: string;
  line?: string;
  phone?: string;
  email?: string;
}

export function signature(s: SignatureInput): { html: string; text: string } {
  const contact = s.phone || s.email ? `<td class="stack-col signature-contact" width="50%" valign="top" align="right" style="padding-left:16px;text-align:right;overflow-wrap:anywhere;">
          ${s.phone ? `<div style="font-size:13px;line-height:1.5;margin-top:2px;"><a href="tel:${escapeHtml(s.phone.replace(/\s+/g, ""))}" style="color:${PALETTE.ink};text-decoration:none;">${escapeHtml(s.phone)}</a></div>` : ""}
          ${s.email ? `<div style="font-size:13px;line-height:1.5;margin-top:2px;"><a href="mailto:${escapeHtml(s.email)}" style="color:${PALETTE.ink};text-decoration:underline;">${escapeHtml(s.email)}</a></div>` : ""}
        </td>` : "";
  const html = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${PALETTE.border};">
      <tr><td style="padding-top:20px;">
        ${eyebrowLabel(s.heading)}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:6px;"><tr>
          <td class="stack-col" valign="top" ${contact ? 'width="50%"' : ""} style="overflow-wrap:anywhere;">
            <div style="font-size:16px;font-weight:600;color:${PALETTE.ink};">${escapeHtml(s.name)}</div>
            ${s.line ? `<div style="font-size:13px;color:${PALETTE.muted};margin-top:2px;">${escapeHtml(s.line)}</div>` : ""}
          </td>
          ${contact}
        </tr></table>
      </td></tr>
    </table>`;
  const text = [s.heading, s.name, s.line, s.phone, s.email].filter(Boolean).join("\n");
  return { html, text };
}

export function pinLine(platformName: string, code: string): { html: string; text: string } {
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;border:1px solid ${PALETTE.border};border-radius:8px;background:${PALETTE.raised};"><tr><td style="padding:16px 20px;">
      <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${PALETTE.muted};">Join in the ${escapeHtml(platformName)} app with your trip PIN</p>
      <p style="margin:0;font-family:${FONT_MONO};font-size:24px;line-height:1.4;font-weight:600;color:${PALETTE.ink};letter-spacing:0.18em;overflow-wrap:anywhere;">${escapeHtml(code)}</p>
    </td></tr></table>`,
    text: `In the ${platformName} app, join with PIN ${code}`,
  };
}

export function renderEmailShell(input: EmailShellInput): { html: string; text: string } {
  const editorial = input.presentation === "itinerary";
  const accent = resolveAccent(input.brand.accentColor);
  const accentFg = readableOn(accent);
  const brandName = input.brand.brandName.trim() || input.brand.platformName;

  const defaultLogo = brandName.toLowerCase() === "dalefy";
  const logoUrl = input.brand.logoUrl || (defaultLogo ? `${SITE_URL}/dalefy-email-logo.png` : null);
  const isDalefyMark = logoUrl === `${SITE_URL}/dalefy-email-logo.png`;
  const masthead = `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
    ${logoUrl ? `<td style="padding-right:12px;vertical-align:middle;"><img src="${escapeHtml(logoUrl)}" alt="${editorial || defaultLogo ? "" : escapeHtml(brandName)}" width="${isDalefyMark ? "36" : "120"}" ${isDalefyMark ? 'height="36"' : ""} style="height:${isDalefyMark ? "36px" : "auto"};width:${isDalefyMark ? "36px" : "120px"};max-width:160px;display:block;border-radius:${defaultLogo ? "8px" : "0"};" /></td>` : ""}
    ${editorial || defaultLogo || !logoUrl ? `<td style="font-family:${FONT_BODY};font-size:24px;font-weight:700;letter-spacing:-0.5px;line-height:1.3;color:${PALETTE.ink};overflow-wrap:anywhere;">${escapeHtml(brandName)}</td>` : ""}
  </tr></table>`;

  const footerLinks = `<a href="${SITE_URL}/privacy.html" style="color:${PALETTE.muted};">Privacy</a> &middot; <a href="${SITE_URL}/terms.html" style="color:${PALETTE.muted};">Terms</a> &middot; <a href="${SITE_URL}/support.html" style="color:${PALETTE.muted};">Support</a>`;

  const cta = input.cta ? `
      <tr><td class="content-pad" style="padding:28px 40px 0;">
        <!--[if mso]>
        <v:roundrect href="${escapeHtml(input.cta.url)}" style="height:52px;v-text-anchor:middle;width:${editorial ? "518px" : "260px"};" arcsize="15%" stroke="f" fillcolor="${accent}">
          <w:anchorlock/>
          <center style="color:${accentFg};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">${escapeHtml(input.cta.label)}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"${editorial ? ' width="100%"' : ""}><tr>
          <td ${editorial ? 'align="center" ' : ""}style="border-radius:8px;background:${accent};mso-padding-alt:16px 28px;">
            <a href="${escapeHtml(input.cta.url)}" style="display:${editorial ? "block;text-align:center" : "inline-block"};padding:16px 28px;font-family:${FONT_BODY};font-size:14px;font-weight:600;color:${accentFg};text-decoration:none;border:1px solid ${accent};border-radius:8px;">${escapeHtml(input.cta.label)}</a>
          </td>
        </tr></table>
        <!--<![endif]-->
        ${input.ctaNoteHtml ?? ""}
      </td></tr>` : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(input.title)}</title>
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&amp;display=swap" rel="stylesheet" />
<!--<![endif]-->
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  td, p, a, h1, div, li { font-family:Arial,Helvetica,sans-serif !important; }
  .itinerary-image { height:auto !important; }
</style>
<![endif]-->
<style>
  table { border-collapse:separate; border-spacing:0; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { text-underline-offset:3px; }
  @media only screen and (max-width:620px) {
    .outer-pad { padding:16px 8px !important; }
    .content-pad { padding-left:24px !important; padding-right:24px !important; }
    .email-title { font-size:26px !important; }
    .itinerary-title { font-size:34px !important; }
    .itinerary-image { height:auto !important; }
    .email-card { border-radius:12px !important; }
    .journey-date { font-size:17px !important; }
  }
  @media only screen and (max-width:480px) {
    .stack-col { display:block !important; width:100% !important; padding-left:0 !important; text-align:left !important; }
    .signature-contact { padding-top:8px !important; }
  }
  @media only screen and (max-width:360px) {
    .footer-col { display:block !important; width:100% !important; text-align:left !important; }
    .store-col { display:block !important; padding:0 0 8px !important; }
    .journey-date { font-size:15px !important; }
    .journey-between { padding-left:6px !important; padding-right:6px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PALETTE.page};font-family:${FONT_BODY};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(input.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PALETTE.page};">
  <tr><td class="outer-pad" align="center" style="padding:40px 12px;">
    <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td width="600"><![endif]-->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="email-card" width="600" style="max-width:600px;width:100%;background:${PALETTE.card};border:${editorial ? "0" : `1px solid ${PALETTE.border}`};border-radius:${editorial ? "0" : "16px"};overflow:hidden;">

      <tr><td class="content-pad" style="padding:${editorial ? "32px 40px 16px" : "32px 40px"};${editorial ? "" : `border-bottom:1px solid ${PALETTE.border};`}">
        ${masthead}
      </td></tr>

      ${input.image && !input.imageAfterTitle ? `<tr><td>
        <img src="${escapeHtml(input.image)}" alt="" width="598" style="width:100%;height:auto;display:block;background:${PALETTE.raised};" />
      </td></tr>` : ""}

      <tr><td class="content-pad" style="padding:36px 40px 0;">
        ${editorial ? `<p style="margin:0;font-size:13px;line-height:1.5;font-weight:500;color:${PALETTE.muted};">${escapeHtml(input.eyebrow)}</p>` : eyebrowLabel(input.eyebrow)}
        <h1 class="email-title ${editorial ? "itinerary-title" : ""}" style="margin:12px 0 0;font-family:${FONT_DISPLAY};font-size:${editorial ? "44px" : "30px"};line-height:1.2;font-weight:600;letter-spacing:${editorial ? "-1.5px" : "-0.6px"};color:${PALETTE.ink};overflow-wrap:anywhere;">${escapeHtml(input.title)}</h1>
        ${input.subtitle ? `<p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:${PALETTE.muted};">${escapeHtml(input.subtitle)}</p>` : ""}
      </td></tr>

      ${input.image && input.imageAfterTitle ? `<tr><td class="${editorial ? "" : "content-pad"}" style="padding:${editorial ? "28px 0 0" : "24px 40px 0"};"><!--[if !mso]><!--><img class="itinerary-image" src="${escapeHtml(input.image)}" alt="" width="${editorial ? "600" : "518"}" style="width:100%;height:${editorial ? "300px" : "240px"};object-fit:cover;display:block;border-radius:${editorial ? "0" : "8px"};background:${PALETTE.raised};" /><!--<![endif]--><!--[if mso]><img src="${escapeHtml(input.image)}" alt="" width="${editorial ? "600" : "518"}" style="width:${editorial ? "600" : "518"}px;display:block;" /><![endif]--></td></tr>` : ""}

      ${input.contextHtml ? `<tr><td class="content-pad" style="padding:16px 40px;border-bottom:1px solid ${PALETTE.border};">${input.contextHtml}</td></tr>` : ""}

      ${input.bodyHtml ? `<tr><td class="content-pad" style="padding:24px 40px 0;">${input.bodyHtml}</td></tr>` : ""}

      ${cta}

      ${input.afterHtml ? `<tr><td class="content-pad" style="padding:28px 40px 0;">${input.afterHtml}</td></tr>` : ""}

      <tr><td class="content-pad" style="padding:32px 40px 36px;">
        <div style="height:1px;background:${PALETTE.border};margin-bottom:22px;"></div>
        ${editorial ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px;"><tr>
          <td class="footer-col" valign="middle" style="font-size:12px;line-height:1.5;color:${PALETTE.muted};">Powered by <a href="${SITE_URL}" style="font-family:${FONT_BODY};font-size:18px;letter-spacing:-0.5px;font-weight:700;color:${PALETTE.ink};text-decoration:none;">Dalefy</a></td>
          <td class="footer-col" valign="middle" align="right" style="font-size:12px;line-height:1.5;color:${PALETTE.muted};text-align:right;white-space:nowrap;">${footerLinks}</td>
        </tr></table>` : ""}
        <p style="margin:0;font-size:12px;line-height:1.5;color:${PALETTE.muted};">${escapeHtml(input.footerText.replace("Sent by Dalefy using Dalefy.", "Sent by Dalefy."))}</p>
        ${editorial ? "" : `<p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:${PALETTE.muted};">${footerLinks}</p>`}
      </td></tr>

    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    input.eyebrow.toUpperCase(),
    input.title,
    input.subtitle ?? "",
    "",
    input.bodyText,
    "",
    input.cta ? `${input.cta.label}: ${input.cta.url}` : "",
    input.ctaNoteText ?? "",
    input.afterText ? `\n${input.afterText}` : "",
    "",
    input.footerText,
    `Privacy: ${SITE_URL}/privacy.html · Terms: ${SITE_URL}/terms.html`,
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n").trim();

  return { html, text };
}
