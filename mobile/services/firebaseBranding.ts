import AsyncStorage from "@react-native-async-storage/async-storage";

let firebaseDb: (() => import("firebase/firestore").Firestore) | null = null;
let isFirebaseConfigured: (() => boolean) | null = null;
let getDocFn: typeof import("firebase/firestore").getDoc | null = null;
let getDocsFn: typeof import("firebase/firestore").getDocs | null = null;
let docFn: typeof import("firebase/firestore").doc | null = null;
let collectionFn: typeof import("firebase/firestore").collection | null = null;
let queryFn: typeof import("firebase/firestore").query | null = null;
let whereFn: typeof import("firebase/firestore").where | null = null;

try {
  const fb = require("./firebase");
  firebaseDb = fb.firebaseDb;
  isFirebaseConfigured = fb.isFirebaseConfigured;
  const fs = require("firebase/firestore");
  getDocFn = fs.getDoc;
  getDocsFn = fs.getDocs;
  docFn = fs.doc;
  collectionFn = fs.collection;
  queryFn = fs.query;
  whereFn = fs.where;
} catch { /* Firebase not available */ }

const LOCAL_KEY = "daf-branding";

export interface OrgBranding {
  organizationId: string;
  companyName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
}

// ── AsyncStorage fallback ────────────────────────────────────────────

async function loadLocalBranding(): Promise<OrgBranding | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────

export async function fetchBranding(orgId: string): Promise<OrgBranding | null> {
  try {
    if (!isFirebaseConfigured?.()) return await loadLocalBranding();
    if (orgId === "local") return await loadLocalBranding();
    if (!firebaseDb || !getDocFn || !docFn) return await loadLocalBranding();

    const snap = await getDocFn(docFn(firebaseDb(), "org_branding", orgId));
    if (!snap.exists()) return await loadLocalBranding();

    const data = snap.data();
    return {
      organizationId: orgId,
      companyName: data.company_name ?? null,
      logoUrl: data.logo_url ?? null,
      accentColor: data.accent_color ?? null,
    };
  } catch {
    return null;
  }
}

/** Look up an organization by its agency code and return its branding */
export async function fetchOrgByCode(code: string): Promise<OrgBranding | null> {
  try {
    if (!isFirebaseConfigured?.() || !firebaseDb || !getDocsFn || !collectionFn || !queryFn || !whereFn)
      return null;

    // agency_code is stored on org_branding (open read rules)
    const snap = await getDocsFn(
      queryFn(collectionFn(firebaseDb(), "org_branding"), whereFn("agency_code", "==", code.toLowerCase())),
    );
    if (snap.empty) return null;

    const brandDoc = snap.docs[0];
    const orgId = brandDoc.id;
    const data = brandDoc.data();
    return {
      organizationId: orgId,
      companyName: data.company_name ?? null,
      logoUrl: data.logo_url ?? null,
      accentColor: data.accent_color ?? null,
    };
  } catch (err) {
    console.error("[fetchOrgByCode] error:", err);
    return null;
  }
}

export async function fetchBrandingForTrip(tripId: string): Promise<OrgBranding | null> {
  try {
    if (!isFirebaseConfigured?.() || !firebaseDb || !getDocFn || !docFn) return await loadLocalBranding();

    const tripSnap = await getDocFn(docFn(firebaseDb(), "trips", tripId));
    if (!tripSnap.exists()) return null;

    const orgId = tripSnap.data().organization_id;
    if (!orgId) return null;

    return fetchBranding(orgId);
  } catch {
    return null;
  }
}
