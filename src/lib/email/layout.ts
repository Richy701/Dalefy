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
  /** Inbox preview line. */
  preheader: string;
  /** Small uppercase label above the heading, e.g. "Team invitation". */
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  image?: string | null;
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
  muted: "#6b7280",
  accent: "#0bd2b5",
} as const;

export const FONT_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const FONT_DISPLAY = "'Barlow Condensed', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
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
    .map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${PALETTE.body};">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
  return { html, text: parts.join("\n\n"), first: parts[0] ?? "" };
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${PALETTE.body};">${html}</p>`;
}

export function eyebrowLabel(text: string): string {
  return `<div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${PALETTE.muted};">${escapeHtml(text)}</div>`;
}

/** A row of label/value cells separated by hairlines above and below. */
export function detailStrip(items: Array<{ label: string; value: string }>): { html: string; text: string } {
  const cells = items.filter(i => i.value).map(i => `
      <td style="padding:14px 16px 14px 0;vertical-align:top;">
        ${eyebrowLabel(i.label)}
        <div style="margin-top:4px;font-size:15px;color:${PALETTE.ink};font-weight:600;white-space:nowrap;">${escapeHtml(i.value)}</div>
      </td>`).join("");
  const html = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${PALETTE.border};border-bottom:1px solid ${PALETTE.border};">
      <tr>${cells}</tr>
    </table>`;
  const text = items.filter(i => i.value).map(i => `${i.label}: ${i.value}`).join("\n");
  return { html, text };
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
  const html = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${PALETTE.border};">
      <tr><td style="padding-top:20px;">
        ${eyebrowLabel(s.heading)}
        <div style="margin-top:6px;font-size:16px;font-weight:600;color:${PALETTE.ink};">${escapeHtml(s.name)}</div>
        ${s.line ? `<div style="font-size:13px;color:${PALETTE.muted};margin-top:2px;">${escapeHtml(s.line)}</div>` : ""}
        ${s.phone ? `<div style="font-size:13px;margin-top:8px;"><a href="tel:${escapeHtml(s.phone.replace(/\s+/g, ""))}" style="color:${PALETTE.ink};text-decoration:none;">${escapeHtml(s.phone)}</a></div>` : ""}
        ${s.email ? `<div style="font-size:13px;margin-top:2px;"><a href="mailto:${escapeHtml(s.email)}" style="color:${PALETTE.ink};text-decoration:underline;">${escapeHtml(s.email)}</a></div>` : ""}
      </td></tr>
    </table>`;
  const text = [s.heading, s.name, s.line, s.phone, s.email].filter(Boolean).join("\n");
  return { html, text };
}

export function pinLine(platformName: string, code: string): { html: string; text: string } {
  return {
    html: `<p style="margin:6px 0 0;font-size:13px;color:${PALETTE.muted};">In the ${escapeHtml(platformName)} app, join with PIN <span style="font-family:${FONT_MONO};font-weight:600;color:${PALETTE.ink};letter-spacing:0.08em;">${escapeHtml(code)}</span></p>`,
    text: `In the ${platformName} app, join with PIN ${code}`,
  };
}

export function renderEmailShell(input: EmailShellInput): { html: string; text: string } {
  const accent = resolveAccent(input.brand.accentColor);
  const accentFg = readableOn(accent);
  const brandName = input.brand.brandName.trim() || input.brand.platformName;

  const masthead = input.brand.logoUrl
    ? `<img src="${escapeHtml(input.brand.logoUrl)}" alt="${escapeHtml(brandName)}" height="28" style="height:28px;width:auto;max-width:160px;display:block;" />`
    : `<span style="font-family:${FONT_DISPLAY};font-size:22px;font-weight:800;letter-spacing:-0.01em;text-transform:uppercase;color:${PALETTE.ink};">${escapeHtml(brandName)}</span>`;

  const cta = input.cta ? `
      <tr><td style="padding:28px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="border-radius:10px;background:${accent};">
            <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:13px 24px;font-family:${FONT_BODY};font-size:14px;font-weight:600;color:${accentFg};text-decoration:none;border-radius:10px;">${escapeHtml(input.cta.label)}</a>
          </td>
        </tr></table>
        ${input.ctaNoteHtml ?? ""}
      </td></tr>` : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(input.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&display=swap" rel="stylesheet" />
<style>@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:${PALETTE.page};font-family:${FONT_BODY};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PALETTE.page};">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:${PALETTE.card};border:1px solid ${PALETTE.border};border-radius:12px;overflow:hidden;">

      <tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>

      <tr><td style="padding:22px 32px 18px;border-bottom:1px solid ${PALETTE.border};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="vertical-align:middle;">${masthead}</td>
          <td align="right" style="vertical-align:middle;">${eyebrowLabel(input.eyebrow)}</td>
        </tr></table>
      </td></tr>

      ${input.image ? `<tr><td style="padding:24px 32px 0;">
        <img src="${escapeHtml(input.image)}" alt="" width="536" style="width:100%;height:auto;max-height:220px;object-fit:cover;border-radius:10px;display:block;background:${PALETTE.raised};" />
      </td></tr>` : ""}

      <tr><td style="padding:30px 32px 0;">
        <h1 style="margin:0;font-family:${FONT_DISPLAY};font-size:34px;line-height:1.02;font-weight:800;letter-spacing:-0.01em;text-transform:uppercase;color:${PALETTE.ink};">${escapeHtml(input.title)}</h1>
        ${input.subtitle ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.5;color:${PALETTE.muted};">${escapeHtml(input.subtitle)}</p>` : ""}
      </td></tr>

      ${input.bodyHtml ? `<tr><td style="padding:22px 32px 0;">${input.bodyHtml}</td></tr>` : ""}

      ${cta}

      ${input.afterHtml ? `<tr><td style="padding:26px 32px 0;">${input.afterHtml}</td></tr>` : ""}

      <tr><td style="padding:28px 32px 24px;">
        <p style="margin:0;font-size:11px;line-height:1.5;color:${PALETTE.muted};">${escapeHtml(input.footerText)}</p>
      </td></tr>

    </table>
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
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n").trim();

  return { html, text };
}
