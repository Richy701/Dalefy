import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || "dalefy-d87c9";

const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

/** A "Sign in as" session (api/impersonate.ts): who opened it, the one team it reaches, when it ends (ms), its log entry */
export interface Impersonation {
  by: string;
  org: string;
  until: number;
  logId: string;
}

export function impersonationOf(payload: JWTPayload | null): Impersonation | null {
  if (!payload || typeof payload.imp_by !== "string" || !payload.imp_by) return null;
  return {
    by: payload.imp_by,
    org: typeof payload.imp_org === "string" ? payload.imp_org : "",
    until: typeof payload.imp_until === "number" ? payload.imp_until : 0,
    logId: typeof payload.imp_id === "string" ? payload.imp_id : "",
  };
}

async function verifySignature(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    if (!payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * The verified claims of a Firebase ID token, or null. "Sign in as" sessions are refused once they
 * run out, and everywhere that doesn't opt in; endpoints that do must keep them inside their team.
 */
export async function verifyFirebaseToken(
  token: string,
  opts: { allowImpersonation?: boolean } = {},
): Promise<JWTPayload | null> {
  const payload = await verifySignature(token);
  const imp = impersonationOf(payload);
  if (imp && (!opts.allowImpersonation || imp.until <= Date.now())) return null;
  return payload;
}

/** A "Sign in as" session, ended or not, so the browser holding it can switch back to its own account */
export async function verifyImpersonationToken(token: string): Promise<{ payload: JWTPayload; imp: Impersonation } | null> {
  const payload = await verifySignature(token);
  const imp = impersonationOf(payload);
  return payload && imp ? { payload, imp } : null;
}
