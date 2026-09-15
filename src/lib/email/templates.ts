/**
 * Transactional emails rendered on the shared shell. Dependency-free: used by
 * `api/` for delivery and by `src/` for previews.
 */

import {
  renderEmailShell, paragraph, escapeHtml, listCard, pinLine, PALETTE,
  type EmailBrand,
} from "./layout.js";

export interface RenderedEmail { subject: string; html: string; text: string }

export const DALEFY_BRAND: EmailBrand = {
  brandName: "Dalefy",
  platformName: "Dalefy",
  accentColor: PALETTE.accent,
};

function expiryLine(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function linkFallback(url: string, ttl: string): { html: string; text: string } {
  return {
    html: `<p style="margin:12px 0 0;font-size:12px;color:${PALETTE.muted};line-height:1.5;">${escapeHtml(ttl)}<br />Button not working? <a href="${escapeHtml(url)}" style="color:${PALETTE.muted};word-break:break-all;">Open the secure link</a></p>`,
    text: ttl,
  };
}

const ROLE_COPY: Record<string, string> = {
  admin: "Admins can manage trips, travellers and the team.",
  agent: "Agents can build and edit trips and send itineraries.",
  viewer: "Viewers can see every trip but can't make changes.",
};

// ── Team invite ─────────────────────────────────────────────────────────────

export function inviteEmail(input: {
  brand?: EmailBrand;
  inviterName: string;
  orgName: string;
  role: string;
  acceptUrl: string;
  expiresAt: string;
}): RenderedEmail {
  const brand = input.brand ?? DALEFY_BRAND;
  const inviter = input.inviterName.trim();
  const who = inviter ? `${inviter} has invited you` : "You've been invited";
  const expires = expiryLine(input.expiresAt);
  const roleCopy = ROLE_COPY[input.role] ?? "";

  const bodyHtml =
    paragraph(`${escapeHtml(who)} to join <strong style="color:${PALETTE.ink};">${escapeHtml(input.orgName)}</strong> on ${escapeHtml(brand.platformName)} as ${escapeHtml(article(input.role))} <strong style="color:${PALETTE.ink};">${escapeHtml(input.role)}</strong>.`) +
    (roleCopy ? paragraph(escapeHtml(roleCopy)) : "") +
    paragraph(`Tap the button to sign in. There's no password to set, the link signs you in on its own.`);
  const bodyText = [
    `${who} to join ${input.orgName} on ${brand.platformName} as ${article(input.role)} ${input.role}.`,
    roleCopy,
    "Open the link below to sign in. There's no password to set.",
  ].filter(Boolean).join("\n\n");

  const fb = linkFallback(input.acceptUrl, expires ? `This invitation expires on ${expires}.` : "");
  const { html, text } = renderEmailShell({
    brand,
    preheader: `${who} to join ${input.orgName}`,
    eyebrow: "Team invitation",
    title: `Join ${input.orgName}`,
    subtitle: inviter ? `Invited by ${inviter}` : null,
    bodyHtml, bodyText,
    cta: { label: "Accept invitation", url: input.acceptUrl },
    ctaNoteHtml: fb.html, ctaNoteText: fb.text,
    footerText: `Sent by ${brand.platformName} on behalf of ${input.orgName}. If you weren't expecting this, you can ignore it.`,
  });
  return { subject: `${inviter || input.orgName} invited you to ${input.orgName} on ${brand.platformName}`, html, text };
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

// ── Verify email ────────────────────────────────────────────────────────────

export function verifyEmail(input: { name?: string | null; verifyUrl: string }): RenderedEmail {
  const brand = DALEFY_BRAND;
  const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi,";
  const bodyHtml =
    paragraph(escapeHtml(greeting)) +
    paragraph(`Confirm this is your address and you're all set. Verified accounts can accept team invitations and send itineraries.`);
  const bodyText = `${greeting}\n\nConfirm this is your address and you're all set. Verified accounts can accept team invitations and send itineraries.`;
  const fb = linkFallback(input.verifyUrl, "This link expires in 24 hours.");
  const { html, text } = renderEmailShell({
    brand,
    preheader: "Confirm your email to finish setting up Dalefy",
    eyebrow: "Account",
    title: "Verify your email",
    bodyHtml, bodyText,
    cta: { label: "Verify email", url: input.verifyUrl },
    ctaNoteHtml: fb.html, ctaNoteText: fb.text,
    footerText: `Sent by ${brand.platformName}. If you didn't create an account, you can ignore this.`,
  });
  return { subject: "Verify your email for Dalefy", html, text };
}

// ── Password reset ──────────────────────────────────────────────────────────

export function resetPasswordEmail(input: { resetUrl: string }): RenderedEmail {
  const brand = DALEFY_BRAND;
  const bodyHtml =
    paragraph(`We received a request to reset the password for this address. Choose a new one with the button below.`) +
    paragraph(`If you didn't ask for this, your password is unchanged and you can ignore this email.`);
  const bodyText = "We received a request to reset the password for this address. Choose a new one with the link below.\n\nIf you didn't ask for this, your password is unchanged and you can ignore this email.";
  const fb = linkFallback(input.resetUrl, "This link expires in 1 hour.");
  const { html, text } = renderEmailShell({
    brand,
    preheader: "Choose a new password for your Dalefy account",
    eyebrow: "Account",
    title: "Reset your password",
    bodyHtml, bodyText,
    cta: { label: "Choose a new password", url: input.resetUrl },
    ctaNoteHtml: fb.html, ctaNoteText: fb.text,
    footerText: `Sent by ${brand.platformName}.`,
  });
  return { subject: "Reset your Dalefy password", html, text };
}

// ── Magic link (mobile sign-in) ─────────────────────────────────────────────

export function magicLinkEmail(input: { signInUrl: string }): RenderedEmail {
  const brand = DALEFY_BRAND;
  const bodyHtml =
    paragraph(`Tap the button on the phone you signed in from and you'll be taken straight into the app.`) +
    paragraph(`If you didn't request this, you can ignore it. Keep this link private.`);
  const bodyText = "Open the link below on the phone you signed in from and you'll be taken straight into the app.\n\nIf you didn't request this, you can ignore it.";
  const fb = linkFallback(input.signInUrl, "This link expires in 1 hour and works once.");
  const { html, text } = renderEmailShell({
    brand,
    preheader: "Your one-tap sign-in link for Dalefy",
    eyebrow: "Sign in",
    title: "Your sign-in link",
    bodyHtml, bodyText,
    cta: { label: "Sign in to Dalefy", url: input.signInUrl },
    ctaNoteHtml: fb.html, ctaNoteText: fb.text,
    footerText: `Sent by ${brand.platformName}.`,
  });
  return { subject: "Your Dalefy sign-in link", html, text };
}

// ── Itinerary updated ───────────────────────────────────────────────────────

export function tripUpdatedEmail(input: {
  brand: EmailBrand;
  tripName: string;
  destination?: string | null;
  image?: string | null;
  changes: string[];
  shareUrl: string;
  shortCode?: string | null;
}): RenderedEmail {
  const brand = input.brand;
  const changes = input.changes.map(c => c.trim()).filter(Boolean).slice(0, 12);
  const list = listCard(changes);
  const introduction = changes.length ? `${brand.brandName} has updated your itinerary. Here's what changed:` : `${brand.brandName} has updated your itinerary. Open it below to review the latest details.`;
  const bodyHtml = paragraph(escapeHtml(introduction)) + (changes.length ? list.html : "");
  const bodyText = `${introduction}\n\n${list.text}`;
  const pin = input.shortCode ? pinLine(brand.platformName, input.shortCode) : null;
  const note = {
    html: `<p style="margin:12px 0 0;font-size:12px;color:${PALETTE.muted};line-height:1.5;">Your itinerary is live, so this link always shows the latest version.</p>${pin?.html ?? ""}`,
    text: ["Your itinerary is live, so this link always shows the latest version.", pin?.text].filter(Boolean).join("\n"),
  };
  const { html, text } = renderEmailShell({
    brand,
    preheader: changes[0] ?? `${input.tripName} has been updated`,
    eyebrow: "Itinerary update",
    title: input.tripName,
    subtitle: input.destination ?? null,
    image: input.image ?? null,
    bodyHtml, bodyText,
    cta: { label: "View updated itinerary", url: input.shareUrl },
    ctaNoteHtml: note.html, ctaNoteText: note.text,
    footerText: `Sent by ${brand.brandName} using ${brand.platformName}.`,
  });
  return { subject: `Updated itinerary: ${input.tripName}`, html, text };
}
