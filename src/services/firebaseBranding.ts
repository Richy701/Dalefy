import { doc, getDoc, setDoc } from "firebase/firestore";
import { firebaseDb, isFirebaseConfigured } from "./firebase";
import { STORAGE } from "@/config/storageKeys";

export interface OrgBranding {
  organizationId: string;
  companyName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
}

// ── localStorage fallback for demo / no-Firebase mode ──────────────────

function loadLocalBranding(): OrgBranding | null {
  try {
    const raw = localStorage.getItem(STORAGE.BRANDING);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocalBranding(branding: Partial<OrgBranding>) {
  try {
    const existing = loadLocalBranding() ?? { organizationId: "local", companyName: null, logoUrl: null, accentColor: null };
    const merged = { ...existing, ...branding };
    localStorage.setItem(STORAGE.BRANDING, JSON.stringify(merged));
  } catch { /* ignore */ }
}

// ── Public API ─────────────────────────────────────────────────────────

export async function fetchBranding(orgId: string): Promise<OrgBranding | null> {
  if (!isFirebaseConfigured()) return loadLocalBranding();

  // "local" means no org — use localStorage even when Firebase is configured
  if (orgId === "local") return loadLocalBranding();

  try {
    const snap = await getDoc(doc(firebaseDb(), "org_branding", orgId));
    if (!snap.exists()) return loadLocalBranding(); // fallback to localStorage

    const data = snap.data();
    return {
      organizationId: orgId,
      companyName: data.company_name ?? null,
      logoUrl: data.logo_url ?? null,
      accentColor: data.accent_color ?? null,
    };
  } catch {
    return loadLocalBranding(); // fallback on error too
  }
}

export async function fetchBrandingForTrip(tripId: string): Promise<OrgBranding | null> {
  if (!isFirebaseConfigured()) return loadLocalBranding();

  try {
    const tripSnap = await getDoc(doc(firebaseDb(), "trips", tripId));
    if (!tripSnap.exists()) return null;

    const orgId = tripSnap.data().organization_id;
    if (!orgId) return null;

    return fetchBranding(orgId);
  } catch {
    return null;
  }
}

export async function uploadLogo(
  _orgId: string,
  file: File,
): Promise<{ url: string | null; error: string | null }> {
  try {
    if (file.size > 2 * 1024 * 1024) {
      return { url: null, error: "Logo must be under 2 MB" };
    }
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
    return { url, error: null };
  } catch (err: unknown) {
    return { url: null, error: err instanceof Error ? err.message : "Upload failed" };
  }
}

export async function updateBranding(
  orgId: string,
  patch: Partial<Pick<OrgBranding, "companyName" | "logoUrl" | "accentColor">>,
): Promise<{ error: string | null }> {
  // Always save to localStorage so branding works even without an org
  saveLocalBranding(patch);

  if (!isFirebaseConfigured() || orgId === "local") {
    return { error: null };
  }

  try {
    const data: Record<string, unknown> = {};
    if (patch.companyName !== undefined) data.company_name = patch.companyName;
    if (patch.logoUrl !== undefined) data.logo_url = patch.logoUrl;
    if (patch.accentColor !== undefined) data.accent_color = patch.accentColor;

    await setDoc(doc(firebaseDb(), "org_branding", orgId), data, { merge: true });
    return { error: null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to save branding" };
  }
}
