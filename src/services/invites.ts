import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { firebaseDb, firebaseAuth } from "./firebase";
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

export async function sendInvite(params: {
  email: string;
  role: "admin" | "agent" | "viewer";
  orgId: string;
  orgName: string;
  inviterName: string;
}): Promise<{ ok: boolean; acceptUrl?: string; emailSent?: boolean; error?: string }> {
  const idToken = await firebaseAuth().currentUser?.getIdToken().catch(() => null);
  if (!idToken) return { ok: false, error: "Not authenticated" };

  const res = await fetch("/api/send-invite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error || `Request failed (${res.status})` };
  }

  return res.json();
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

export async function acceptInvite(token: string): Promise<{ orgId: string; orgName: string } | { error: string }> {
  const inviteRef = doc(firebaseDb(), "org_invites", token);
  const inviteSnap = await getDoc(inviteRef);

  if (!inviteSnap.exists()) return { error: "Invite not found" };

  const data = inviteSnap.data();

  if (data.status !== "pending") return { error: "This invite has already been used" };

  if (new Date(data.expires_at) < new Date()) {
    return { error: "This invitation has expired" };
  }

  const auth = firebaseAuth();
  const user = auth.currentUser;
  if (!user) return { error: "Please sign in first" };

  if (user.email?.toLowerCase() !== data.email?.toLowerCase()) {
    return { error: "This invite was sent to a different email address" };
  }

  const orgId = data.organization_id;
  const role = data.role as OrgRole;

  const { setDoc } = await import("firebase/firestore");
  const memberId = `${user.uid}_${orgId}`;
  await setDoc(doc(firebaseDb(), "org_members", memberId), {
    organization_id: orgId,
    user_id: user.uid,
    role,
    invite_token: token,
    joined_at: new Date().toISOString(),
  });

  await updateDoc(doc(firebaseDb(), "profiles", user.uid), { current_org_id: orgId }).catch(() => {});
  await updateDoc(inviteRef, { status: "accepted", accepted_at: new Date().toISOString() });

  return { orgId, orgName: data.org_name };
}
