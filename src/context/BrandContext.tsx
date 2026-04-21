import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { BRAND, resolvedBrand, type BrandOverrides } from "@/config/brand";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/services/firebase";
import { fetchBranding, type OrgBranding } from "@/services/firebaseBranding";
import { logger } from "@/lib/logger";

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
  refreshBranding: () => void;
}

const defaultBrand = resolvedBrand();

const BrandContext = createContext<BrandContextType>({
  brand: defaultBrand,
  orgBranding: null,
  isWhiteLabeled: false,
  refreshBranding: () => {},
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const [orgBranding, setOrgBranding] = useState<OrgBranding | null>(null);

  const isDemoUser = !user || user.id === "demo" || (user.id?.length ?? 0) <= 20;

  const refreshBranding = useCallback(() => {
    if (isDemoUser) {
      setOrgBranding(null);
      return;
    }
    if (currentOrg) {
      fetchBranding(currentOrg.id).then(b => setOrgBranding(b));
    } else {
      fetchBranding("local").then(b => setOrgBranding(b));
    }
  }, [currentOrg?.id, isDemoUser]);

  useEffect(() => {
    // Demo users always get default branding — never load from localStorage
    if (isDemoUser) {
      setOrgBranding(null);
      return;
    }

    if (currentOrg) {
      let mounted = true;
      logger.log("BrandContext", "loading branding for org:", currentOrg.id);
      fetchBranding(currentOrg.id).then(b => {
        logger.log("BrandContext", "org branding result:", JSON.stringify(b));
        if (mounted) setOrgBranding(b);
      });
      return () => { mounted = false; };
    } else {
      let mounted = true;
      logger.log("BrandContext", "no org — loading from localStorage");
      fetchBranding("local").then(b => {
        logger.log("BrandContext", "localStorage branding result:", JSON.stringify(b));
        if (mounted) setOrgBranding(b);
      });
      return () => { mounted = false; };
    }
  }, [currentOrg?.id, isDemoUser]);

  const overrides: BrandOverrides | null = orgBranding
    ? {
        companyName: orgBranding.companyName,
        logoUrl: orgBranding.logoUrl,
        accentColor: orgBranding.accentColor,
      }
    : null;

  const brand = resolvedBrand(overrides);
  const isWhiteLabeled = !!(orgBranding?.companyName || orgBranding?.logoUrl || orgBranding?.accentColor);

  return (
    <BrandContext.Provider value={{ brand, orgBranding, isWhiteLabeled, refreshBranding }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}

/** Convert hex color to CSS-variable-ready RGB string e.g. "14 165 233" */
export function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}
