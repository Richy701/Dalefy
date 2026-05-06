import { doc, updateDoc, deleteDoc, setDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { firebaseDb } from "./firebase";
import type { OrgRole } from "@/types";

export async function updateMemberRole(
  userId: string,
  orgId: string,
  newRole: OrgRole,
): Promise<void> {
  const memberId = `${userId}_${orgId}`;
  await updateDoc(doc(firebaseDb(), "org_members", memberId), { role: newRole });
}

export async function removeMember(userId: string, orgId: string): Promise<void> {
  const memberId = `${userId}_${orgId}`;
  await deleteDoc(doc(firebaseDb(), "org_members", memberId));
}

export async function transferOwnership(
  currentOwnerId: string,
  newOwnerId: string,
  orgId: string,
): Promise<void> {
  const currentMemberId = `${currentOwnerId}_${orgId}`;
  const newMemberId = `${newOwnerId}_${orgId}`;

  const newMemberDoc = await getDoc(doc(firebaseDb(), "org_members", newMemberId));
  if (!newMemberDoc.exists()) throw new Error("Target user is not a member of this org");

  await updateDoc(doc(firebaseDb(), "org_members", newMemberId), { role: "owner" });
  await updateDoc(doc(firebaseDb(), "org_members", currentMemberId), { role: "admin" });
}

export async function getMemberProfile(userId: string): Promise<{ name: string; email: string; initials: string } | null> {
  const profileDoc = await getDoc(doc(firebaseDb(), "profiles", userId));
  if (!profileDoc.exists()) return null;
  const data = profileDoc.data();
  return {
    name: data.name || data.display_name || "",
    email: data.email || "",
    initials: data.initials || (data.name || "?").slice(0, 2).toUpperCase(),
  };
}

export async function getOrgMembersWithProfiles(orgId: string): Promise<Array<{
  userId: string;
  role: OrgRole;
  joinedAt: string;
  name: string;
  email: string;
  initials: string;
}>> {
  const snap = await getDocs(
    query(collection(firebaseDb(), "org_members"), where("organization_id", "==", orgId)),
  );

  const members = await Promise.all(
    snap.docs.map(async d => {
      const data = d.data();
      const profile = await getMemberProfile(data.user_id).catch(() => null);
      return {
        userId: data.user_id as string,
        role: data.role as OrgRole,
        joinedAt: data.joined_at as string,
        name: profile?.name || "Team Member",
        email: profile?.email || "",
        initials: profile?.initials || data.user_id.slice(0, 2).toUpperCase(),
      };
    }),
  );

  const roleOrder: Record<string, number> = { owner: 0, admin: 1, agent: 2, viewer: 3 };
  return members.sort((a, b) => (roleOrder[a.role] ?? 4) - (roleOrder[b.role] ?? 4));
}
