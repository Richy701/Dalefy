import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || "dalefy-d87c9";

const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

export async function verifyFirebaseToken(
  token: string,
): Promise<JWTPayload | null> {
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
