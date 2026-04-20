import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase, isSupabaseConfigured } from "@/services/supabase";
import { useAuth } from "@/context/AuthContext";
import type { Organization, OrgMember, OrgRole } from "@/types";

interface OrgContextType {
  currentOrg: Organization | null;
  orgRole: OrgRole | null;
  orgMembers: OrgMember[];
  isLoading: boolean;
  hasOrg: boolean;
  createOrg: (name: string) => Promise<{ org: Organization | null; error: string | null }>;
}

const OrgContext = createContext<OrgContextType>({
  currentOrg: null,
  orgRole: null,
  orgMembers: [],
  isLoading: true,
  hasOrg: false,
  createOrg: async () => ({ org: null, error: "Not initialized" }),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "org";
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [orgRole, setOrgRole] = useState<OrgRole | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const useSupabase = isSupabaseConfigured();
  const isRealUser = useSupabase && isAuthenticated && user?.id !== "demo" && (user?.id?.length ?? 0) > 20;

  // ── Load org on auth change ───────────────────────────────────────────

  useEffect(() => {
    if (!isRealUser || !user) {
      setCurrentOrg(null);
      setOrgRole(null);
      setOrgMembers([]);
      setIsLoading(false);
      return;
    }

    let mounted = true;

    async function loadOrg() {
      // Fetch user's org memberships
      const { data: memberships, error } = await supabase
        .from("org_members")
        .select("*, organizations(*)")
        .eq("user_id", user!.id);

      if (error || !memberships?.length) {
        if (mounted) {
          setCurrentOrg(null);
          setOrgRole(null);
          setOrgMembers([]);
          setIsLoading(false);
        }
        return;
      }

      // Pick current org: use profile.current_org_id if set, else first membership
      const { data: profile } = await supabase
        .from("profiles")
        .select("current_org_id")
        .eq("id", user!.id)
        .maybeSingle();

      const preferredOrgId = profile?.current_org_id;
      const membership = memberships.find(m => m.organization_id === preferredOrgId) ?? memberships[0];
      const orgData = membership.organizations as Record<string, unknown>;

      if (mounted) {
        setCurrentOrg({
          id: orgData.id as string,
          name: orgData.name as string,
          slug: orgData.slug as string,
          createdBy: orgData.created_by as string,
        });
        setOrgRole(membership.role as OrgRole);

        // Fetch all members of this org
        const { data: members } = await supabase
          .from("org_members")
          .select("*")
          .eq("organization_id", membership.organization_id);

        if (members && mounted) {
          setOrgMembers(members.map(m => ({
            id: m.id,
            organizationId: m.organization_id,
            userId: m.user_id,
            role: m.role as OrgRole,
            joinedAt: m.joined_at,
          })));
        }
        setIsLoading(false);
      }
    }

    loadOrg();
    return () => { mounted = false; };
  }, [isRealUser, user?.id]);

  // ── Create organization ───────────────────────────────────────────────

  const createOrg = useCallback(async (name: string): Promise<{ org: Organization | null; error: string | null }> => {
    if (!isRealUser || !user) return { org: null, error: "Not authenticated" };

    const slug = slugify(name) + "-" + Math.random().toString(36).slice(2, 6);

    // Insert org
    const { data: orgData, error: orgError } = await supabase
      .from("organizations")
      .insert({ name, slug, created_by: user.id })
      .select()
      .single();

    if (orgError || !orgData) return { org: null, error: orgError?.message ?? "Failed to create organization" };

    // Insert user as owner
    const { error: memberError } = await supabase
      .from("org_members")
      .insert({ organization_id: orgData.id, user_id: user.id, role: "owner" });

    if (memberError) return { org: null, error: memberError.message };

    // Set as current org on profile
    await supabase
      .from("profiles")
      .update({ current_org_id: orgData.id })
      .eq("id", user.id);

    const org: Organization = {
      id: orgData.id,
      name: orgData.name,
      slug: orgData.slug,
      createdBy: orgData.created_by,
    };

    setCurrentOrg(org);
    setOrgRole("owner");
    setOrgMembers([{
      id: crypto.randomUUID(),
      organizationId: org.id,
      userId: user.id,
      role: "owner",
      joinedAt: new Date().toISOString(),
    }]);

    return { org, error: null };
  }, [isRealUser, user]);

  return (
    <OrgContext.Provider
      value={{
        currentOrg,
        orgRole,
        orgMembers,
        isLoading,
        hasOrg: !!currentOrg,
        createOrg,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
