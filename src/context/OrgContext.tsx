import { createContext, useContext, type ReactNode } from "react";
import type { Organization, OrgMember, OrgRole } from "@/types";
import { useOrgLoad } from "@/hooks/useOrgLoad";

interface OrgContextType {
  currentOrg: Organization | null;
  orgRole: OrgRole | null;
  orgMembers: OrgMember[];
  isLoading: boolean;
  hasOrg: boolean;
  tablesReady: boolean;
  createOrg: (name: string, agencyCode?: string) => Promise<{ org: Organization | null; error: string | null }>;
}

const OrgContext = createContext<OrgContextType>({
  currentOrg: null,
  orgRole: null,
  orgMembers: [],
  isLoading: true,
  hasOrg: false,
  tablesReady: false,
  createOrg: async () => ({ org: null, error: "Not initialized" }),
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const { currentOrg, orgRole, orgMembers, isLoading, tablesReady, createOrg } = useOrgLoad();

  return (
    <OrgContext.Provider
      value={{
        currentOrg,
        orgRole,
        orgMembers,
        isLoading,
        hasOrg: !!currentOrg,
        tablesReady,
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
