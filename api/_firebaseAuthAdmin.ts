/**
 * Firebase Admin auth, used only to mint action links (sign-in, verification,
 * password reset) that we then deliver through our own email templates.
 *
 * Requires FIREBASE_SERVICE_ACCOUNT: the service-account JSON, either raw or
 * base64-encoded. Without it, link generation reports "not configured" and the
 * callers fall back to a clear error rather than crashing.
 */

import type { App } from "firebase-admin/app";
import type { Auth, ActionCodeSettings } from "firebase-admin/auth";

let appPromise: Promise<App | null> | null = null;

function readServiceAccount(): Record<string, unknown> | null {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT ?? "").trim();
  if (!raw) return null;
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  try { return JSON.parse(json); } catch { return null; }
}

export function authAdminConfigured(): boolean {
  return readServiceAccount() !== null;
}

async function getApp(): Promise<App | null> {
  if (!appPromise) {
    appPromise = (async () => {
      const sa = readServiceAccount();
      if (!sa) return null;
      const { initializeApp, getApps, cert } = await import("firebase-admin/app");
      const existing = getApps();
      if (existing.length) return existing[0];
      return initializeApp({ credential: cert(sa as Parameters<typeof cert>[0]) });
    })();
  }
  return appPromise;
}

async function getAuthAdmin(): Promise<Auth | null> {
  const app = await getApp();
  if (!app) return null;
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(app);
}

export type LinkResult = { ok: true; url: string } | { ok: false; error: string; code?: string };

async function withAuth(fn: (auth: Auth) => Promise<string>): Promise<LinkResult> {
  const auth = await getAuthAdmin();
  if (!auth) return { ok: false, error: "Auth emails aren't set up yet. Add FIREBASE_SERVICE_ACCOUNT.", code: "not-configured" };
  try {
    return { ok: true, url: await fn(auth) };
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "";
    const message = err instanceof Error ? err.message : "Couldn't create link";
    return { ok: false, error: message, code };
  }
}

export function generateSignInLink(email: string, settings: ActionCodeSettings): Promise<LinkResult> {
  return withAuth(auth => auth.generateSignInWithEmailLink(email, settings));
}

export function generateVerificationLink(email: string, settings?: ActionCodeSettings): Promise<LinkResult> {
  return withAuth(auth => auth.generateEmailVerificationLink(email, settings));
}

export function generatePasswordResetLink(email: string, settings?: ActionCodeSettings): Promise<LinkResult> {
  return withAuth(auth => auth.generatePasswordResetLink(email, settings));
}
