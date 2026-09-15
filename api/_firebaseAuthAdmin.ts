/**
 * Firebase Admin auth, used only to mint action links (sign-in, verification,
 * password reset) that we then deliver through our own email templates.
 *
 * Credentials are keyless: on Vercel the function's OIDC identity token is
 * exchanged with Google STS for a short-lived token that impersonates the
 * Firebase Admin service account (Workload Identity Federation). Requires
 *   GCP_WIF_AUDIENCE   //iam.googleapis.com/projects/<num>/locations/global/workloadIdentityPools/<pool>/providers/<provider>
 *   GCP_SERVICE_ACCOUNT firebase-adminsdk-...@<project>.iam.gserviceaccount.com
 *
 * FIREBASE_SERVICE_ACCOUNT (service-account JSON, raw or base64) is honoured
 * as a fallback for environments without an OIDC token.
 */

import type { App, Credential } from "firebase-admin/app";
import type { Auth, ActionCodeSettings } from "firebase-admin/auth";

const env = (k: string) => (process.env[k] ?? "").trim();
const PROJECT_ID = env("VITE_FIREBASE_PROJECT_ID") || "dalefy-d87c9";

let appPromise: Promise<App | null> | null = null;

function readServiceAccount(): Record<string, unknown> | null {
  const raw = env("FIREBASE_SERVICE_ACCOUNT");
  if (!raw) return null;
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  try { return JSON.parse(json); } catch { return null; }
}

function federationConfigured(): boolean {
  return !!env("GCP_WIF_AUDIENCE") && !!env("GCP_SERVICE_ACCOUNT");
}

export function authAdminConfigured(): boolean {
  return federationConfigured() || readServiceAccount() !== null;
}

/** A firebase-admin Credential backed by Vercel OIDC -> Google STS -> service account impersonation. */
async function federatedCredential(): Promise<Credential | null> {
  if (!federationConfigured()) return null;
  const { ExternalAccountClient } = await import("google-auth-library");
  const { getVercelOidcToken } = await import("@vercel/oidc");
  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: env("GCP_WIF_AUDIENCE"),
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env("GCP_SERVICE_ACCOUNT")}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  });
  if (!client) return null;
  client.scopes = ["https://www.googleapis.com/auth/cloud-platform"];
  return {
    async getAccessToken() {
      const { token } = await client.getAccessToken();
      if (!token) throw new Error("STS token exchange returned no access token");
      const expiry = client.credentials.expiry_date ?? Date.now() + 3600_000;
      return { access_token: token, expires_in: Math.max(60, Math.floor((expiry - Date.now()) / 1000)) };
    },
  };
}

async function getApp(): Promise<App | null> {
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp, getApps, cert } = await import("firebase-admin/app");
      const existing = getApps();
      if (existing.length) return existing[0];
      const federated = await federatedCredential();
      if (federated) return initializeApp({ credential: federated, projectId: PROJECT_ID });
      const sa = readServiceAccount();
      if (!sa) return null;
      return initializeApp({ credential: cert(sa as Parameters<typeof cert>[0]), projectId: PROJECT_ID });
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
  if (!auth) return { ok: false, error: "Auth emails aren't set up yet. Configure GCP_WIF_AUDIENCE and GCP_SERVICE_ACCOUNT.", code: "not-configured" };
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
