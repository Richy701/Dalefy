/**
 * Single outbound email path. Every handler that sends mail goes through here
 * so the sender identity, enablement check and error shape stay consistent.
 *
 * Requires RESEND_API_KEY plus RESEND_FROM_EMAIL on a domain verified in Resend.
 */

const env = (k: string) => (process.env[k] ?? "").trim();

export function emailEnabled(): boolean {
  return !!env("RESEND_API_KEY") && !!env("RESEND_FROM_EMAIL");
}

export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Display name for the From header; defaults to Dalefy. */
  fromName?: string;
}

export type SendEmailResult = { ok: true; id?: string } | { ok: false; error: string };

function safeName(name: string): string {
  return name.replace(/[<>"\r\n]/g, "").trim();
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!emailEnabled()) return { ok: false, error: "Email sending isn't set up yet. Add RESEND_FROM_EMAIL on a verified domain." };
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env("RESEND_API_KEY"));
    const fromName = safeName(input.fromName || "Dalefy") || "Dalefy";
    const toName = input.toName ? safeName(input.toName) : "";
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${env("RESEND_FROM_EMAIL")}>`,
      to: toName ? `${toName} <${input.to}>` : input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}
