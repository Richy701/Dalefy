import { collection, query, where, getDocs, doc, getDoc, updateDoc, writeBatch } from "firebase/firestore";
import { firebaseDb, firebaseAuth } from "./firebase";
import { sendInviteSignInLink } from "./firebaseAuth";
import { apiFetch, ApiError, getIdToken } from "@/lib/api";
import type { OrgRole } from "@/types";

export interface OrgInvite {
  id: string;
  email: string;
  role: "admin" | "agent" | "viewer";
  organizationId: string;
  orgName: string;
  invitedBy: string;
  inviterName: string;
  token: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  expiresAt: string;
}

export interface SendInviteResult {
  ok: boolean;
  inviteToken?: string;
  acceptUrl?: string;
  email?: string;
  role?: OrgInvite["role"];
  expiresAt?: string;
  emailSent?: boolean;
  emailError?: string;
  resent?: boolean;
  error?: string;
}

async function postInvite(body: Record<string, unknown>): Promise<SendInviteResult> {
  const idToken = await getIdToken();
  if (!idToken) return { ok: false, error: "Not authenticated" };

  try {
    return await apiFetch<SendInviteResult>("/api/send-invite", { method: "POST", body, auth: idToken });
  } catch (e) {
    if (e instanceof ApiError && e.status !== 0) return { ok: false, error: e.message };
    return { ok: false, error: "Network error, please try again" };
  }
}

/** Where the Firebase sign-in link lands: the app root with the invite token as a query param.
 *  AuthContext completes the sign-in on boot and forwards to /#/invite/<token>. */
function inviteContinueUrl(token: string): string {
  const base = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, "");
  return `${base}/?invite=${encodeURIComponent(token)}`;
}

/** Creates (or reuses) the invite server-side, then emails a Firebase sign-in link that lands on it. */
async function deliver(result: SendInviteResult): Promise<SendInviteResult> {
  if (!result.ok || !result.inviteToken || !result.email) return result;
  const { error } = await sendInviteSignInLink(result.email, inviteContinueUrl(result.inviteToken));
  return { ...result, emailSent: !error, emailError: error ?? undefined };
}

export async function sendInvite(params: {
  email: string;
  role: "admin" | "agent" | "viewer";
  orgId: string;
  inviterName: string;
}): Promise<SendInviteResult> {
  return deliver(await postInvite(params));
}

export async function resendInvite(params: { inviteToken: string; orgId: string; inviterName: string }): Promise<SendInviteResult> {
  return deliver(await postInvite({ resendToken: params.inviteToken, orgId: params.orgId, inviterName: params.inviterName }));
}

export async function fetchPendingInvites(orgId: string): Promise<OrgInvite[]> {
  const snap = await getDocs(
    query(
      collection(firebaseDb(), "org_invites"),
      where("organization_id", "==", orgId),
      where("status", "==", "pending"),
    ),
  );

  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      email: data.email,
      role: data.role,
      organizationId: data.organization_id,
      orgName: data.org_name,
      invitedBy: data.invited_by,
      inviterName: data.inviter_name,
      token: data.token,
      status: data.status,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
    };
  });
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await updateDoc(doc(firebaseDb(), "org_invites", inviteId), { status: "revoked" });
}

export interface InvitePreview {
  orgId: string;
  orgName: string;
  inviterName: string;
  role: OrgRole;
  email: string;
  expiresAt: string;
}

export type AcceptInviteResult =
  | { orgId: string; orgName: string; alreadyMember: boolean }
  | { error: string; code?: "not-found" | "used" | "expired" | "wrong-email" | "unverified" | "unauthenticated" };

/** Load an invite for preview. Throws FirebaseError (permission-denied) if the signed-in email doesn't match. */
export async function getInvitePreview(token: string): Promise<InvitePreview | { error: string; code: "not-found" | "used" | "expired" }> {
  const snap = await getDoc(doc(firebaseDb(), "org_invites", token));
  if (!snap.exists()) return { error: "Invite not found", code: "not-found" };
  const data = snap.data();
  if (data.status !== "pending") return { error: "This invite has already been used or was revoked", code: "used" };
  if (new Date(data.expires_at) < new Date()) return { error: "This invitation has expired", code: "expired" };
  return {
    orgId: data.organization_id,
    orgName: data.org_name,
    inviterName: data.inviter_name || "",
    role: data.role as OrgRole,
    email: data.email,
    expiresAt: data.expires_at,
  };
}

export async function acceptInvite(token: string): Promise<AcceptInviteResult> {
  const auth = firebaseAuth();
  const user = auth.currentUser;
  if (!user) return { error: "Please sign in first", code: "unauthenticated" };

  const db = firebaseDb();
  const inviteRef = doc(db, "org_invites", token);
  const inviteSnap = await getDoc(inviteRef);

  if (!inviteSnap.exists()) return { error: "Invite not found", code: "not-found" };
  const data = inviteSnap.data();
  if (data.status !== "pending") return { error: "This invite has already been used or was revoked", code: "used" };
  if (new Date(data.expires_at) < new Date()) return { error: "This invitation has expired", code: "expired" };

  if (user.email?.toLowerCase() !== data.email?.toLowerCase()) {
    return { error: `This invite was sent to ${data.email}. You're signed in as ${user.email ?? "a different account"}.`, code: "wrong-email" };
  }

  // Rules require a verified email; make sure the token we send reflects it.
  await user.reload().catch(() => {});
  if (!user.emailVerified) {
    return { error: "Verify your email address before accepting this invite", code: "unverified" };
  }
  await user.getIdToken(true).catch(() => {});

  const orgId: string = data.organization_id;
  const role = data.role as OrgRole;
  const memberRef = doc(db, "org_members", `${user.uid}_${orgId}`);
  const existing = await getDoc(memberRef);

  const batch = writeBatch(db);
  if (!existing.exists()) {
    batch.set(memberRef, {
      organization_id: orgId,
      user_id: user.uid,
      role,
      invite_token: token,
      joined_at: new Date().toISOString(),
    });
  }
  batch.update(inviteRef, { status: "accepted", accepted_at: new Date().toISOString() });
  batch.set(doc(db, "profiles", user.uid), { current_org_id: orgId }, { merge: true });
  await batch.commit();

  return { orgId, orgName: data.org_name, alreadyMember: existing.exists() };
}
