import { signInWithCustomToken } from "firebase/auth";
import { firebaseAuth, isFirebaseConfigured } from "./firebase";
import { STORAGE } from "@/config/storageKeys";

/**
 * "Sign in as": an owner or admin using the app as a teammate with a lower role, for up to an hour
 * (api/impersonate.ts). The session's ID token is the real record; the rules keep it inside one team.
 */
export interface Impersonation {
  /** Who opened it, so they can switch back */
  byUid: string;
  byName: string;
  /** The one team it reaches */
  orgId: string;
  /** When it ends, in ms */
  until: number;
}

function parse(v: Record<string, unknown> | null): Impersonation | null {
  if (!v || typeof v.byUid !== "string" || !v.byUid || typeof v.orgId !== "string") return null;
  return { byUid: v.byUid, byName: typeof v.byName === "string" ? v.byName : "", orgId: v.orgId, until: Number(v.until) || 0 };
}

/** Kept beside the session so the first render after switching already knows, before the token is read */
export function storedImpersonation(): Impersonation | null {
  try { return parse(JSON.parse(localStorage.getItem(STORAGE.IMPERSONATION) ?? "null")); } catch { return null; }
}

export function rememberImpersonation(value: Impersonation | null) {
  try {
    if (value) localStorage.setItem(STORAGE.IMPERSONATION, JSON.stringify(value));
    else localStorage.removeItem(STORAGE.IMPERSONATION);
  } catch { /* storage unavailable */ }
}

/** What the signed-in session's ID token says, or null for a normal session */
export async function tokenImpersonation(): Promise<Impersonation | null> {
  if (!isFirebaseConfigured()) return null;
  // On a fresh load the session is still being restored; reading too early would look like "not signed in as anyone"
  const auth = firebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return null;
  const { claims } = await user.getIdTokenResult();
  return parse({ byUid: claims.imp_by, byName: claims.imp_by_name, orgId: claims.imp_org, until: claims.imp_until });
}

/** Swap this browser's session for the one in a custom token from /api/impersonate */
export async function signInWithSwitchToken(token: string) {
  const { user } = await signInWithCustomToken(firebaseAuth(), token);
  return user;
}
