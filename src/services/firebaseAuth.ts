import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as fbSignOut,
  onAuthStateChanged,
  updatePassword,
  isSignInWithEmailLink,
  signInWithEmailLink,
  type User as FbUser,
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { firebaseAuth, firebaseDb, isFirebaseConfigured, clearFirestoreCache } from "./firebase";
import { initialsFrom } from "@/lib/names";
import type { User } from "@/types";
import { apiFetch, ApiError } from "@/lib/api";

// ── Sign Up ─────────────────────────────────────────────────────────────────

export async function signUp(
  email: string,
  password: string,
  name: string,
  role: string,
): Promise<{ user: User | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: "Firebase not configured" };

  try {
    const { user: fbUser } = await createUserWithEmailAndPassword(firebaseAuth(), email, password);

    const initials = initialsFrom(name);
    const profile: User = {
      id: fbUser.uid,
      name,
      email,
      role,
      avatar: "",
      initials,
      status: "Active",
    };

    await setDoc(doc(firebaseDb(), "profiles", fbUser.uid), {
      ...profile,
      created_at: new Date().toISOString(),
    });

    fbUser.getIdToken().then(t => requestAuthEmail({ kind: "verify" }, t)).catch(() => {});

    return { user: profile, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Signup failed";
    return { user: null, error: msg.replace("Firebase: ", "") };
  }
}

// ── Email Verification ──────────────────────────────────────────────────────

/** Ask the server to send a branded auth email (verification, reset, sign-in link). */
async function requestAuthEmail(body: { kind: "verify" } | { kind: "reset"; email: string }, idToken?: string): Promise<{ error: string | null }> {
  try {
    await apiFetch("/api/auth-email", { method: "POST", body, auth: idToken });
    return { error: null };
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status !== 0) return { error: err.message };
    return { error: "Network error, please try again" };
  }
}

export async function resendVerificationEmail(): Promise<{ error: string | null }> {
  if (!isFirebaseConfigured()) return { error: "Firebase not configured" };
  const user = firebaseAuth().currentUser;
  if (!user) return { error: "Not signed in" };
  if (user.emailVerified) return { error: null };
  const idToken = await user.getIdToken().catch(() => null);
  if (!idToken) return { error: "Not signed in" };
  return requestAuthEmail({ kind: "verify" }, idToken);
}

export function isCurrentUserEmailVerified(): boolean {
  if (!isFirebaseConfigured()) return true;
  const user = firebaseAuth().currentUser;
  if (!user) return false;
  return user.emailVerified;
}

export async function reloadCurrentUser(): Promise<boolean> {
  if (!isFirebaseConfigured()) return true;
  const user = firebaseAuth().currentUser;
  if (!user) return false;
  await user.reload();
  return user.emailVerified;
}

// ── Sign In ─────────────────────────────────────────────────────────────────

export async function signIn(
  email: string,
  password: string,
): Promise<{ user: User | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: "Firebase not configured" };

  try {
    const { user: fbUser } = await signInWithEmailAndPassword(firebaseAuth(), email, password);
    clearNeedsPassword();
    let profile = await fetchProfile(fbUser.uid);
    if (!profile) {
      const name = fbUser.displayName ?? email.split("@")[0] ?? "User";
      profile = {
        id: fbUser.uid,
        name,
        email: fbUser.email ?? email,
        role: "Trip Manager",
        avatar: fbUser.photoURL ?? "",
        initials: initialsFrom(name),
        status: "Active",
      };
      await setDoc(doc(firebaseDb(), "profiles", fbUser.uid), {
        ...profile,
        created_at: new Date().toISOString(),
      });
    }
    return { user: profile, error: null };
  } catch (err: unknown) {
    return { user: null, error: signInErrorMessage(err) };
  }
}

/** Plain-English message for a password sign-in failure. */
function signInErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/user-not-found":
      return "That email and password don't match. If you joined by invitation you won't have a password, so use a sign-in link instead.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes, or use a sign-in link instead.";
    case "auth/user-disabled":
      return "This account has been disabled. Ask your team admin for help.";
    case "auth/network-request-failed":
      return "Couldn't reach the server. Check your connection and try again.";
  }
  const msg = err instanceof Error ? err.message : "Sign in failed";
  return msg.replace("Firebase: ", "");
}

// ── Google Sign In ──────────────────────────────────────────────────────────

async function upsertGoogleProfile(fbUser: FbUser): Promise<User> {
  let profile = await fetchProfile(fbUser.uid);
  if (!profile) {
    const name = fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "User";
    profile = {
      id: fbUser.uid,
      name,
      email: fbUser.email ?? "",
      role: "Trip Manager",
      avatar: fbUser.photoURL ?? "",
      initials: initialsFrom(name),
      status: "Active",
    };
    await setDoc(doc(firebaseDb(), "profiles", fbUser.uid), {
      ...profile,
      created_at: new Date().toISOString(),
    });
  }
  return profile;
}

export async function signInWithGoogle(): Promise<{ user: User | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: "Firebase not configured" };

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    let fbUser: FbUser;

    try {
      // Try popup first (works on desktop, some mobile)
      const result = await signInWithPopup(firebaseAuth(), provider);
      fbUser = result.user;
    } catch (popupErr: unknown) {
      const code = (popupErr as { code?: string }).code ?? "";
      // A cancellation must stop here, never launch another sign-in flow.
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return { user: null, error: "Google sign-in was cancelled. Select Continue with Google when you are ready." };
      }
      // Only a genuinely blocked popup needs the redirect fallback.
      if (
        code === "auth/popup-blocked"
      ) {
        await signInWithRedirect(firebaseAuth(), provider);
        // signInWithRedirect navigates away - result handled by handleRedirectResult()
        return { user: null, error: null };
      }
      throw popupErr;
    }

    clearNeedsPassword();
    const profile = await upsertGoogleProfile(fbUser);
    return { user: profile, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Google sign-in failed";
    return { user: null, error: msg.replace("Firebase: ", "") };
  }
}

// ── Email link (used for team invites: no password, email auto-verified) ───
// The link itself is minted and emailed server-side by /api/send-invite.

const SIGN_IN_EMAIL_KEY = "daf-sign-in-email";

/** Email a one-time sign-in link. With an invite token the link lands back on that invite. */
export async function sendSignInLink(email: string, inviteToken?: string): Promise<{ error: string | null }> {
  if (!isFirebaseConfigured()) return { error: "Firebase not configured" };
  const address = email.trim().toLowerCase();
  try { localStorage.setItem(SIGN_IN_EMAIL_KEY, address); } catch { /* storage unavailable */ }
  try {
    await apiFetch("/api/auth-email", { method: "POST", body: { kind: "magic-link", email: address, web: true, invite: inviteToken } });
    return { error: null };
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status !== 0) return { error: err.message };
    return { error: "Network error, please try again" };
  }
}

/** Address the last sign-in link was sent to from this browser. */
export function getSignInLinkEmail(): string | null {
  try { return localStorage.getItem(SIGN_IN_EMAIL_KEY); } catch { return null; }
}

export function isEmailSignInLink(url: string): boolean {
  if (!isFirebaseConfigured()) return false;
  try { return isSignInWithEmailLink(firebaseAuth(), url); } catch { return false; }
}

/** Complete a sign-in link for `email`; creates the profile if this is a new user. */
export async function completeEmailSignInLink(email: string, url: string): Promise<{ user: User | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: "Firebase not configured" };
  try {
    const result = await signInWithEmailLink(firebaseAuth(), email, url);
    markNeedsPassword();
    const profile = await upsertGoogleProfile(result.user);
    return { user: profile, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Sign-in link failed";
    return { user: null, error: msg.replace("Firebase: ", "") };
  }
}

/** Call on app init to complete any pending Google redirect sign-in */
export async function handleRedirectResult(): Promise<{ user: User | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: null };

  try {
    const result = await getRedirectResult(firebaseAuth());
    if (!result) return { user: null, error: null };
    clearNeedsPassword();

    const profile = await upsertGoogleProfile(result.user);
    return { user: profile, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Google sign-in failed";
    return { user: null, error: msg.replace("Firebase: ", "") };
  }
}

// ── Sign Out ────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  clearNeedsPassword();
  await fbSignOut(firebaseAuth());
  await clearFirestoreCache();
}

// ── Session ─────────────────────────────────────────────────────────────────

export async function getSession(): Promise<{ user: FbUser } | null> {
  if (!isFirebaseConfigured()) return null;
  const auth = firebaseAuth();
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user ? { user } : null);
    });
  });
}

export function onAuthStateChange(callback: (event: string, session: unknown) => void) {
  if (!isFirebaseConfigured()) return { unsubscribe: () => {} };

  const unsub = onAuthStateChanged(firebaseAuth(), (user) => {
    if (user) {
      callback("SIGNED_IN", { user });
    } else {
      callback("SIGNED_OUT", null);
    }
  });

  return { unsubscribe: unsub };
}

// ── Profile CRUD ────────────────────────────────────────────────────────────

export async function fetchProfile(userId: string): Promise<User | null> {
  if (!isFirebaseConfigured()) return null;

  try {
    const snap = await getDoc(doc(firebaseDb(), "profiles", userId));
    if (!snap.exists()) return null;

    const data = snap.data();
    return {
      id: snap.id,
      name: data.name,
      email: data.email,
      role: data.role,
      avatar: data.avatar ?? "",
      initials: data.initials ?? initialsFrom(data.name),
      status: (data.status as User["status"]) ?? "Active",
    };
  } catch {
    return null;
  }
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<User, "name" | "email" | "role" | "avatar" | "status">>,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const updates: Record<string, unknown> = { ...patch };
  if (patch.name) {
    updates.initials = initialsFrom(patch.name);
  }

  await updateDoc(doc(firebaseDb(), "profiles", userId), updates);
}

// ── Password ────────────────────────────────────────────────────────────────

/**
 * Set or change the signed-in user's password. Firebase only allows this soon
 * after sign-in; past that we email a set-password link instead (`emailed: true`).
 */
export async function changePassword(newPassword: string): Promise<{ error: string | null; emailed?: boolean }> {
  if (!isFirebaseConfigured()) return { error: "Firebase not configured" };

  const user = firebaseAuth().currentUser;
  if (!user) return { error: "Not signed in" };

  try {
    await updatePassword(user, newPassword);
    clearNeedsPassword();
    return { error: null };
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code ?? "";
    if (code === "auth/requires-recent-login" && user.email) {
      const { error } = await requestAuthEmail({ kind: "reset", email: user.email });
      return error ? { error } : { error: null, emailed: true };
    }
    if (code === "auth/weak-password" || code === "auth/password-does-not-meet-requirements") {
      return { error: "That password is too weak. Use at least 8 characters with a mix of letters and numbers." };
    }
    if (code === "auth/network-request-failed") return { error: "Couldn't reach the server. Check your connection and try again." };
    const msg = err instanceof Error ? err.message : "Couldn't update your password";
    return { error: msg.replace("Firebase: ", "") };
  }
}

/**
 * Whether the signed-in account can sign in with a password. Asks Identity
 * Toolkit about the user's own account. Google accounts count as having a
 * sign-in method; "unknown" means the check failed and nothing should block.
 */
export async function accountPasswordStatus(): Promise<"has-password" | "needs-password" | "unknown"> {
  if (!isFirebaseConfigured()) return "unknown";
  const user = firebaseAuth().currentUser;
  if (!user) return "unknown";
  try {
    const idToken = await user.getIdToken();
    const key = firebaseAuth().app.options.apiKey;
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key ?? "")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!r.ok) return "unknown";
    const data = (await r.json()) as { users?: Array<{ passwordUpdatedAt?: number; providerUserInfo?: Array<{ providerId?: string }> }> };
    const account = data.users?.[0];
    if (!account) return "unknown";
    if (account.passwordUpdatedAt) return "has-password";
    const federated = (account.providerUserInfo ?? []).some(p => p.providerId && p.providerId !== "password");
    return federated ? "has-password" : "needs-password";
  } catch {
    return "unknown";
  }
}

// Set when someone signs in with an emailed link, so the invite flow can make
// them choose a password before they join (shared department accounts need one).
const NEEDS_PASSWORD_KEY = "daf-needs-password";

export function markNeedsPassword(): void {
  try { localStorage.setItem(NEEDS_PASSWORD_KEY, "1"); } catch { /* storage unavailable */ }
}

export function needsPassword(): boolean {
  try { return localStorage.getItem(NEEDS_PASSWORD_KEY) === "1"; } catch { return false; }
}

export function clearNeedsPassword(): void {
  try { localStorage.removeItem(NEEDS_PASSWORD_KEY); } catch { /* storage unavailable */ }
}

/** Sends a reset link if an account exists. Always succeeds from the caller's view so addresses can't be probed. */
export async function resetPassword(email: string): Promise<{ error: string | null }> {
  if (!isFirebaseConfigured()) return { error: "Firebase not configured" };
  return requestAuthEmail({ kind: "reset", email: email.trim().toLowerCase() });
}
