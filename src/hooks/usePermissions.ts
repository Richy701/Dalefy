import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { isFirebaseConfigured } from "@/services/firebase";

export function usePermissions() {
  const { user } = useAuth();
  const { orgRole, currentOrg } = useOrg();

  return useMemo(() => {
    const realAuth = isFirebaseConfigured() && user?.id !== "demo" && (user?.id?.length ?? 0) > 20;
    const inOrg = realAuth && !!currentOrg;
    const role = orgRole;

    return {
      canManageOrg: inOrg && (role === "owner" || role === "admin"),
      canEditBranding: inOrg && (role === "owner" || role === "admin"),
      canInviteMembers: inOrg && (role === "owner" || role === "admin"),
      canDeleteTrip: inOrg && (role === "owner" || role === "admin"),
      canEditTrips: inOrg && role !== "viewer",
      canManageTrips: inOrg && role !== "viewer",
      canManageBilling: inOrg && role === "owner",
      isOrgMember: inOrg,
      isViewer: inOrg && role === "viewer",
      role,
    };
  }, [user, orgRole, currentOrg]);
}
