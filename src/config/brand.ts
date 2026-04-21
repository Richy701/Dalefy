/**
 * Centralized brand configuration.
 *
 * Change the `name` here and every UI surface updates automatically.
 * localStorage keys intentionally use a fixed prefix ("daf") so existing
 * user data is never lost during a rename.
 */
export const BRAND = {
  /** Display name shown in headers, footers, PDFs, emails, etc. */
  name: "Dalefy",

  /** Uppercase variant for hero / login headings */
  nameUpper: "DALEFY",

  /** Short name for PWA manifest, share text, etc. */
  shortName: "Dalefy",

  /** One-line tagline */
  tagline: "Trip planning without the mess",

  /** Fixed prefix for localStorage keys — DO NOT change after launch */
  storagePrefix: "daf",

  /** Default accent color (cyber teal) */
  accentColor: "#0bd2b5",
} as const;

/** Org-level brand overrides — these take priority over BRAND defaults */
export interface BrandOverrides {
  companyName?: string | null;
  logoUrl?: string | null;
  accentColor?: string | null;
}

/** Merge platform brand with org overrides */
export function resolvedBrand(overrides?: BrandOverrides | null) {
  return {
    name: overrides?.companyName || BRAND.name,
    nameUpper: (overrides?.companyName || BRAND.name).toUpperCase(),
    logoUrl: overrides?.logoUrl || null,
    accentColor: overrides?.accentColor || BRAND.accentColor,
    platformName: BRAND.name,
  };
}
