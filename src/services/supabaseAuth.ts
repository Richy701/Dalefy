import { supabase, isSupabaseConfigured } from "./supabase";
import type { User } from "@/types";

// ── Sign Up ─────────────────────────────────────────────────────────────────

export async function signUp(
  email: string,
  password: string,
  name: string,
  role: string,
): Promise<{ user: User | null; error: string | null }> {
  if (!isSupabaseConfigured()) return { user: null, error: "Supabase not configured" };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role },
    },
  });

  if (error) return { user: null, error: error.message };
  if (!data.user) return { user: null, error: "Signup failed" };

  // The trigger auto-creates the profile, but we upsert to ensure role/name are set
  const initials = initialsFrom(name);
  await supabase.from("profiles").upsert({
    id: data.user.id,
    name,
    email,
    role,
    initials,
    avatar: "",
    status: "Active",
  });

  return {
    user: {
      id: data.user.id,
      name,
      email,
      role,
      avatar: "",
      initials,
      status: "Active",
    },
    error: null,
  };
}

// ── Sign In ─────────────────────────────────────────────────────────────────

export async function signIn(
  email: string,
  password: string,
): Promise<{ user: User | null; error: string | null }> {
  if (!isSupabaseConfigured()) return { user: null, error: "Supabase not configured" };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { user: null, error: error.message };
  if (!data.user) return { user: null, error: "Sign in failed" };

  const profile = await fetchProfile(data.user.id);
  return { user: profile, error: null };
}

// ── Sign Out ────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await supabase.auth.signOut();
}

// ── Session ─────────────────────────────────────────────────────────────────

export async function getSession() {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback: (event: string, session: unknown) => void) {
  if (!isSupabaseConfigured()) return { unsubscribe: () => {} };
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}

// ── Profile CRUD ────────────────────────────────────────────────────────────

export async function fetchProfile(userId: string): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role,
    avatar: data.avatar ?? "",
    initials: data.initials ?? initialsFrom(data.name),
    status: (data.status as User["status"]) ?? "Active",
  };
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<User, "name" | "email" | "role" | "avatar" | "status">>,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const updates: Record<string, unknown> = { ...patch };
  if (patch.name) {
    updates.initials = initialsFrom(patch.name);
  }

  await supabase.from("profiles").update(updates).eq("id", userId);
}

// ── Password Reset ──────────────────────────────────────────────────────────

export async function resetPassword(email: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase not configured" };

  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error: error?.message ?? null };
}

export async function changePassword(newPassword: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase not configured" };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error?.message ?? null };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
