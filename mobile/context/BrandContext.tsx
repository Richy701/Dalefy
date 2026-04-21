import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { fetchBranding, type OrgBranding } from "@/services/firebaseBranding";

const DEFAULT_NAME = "Dalefy";

interface Brand {
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
}

interface BrandContextValue {
  brand: Brand;
  orgBranding: OrgBranding | null;
  refreshBranding: () => void;
}

const defaultBrand: Brand = { name: DEFAULT_NAME, logoUrl: null, accentColor: null };

const BrandContext = createContext<BrandContextValue>({
  brand: defaultBrand,
  orgBranding: null,
  refreshBranding: () => {},
});

interface Props {
  orgId?: string | null;
  children: ReactNode;
}

export function BrandProvider({ orgId, children }: Props) {
  const [orgBranding, setOrgBranding] = useState<OrgBranding | null>(null);

  const load = useCallback(() => {
    const id = orgId ?? "local";
    fetchBranding(id).then(setOrgBranding).catch(() => {});
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const brand = useMemo<Brand>(() => ({
    name: orgBranding?.companyName || DEFAULT_NAME,
    logoUrl: orgBranding?.logoUrl || null,
    accentColor: orgBranding?.accentColor || null,
  }), [orgBranding]);

  const value = useMemo(() => ({ brand, orgBranding, refreshBranding: load }), [brand, orgBranding, load]);

  return (
    <BrandContext.Provider value={value}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}
