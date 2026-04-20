import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { isSupabaseConfigured } from "@/services/supabase";

export function usePermissions() {
  const { user } = useAuth();
  const { orgRole, currentOrg } = useOrg();

  return useMemo(() => {
    const realAuth = isSupabaseConfigured() && user?.id !== "demo" && (user?.id?.length ?? 0) > 20;
    const inOrg = realAuth && !!currentOrg;
    const role = orgRole;

    return {
      /** Owner or admin — can manage org settings, invite members, edit branding */
      canManageOrg: inOrg && (role === "owner" || role === "admin"),
      /** Owner or admin — can edit company name, logo, accent color */
      canEditBranding: inOrg && (role === "owner" || role === "admin"),
      /** Owner or admin — can invite/remove members */
      canInviteMembers: inOrg && (role === "owner" || role === "admin"),
      /** Owner or admin — can delete trips */
      canDeleteTrip: inOrg && (role === "owner" || role === "admin"),
      /** All org members can create/edit trips */
      canManageTrips: inOrg,
      /** Only owner can manage billing */
      canManageBilling: inOrg && role === "owner",
      /** Whether this is a real authenticated user in an org */
      isOrgMember: inOrg,
      /** Current org role */
      role,
    };
  }, [user, orgRole, currentOrg]);
}
