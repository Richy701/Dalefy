import { createContext, useContext, type ReactNode } from "react";
import type { Organization, OrgMember, OrgRole } from "@/types";
import { useOrgLoad } from "@/hooks/useOrgLoad";

interface OrgContextType {
  currentOrg: Organization | null;
  orgRole: OrgRole | null;
  orgMembers: OrgMember[];
  /** Every org the user belongs to (for switching). */
  orgs: Organization[];
  isLoading: boolean;
  hasOrg: boolean;
  tablesReady: boolean;
  createOrg: (name: string, agencyCode?: string) => Promise<{ org: Organization | null; error: string | null }>;
  refreshOrg: () => void;
  switchOrg: (orgId: string) => Promise<{ error: string | null }>;
}

const OrgContext = createContext<OrgContextType>({
  currentOrg: null,
  orgRole: null,
  orgMembers: [],
  orgs: [],
  isLoading: true,
  hasOrg: false,
  tablesReady: false,
  createOrg: async () => ({ org: null, error: "Not initialized" }),
  refreshOrg: () => {},
  switchOrg: async () => ({ error: "Not initialized" }),
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const { currentOrg, orgRole, orgMembers, orgs, isLoading, tablesReady, createOrg, refreshOrg, switchOrg } = useOrgLoad();

  return (
    <OrgContext.Provider
      value={{
        currentOrg,
        orgRole,
        orgMembers,
        orgs,
        isLoading,
        hasOrg: !!currentOrg,
        tablesReady,
        createOrg,
        refreshOrg,
        switchOrg,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
