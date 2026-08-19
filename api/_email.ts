/**
 * Provider-agnostic transactional email for API routes.
 *
 * Provider is chosen by env:
 *   EMAIL_PROVIDER=resend | brevo   (explicit override)
 *   otherwise: Resend when RESEND_FROM_EMAIL is set (verified domain),
 *              Brevo when BREVO_API_KEY is set,
 *              Resend sandbox as a last resort (only delivers to the account owner).
 *
 * Switching providers later (e.g. when a domain is available) is env-only:
 * set RESEND_API_KEY + RESEND_FROM_EMAIL and remove BREVO_API_KEY.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface SendEmailResult {
  sent: boolean;
  provider: "resend" | "brevo" | "none";
  id?: string;
  error?: string;
}

const env = (k: string) => (process.env[k] ?? "").trim();

const DEFAULT_FROM_NAME = "Dalefy";

function resolveProvider(): "resend" | "brevo" | "none" {
  const explicit = env("EMAIL_PROVIDER").toLowerCase();
  if (explicit === "resend" && env("RESEND_API_KEY")) return "resend";
  if (explicit === "brevo" && env("BREVO_API_KEY")) return "brevo";
  if (env("RESEND_API_KEY") && env("RESEND_FROM_EMAIL")) return "resend";
  if (env("BREVO_API_KEY")) return "brevo";
  if (env("RESEND_API_KEY")) return "resend";
  return "none";
}

export function emailConfigured(): boolean {
  return resolveProvider() !== "none";
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = resolveProvider();
  try {
    if (provider === "resend") return await viaResend(input);
    if (provider === "brevo") return await viaBrevo(input);
    return { sent: false, provider: "none", error: "No email provider configured" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] ${provider} send failed:`, message);
    return { sent: false, provider, error: message };
  }
}

async function viaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const { Resend } = await import("resend");
  const resend = new Resend(env("RESEND_API_KEY"));
  const from = env("RESEND_FROM_EMAIL") || `${DEFAULT_FROM_NAME} <onboarding@resend.dev>`;
  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
  });
  if (error) return { sent: false, provider: "resend", error: error.message };
  return { sent: true, provider: "resend", id: data?.id };
}

async function viaBrevo(input: SendEmailInput): Promise<SendEmailResult> {
  const senderEmail = env("BREVO_FROM_EMAIL");
  if (!senderEmail) return { sent: false, provider: "brevo", error: "BREVO_FROM_EMAIL not set" };
  const senderName = env("BREVO_FROM_NAME") || DEFAULT_FROM_NAME;

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env("BREVO_API_KEY"),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: input.to }],
      replyTo: input.replyTo ? { email: input.replyTo } : undefined,
      subject: input.subject,
      htmlContent: input.html,
      textContent: input.text,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { sent: false, provider: "brevo", error: `Brevo ${resp.status}: ${body.slice(0, 300)}` };
  }
  const data = (await resp.json().catch(() => ({}))) as { messageId?: string };
  return { sent: true, provider: "brevo", id: data.messageId };
}

// ── Shared branded template ────────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface BrandedEmailInput {
  preheader: string;
  eyebrow?: string;
  heading: string;
  /** Paragraphs of body copy (plain text, escaped for you). */
  paragraphs: string[];
  cta: { label: string; url: string };
  /** Small print under the button, e.g. expiry. */
  note?: string;
  footerLines?: string[];
  org?: { name: string; logoUrl?: string | null; accentColor?: string | null };
}

const DARK_BG = "#050505";
const CARD_BG = "#111111";
const BORDER = "#1f1f1f";
const MUTED = "#8a8a8a";
const TEXT = "#f5f5f5";
const DEFAULT_ACCENT = "#0bd2b5";
const HEADING_FONT = "'Barlow Condensed', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
const BODY_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function isHexColor(v: string | null | undefined): v is string {
  return !!v && /^#[0-9a-fA-F]{6}$/.test(v);
}

/** Pick black or white text for a given background hex (WCAG-ish luminance). */
function readableOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.35 ? "#000000" : "#ffffff";
}

export function renderBrandedEmail(input: BrandedEmailInput): { html: string; text: string } {
  const accent = isHexColor(input.org?.accentColor) ? input.org!.accentColor! : DEFAULT_ACCENT;
  const accentFg = readableOn(accent);
  const orgName = input.org?.name ? escapeHtml(input.org.name) : "";
  const logo = input.org?.logoUrl && /^https:\/\//.test(input.org.logoUrl)
    ? `<img src="${escapeHtml(input.org.logoUrl)}" alt="${orgName}" height="40" style="display:block;height:40px;width:auto;max-width:180px;border:0;" />`
    : `<span style="font-family:${HEADING_FONT};font-size:28px;font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:-0.5px;color:${TEXT};">${orgName || "Dalefy"}</span>`;

  const paragraphsHtml = input.paragraphs
    .map(p => `<p style="margin:0 0 16px;font-family:${BODY_FONT};font-size:15px;line-height:1.6;color:#cfcfcf;">${escapeHtml(p)}</p>`)
    .join("");

  const footer = (input.footerLines ?? [])
    .map(l => `<p style="margin:0 0 6px;font-family:${BODY_FONT};font-size:12px;line-height:1.5;color:${MUTED};">${escapeHtml(l)}</p>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${escapeHtml(input.heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,900&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background:${DARK_BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${DARK_BG};">${escapeHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${DARK_BG};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td style="padding:0 4px 20px;">${logo}</td>
        </tr>
        <tr>
          <td style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:16px;padding:36px 32px;">
            ${input.eyebrow ? `<p style="margin:0 0 10px;font-family:${BODY_FONT};font-size:11px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;color:${accent};">${escapeHtml(input.eyebrow)}</p>` : ""}
            <h1 style="margin:0 0 20px;font-family:${HEADING_FONT};font-size:34px;line-height:1.05;font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:-0.5px;color:${TEXT};">${escapeHtml(input.heading)}</h1>
            ${paragraphsHtml}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 12px;">
              <tr>
                <td style="background:${accent};border-radius:12px;">
                  <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:15px 28px;font-family:${BODY_FONT};font-size:13px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${accentFg};text-decoration:none;">${escapeHtml(input.cta.label)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 20px;font-family:${BODY_FONT};font-size:12px;line-height:1.5;color:${MUTED};">Button not working? Paste this link into your browser:<br /><a href="${escapeHtml(input.cta.url)}" style="color:${accent};word-break:break-all;">${escapeHtml(input.cta.url)}</a></p>
            ${input.note ? `<p style="margin:0;padding-top:16px;border-top:1px solid ${BORDER};font-family:${BODY_FONT};font-size:12px;line-height:1.5;color:${MUTED};">${escapeHtml(input.note)}</p>` : ""}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 8px 0;">${footer}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    input.heading,
    "",
    ...input.paragraphs,
    "",
    `${input.cta.label}: ${input.cta.url}`,
    "",
    input.note ?? "",
    "",
    ...(input.footerLines ?? []),
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim();

  return { html, text };
}
