import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { BRAND, resolvedBrand, type BrandOverrides } from "@/config/brand";
import { useOrg } from "@/context/OrgContext";
import { fetchBranding, type OrgBranding } from "@/services/supabaseBranding";

interface ResolvedBrand {
  name: string;
  nameUpper: string;
  logoUrl: string | null;
  accentColor: string;
  platformName: string;
}

interface BrandContextType {
  brand: ResolvedBrand;
  orgBranding: OrgBranding | null;
  isWhiteLabeled: boolean;
}

const defaultBrand = resolvedBrand();

const BrandContext = createContext<BrandContextType>({
  brand: defaultBrand,
  orgBranding: null,
  isWhiteLabeled: false,
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const { currentOrg } = useOrg();
  const [orgBranding, setOrgBranding] = useState<OrgBranding | null>(null);

  useEffect(() => {
    if (!currentOrg) {
      setOrgBranding(null);
      return;
    }

    let mounted = true;
    fetchBranding(currentOrg.id).then(b => {
      if (mounted) setOrgBranding(b);
    });
    return () => { mounted = false; };
  }, [currentOrg?.id]);

  const overrides: BrandOverrides | null = orgBranding
    ? {
        companyName: orgBranding.companyName,
        logoUrl: orgBranding.logoUrl,
        accentColor: orgBranding.accentColor,
      }
    : null;

  const brand = resolvedBrand(overrides);
  const isWhiteLabeled = !!(orgBranding?.companyName || orgBranding?.logoUrl);

  return (
    <BrandContext.Provider value={{ brand, orgBranding, isWhiteLabeled }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}
