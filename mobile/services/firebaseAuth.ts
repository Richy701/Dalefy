import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  EmailAuthProvider,
  linkWithCredential,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut as fbSignOut,
  signInAnonymously,
  onAuthStateChanged,
  type User as FbUser,
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { firebaseAuth, firebaseDb, isFirebaseConfigured } from "./firebase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MAGIC_LINK_EMAIL_KEY = "daf-magic-link-email";

export interface MobileUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  initials: string;
}

function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

async function upsertProfile(fbUser: FbUser, name?: string): Promise<MobileUser> {
  const existing = await fetchProfile(fbUser.uid);
  if (existing) return existing;

  const displayName = name ?? fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "Traveler";
  const profile: MobileUser = {
    id: fbUser.uid,
    name: displayName,
    email: fbUser.email ?? "",
    avatar: fbUser.photoURL ?? "",
    initials: initialsFrom(displayName),
  };

  await setDoc(doc(firebaseDb(), "profiles", fbUser.uid), {
    ...profile,
    role: "Traveler",
    status: "Active",
    created_at: new Date().toISOString(),
  });

  return profile;
}

const LINK_CONFLICT_CODES = new Set([
  "auth/credential-already-in-use",
  "auth/email-already-in-use",
  "auth/account-exists-with-different-credential",
]);

async function signInOrLink(credential: ReturnType<typeof GoogleAuthProvider.credential>): Promise<FbUser> {
  const currentUser = firebaseAuth().currentUser;
  if (currentUser?.isAnonymous) {
    try {
      const result = await linkWithCredential(currentUser, credential);
      return result.user;
    } catch (err: any) {
      if (LINK_CONFLICT_CODES.has(err?.code)) {
        const result = await signInWithCredential(firebaseAuth(), credential);
        return result.user;
      }
      throw err;
    }
  }
  const result = await signInWithCredential(firebaseAuth(), credential);
  return result.user;
}

// ── Sign Up ─────────────────────────────────────────────────────────────────

export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<{ user: MobileUser | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: "Not configured" };

  try {
    const { user: fbUser } = await createUserWithEmailAndPassword(
      firebaseAuth(),
      email,
      password,
    );
    const profile = await upsertProfile(fbUser, name);
    return { user: profile, error: null };
  } catch (err: unknown) {
    return { user: null, error: friendlyError(err) };
  }
}

// ── Sign In ─────────────────────────────────────────────────────────────────

export async function signIn(
  email: string,
  password: string,
): Promise<{ user: MobileUser | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: "Not configured" };

  try {
    const { user: fbUser } = await signInWithEmailAndPassword(
      firebaseAuth(),
      email,
      password,
    );
    const profile = await upsertProfile(fbUser);
    return { user: profile, error: null };
  } catch (err: unknown) {
    return { user: null, error: friendlyError(err) };
  }
}

// ── Google Sign In ──────────────────────────────────────────────────────────

export async function signInWithGoogle(
  idToken: string,
): Promise<{ user: MobileUser | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: "Not configured" };

  try {
    const credential = GoogleAuthProvider.credential(idToken);
    const fbUser = await signInOrLink(credential);
    const profile = await upsertProfile(fbUser);
    return { user: profile, error: null };
  } catch (err: unknown) {
    return { user: null, error: friendlyError(err) };
  }
}

// ── Apple Sign In ───────────────────────────────────────────────────────────

export async function signInWithApple(
  idToken: string,
  nonce: string,
): Promise<{ user: MobileUser | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: "Not configured" };
  if (!idToken) return { user: null, error: "Apple Sign-In failed - no identity token" };

  try {
    const provider = new OAuthProvider("apple.com");
    const credential = provider.credential({ idToken, rawNonce: nonce });
    const result = await signInWithCredential(firebaseAuth(), credential);
    const profile = await upsertProfile(result.user);
    return { user: profile, error: null };
  } catch (err: any) {
    const code = err?.code ?? "unknown";
    console.error("[Apple Auth]", code, err?.message);
    return { user: null, error: `Apple auth failed (${code})`  };
  }
}

// ── Magic Link ──────────────────────────────────────────────────────────────

export async function sendMagicLink(
  email: string,
  appUrl: string,
): Promise<{ error: string | null }> {
  if (!isFirebaseConfigured()) return { error: "Not configured" };

  try {
    await sendSignInLinkToEmail(firebaseAuth(), email, {
      url: `${appUrl}/auth-callback`,
      handleCodeInApp: true,
      iOS: { bundleId: "com.dafadventures.app" },
      android: { packageName: "com.dafadventures.app", installApp: false },
    });
    await AsyncStorage.setItem(MAGIC_LINK_EMAIL_KEY, email);
    return { error: null };
  } catch (err: unknown) {
    return { error: friendlyError(err) };
  }
}

export async function handleMagicLinkReturn(
  url: string,
): Promise<{ user: MobileUser | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: "Not configured" };

  try {
    if (!isSignInWithEmailLink(firebaseAuth(), url)) {
      return { user: null, error: "Invalid link" };
    }

    const email = await AsyncStorage.getItem(MAGIC_LINK_EMAIL_KEY);
    if (!email) return { user: null, error: "Email not found - please try again" };

    const currentUser = firebaseAuth().currentUser;
    let fbUser: FbUser;

    if (currentUser?.isAnonymous) {
      const credential = EmailAuthProvider.credentialWithLink(email, url);
      const result = await linkWithCredential(currentUser, credential);
      fbUser = result.user;
    } else {
      const result = await signInWithEmailLink(firebaseAuth(), email, url);
      fbUser = result.user;
    }

    await AsyncStorage.removeItem(MAGIC_LINK_EMAIL_KEY);
    const profile = await upsertProfile(fbUser);
    return { user: profile, error: null };
  } catch (err: unknown) {
    return { user: null, error: friendlyError(err) };
  }
}

// ── Account Upgrade (anonymous → real) ──────────────────────────────────────

export async function upgradeWithEmail(
  email: string,
  password: string,
  name: string,
): Promise<{ user: MobileUser | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: "Not configured" };

  try {
    const currentUser = firebaseAuth().currentUser;
    if (!currentUser?.isAnonymous) return { user: null, error: "Not an anonymous account" };

    const credential = EmailAuthProvider.credential(email, password);
    let fbUser: FbUser;
    try {
      const result = await linkWithCredential(currentUser, credential);
      fbUser = result.user;
    } catch (linkErr: any) {
      if (linkErr?.code === "auth/credential-already-in-use" || linkErr?.code === "auth/email-already-in-use") {
        const result = await signInWithCredential(firebaseAuth(), credential);
        fbUser = result.user;
      } else {
        throw linkErr;
      }
    }
    const profile = await upsertProfile(fbUser, name);
    return { user: profile, error: null };
  } catch (err: unknown) {
    return { user: null, error: friendlyError(err) };
  }
}

// ── Sign Out ────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await fbSignOut(firebaseAuth());
  // Fall back to anonymous so Firestore reads still work
  await signInAnonymously(firebaseAuth()).catch(() => {});
}

// ── Password Reset ──────────────────────────────────────────────────────────

export async function resetPassword(
  email: string,
): Promise<{ error: string | null }> {
  if (!isFirebaseConfigured()) return { error: "Not configured" };

  try {
    await sendPasswordResetEmail(firebaseAuth(), email);
    return { error: null };
  } catch (err: unknown) {
    return { error: friendlyError(err) };
  }
}

// ── Profile CRUD ────────────────────────────────────────────────────────────

export async function fetchProfile(uid: string): Promise<MobileUser | null> {
  if (!isFirebaseConfigured()) return null;

  try {
    const snap = await getDoc(doc(firebaseDb(), "profiles", uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      id: snap.id,
      name: d.name ?? "",
      email: d.email ?? "",
      avatar: d.avatar ?? "",
      initials: d.initials ?? initialsFrom(d.name ?? ""),
    };
  } catch {
    return null;
  }
}

export async function updateProfile(
  uid: string,
  patch: Partial<Pick<MobileUser, "name" | "email" | "avatar">>,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const updates: Record<string, unknown> = { ...patch };
  if (patch.name) updates.initials = initialsFrom(patch.name);
  await updateDoc(doc(firebaseDb(), "profiles", uid), updates);
}

// ── Auth State Listener ─────────────────────────────────────────────────────

export function onAuthStateChange(
  cb: (user: FbUser | null) => void,
): () => void {
  if (!isFirebaseConfigured()) return () => {};
  return onAuthStateChanged(firebaseAuth(), cb);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function friendlyError(err: unknown): string {
  const code = (err as { code?: string }).code ?? "";
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists";
    case "auth/invalid-email":
      return "Invalid email address";
    case "auth/weak-password":
      return "Password must be at least 6 characters";
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Invalid email or password";
    case "auth/invalid-credential":
      return "Sign-in failed - invalid credential";
    case "auth/too-many-requests":
      return "Too many attempts - try again later";
    case "auth/credential-already-in-use":
      return "This account is already linked to another user";
    case "auth/account-exists-with-different-credential":
      return "An account with this email already exists - try a different sign-in method";
    case "auth/network-request-failed":
      return "Network error - check your connection";
    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled";
    default:
      return err instanceof Error
        ? `${err.message.replace("Firebase: ", "")} (${code || "unknown"})`
        : "Something went wrong";
  }
}
