import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  onAuthStateChanged,
  updatePassword,
  sendPasswordResetEmail,
  type User as FbUser,
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { firebaseAuth, firebaseDb, isFirebaseConfigured } from "./firebase";
import { initialsFrom } from "@/lib/names";
import type { User } from "@/types";

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

    // Create profile document
    await setDoc(doc(firebaseDb(), "profiles", fbUser.uid), {
      ...profile,
      created_at: new Date().toISOString(),
    });

    return { user: profile, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Signup failed";
    return { user: null, error: msg.replace("Firebase: ", "") };
  }
}

// ── Sign In ─────────────────────────────────────────────────────────────────

export async function signIn(
  email: string,
  password: string,
): Promise<{ user: User | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: "Firebase not configured" };

  try {
    const { user: fbUser } = await signInWithEmailAndPassword(firebaseAuth(), email, password);
    const profile = await fetchProfile(fbUser.uid);
    return { user: profile, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Sign in failed";
    return { user: null, error: msg.replace("Firebase: ", "") };
  }
}

// ── Google Sign In ──────────────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<{ user: User | null; error: string | null }> {
  if (!isFirebaseConfigured()) return { user: null, error: "Firebase not configured" };

  try {
    const provider = new GoogleAuthProvider();
    const { user: fbUser } = await signInWithPopup(firebaseAuth(), provider);

    // Check if profile exists, create one if not
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

    return { user: profile, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Google sign-in failed";
    return { user: null, error: msg.replace("Firebase: ", "") };
  }
}

// ── Sign Out ────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await fbSignOut(firebaseAuth());
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

export async function resetPassword(email: string): Promise<{ error: string | null }> {
  if (!isFirebaseConfigured()) return { error: "Firebase not configured" };

  try {
    await sendPasswordResetEmail(firebaseAuth(), email);
    return { error: null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function changePassword(newPassword: string): Promise<{ error: string | null }> {
  if (!isFirebaseConfigured()) return { error: "Firebase not configured" };

  const user = firebaseAuth().currentUser;
  if (!user) return { error: "Not signed in" };

  try {
    await updatePassword(user, newPassword);
    return { error: null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed" };
  }
}
