/**
 * Centralized brand configuration.
 *
 * Change the `name` here and every UI surface updates automatically.
 * localStorage keys intentionally use a fixed prefix ("daf") so existing
 * user data is never lost during a rename.
 */
export const BRAND = {
  /** Display name shown in headers, footers, PDFs, emails, etc. */
  name: "DAF Adventures",

  /** Uppercase variant for hero / login headings */
  nameUpper: "DAF ADVENTURES",

  /** Short name for PWA manifest, share text, etc. */
  shortName: "DAF",

  /** One-line tagline */
  tagline: "Plan & manage trips together",

  /** Fixed prefix for localStorage keys — DO NOT change after launch */
  storagePrefix: "daf",
} as const;
