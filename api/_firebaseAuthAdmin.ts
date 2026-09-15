/**
 * Mints Firebase Auth action links (sign-in, verification, password reset)
 * that we then deliver through our own email templates. Talks to the
 * Identity Toolkit REST API directly; no firebase-admin dependency.
 *
 * Credentials are keyless: on Vercel the function's OIDC identity token is
 * exchanged with Google STS for a short-lived token that impersonates the
 * Firebase Admin service account (Workload Identity Federation). Requires
 *   GCP_WIF_AUDIENCE    //iam.googleapis.com/projects/<num>/locations/global/workloadIdentityPools/<pool>/providers/<provider>
 *   GCP_SERVICE_ACCOUNT firebase-adminsdk-...@<project>.iam.gserviceaccount.com
 *
 * FIREBASE_SERVICE_ACCOUNT (service-account JSON, raw or base64) is honoured
 * as a fallback for environments without an OIDC token.
 */

import type { AuthClient } from "google-auth-library";

const env = (k: string) => (process.env[k] ?? "").trim();
const PROJECT_ID = env("VITE_FIREBASE_PROJECT_ID") || "dalefy-d87c9";
const SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

export interface ActionCodeSettings {
  url: string;
  handleCodeInApp?: boolean;
}

export type LinkResult = { ok: true; url: string } | { ok: false; error: string; code?: string };

let clientPromise: Promise<AuthClient | null> | null = null;

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

async function buildClient(): Promise<AuthClient | null> {
  const { ExternalAccountClient, GoogleAuth } = await import("google-auth-library");
  if (federationConfigured()) {
    const { getVercelOidcToken } = await import("@vercel/oidc");
    const client = ExternalAccountClient.fromJSON({
      type: "external_account",
      audience: env("GCP_WIF_AUDIENCE"),
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env("GCP_SERVICE_ACCOUNT")}:generateAccessToken`,
      subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
    });
    if (client) {
      client.scopes = SCOPES;
      return client;
    }
  }
  const sa = readServiceAccount();
  if (!sa) return null;
  return new GoogleAuth({ credentials: sa, scopes: SCOPES }).getClient();
}

function getClient(): Promise<AuthClient | null> {
  if (!clientPromise) clientPromise = buildClient().catch(err => { clientPromise = null; throw err; });
  return clientPromise;
}

type RequestType = "EMAIL_SIGNIN" | "VERIFY_EMAIL" | "PASSWORD_RESET";

async function mintLink(requestType: RequestType, email: string, settings?: ActionCodeSettings): Promise<LinkResult> {
  let client: AuthClient | null;
  try {
    client = await getClient();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Credential setup failed", code: "credential" };
  }
  if (!client) return { ok: false, error: "Auth emails aren't set up yet. Configure GCP_WIF_AUDIENCE and GCP_SERVICE_ACCOUNT.", code: "not-configured" };

  try {
    const { token } = await client.getAccessToken();
    if (!token) return { ok: false, error: "Token exchange returned no access token", code: "credential" };

    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:sendOobCode`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType,
        email,
        returnOobLink: true,
        ...(settings?.url ? { continueUrl: settings.url } : {}),
        ...(settings?.handleCodeInApp ? { canHandleCodeInApp: true } : {}),
      }),
    });
    const data = await resp.json().catch(() => ({})) as { oobLink?: string; error?: { message?: string; status?: string } };
    if (!resp.ok || !data.oobLink) {
      const message = data.error?.message ?? `Identity Toolkit ${resp.status}`;
      const code = /EMAIL_NOT_FOUND/.test(message) ? "auth/user-not-found"
        : /TOO_MANY_ATTEMPTS|QUOTA/.test(message) ? "auth/too-many-requests"
        : `identitytoolkit/${message.split(/\s/)[0]}`;
      return { ok: false, error: message, code };
    }
    return { ok: true, url: data.oobLink };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't create link", code: "request" };
  }
}

export function generateSignInLink(email: string, settings: ActionCodeSettings): Promise<LinkResult> {
  return mintLink("EMAIL_SIGNIN", email, settings);
}

export function generateVerificationLink(email: string, settings?: ActionCodeSettings): Promise<LinkResult> {
  return mintLink("VERIFY_EMAIL", email, settings);
}

export function generatePasswordResetLink(email: string, settings?: ActionCodeSettings): Promise<LinkResult> {
  return mintLink("PASSWORD_RESET", email, settings);
}
