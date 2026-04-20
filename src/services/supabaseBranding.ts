import { supabase, isSupabaseConfigured } from "./supabase";

export interface OrgBranding {
  organizationId: string;
  companyName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
}

export async function fetchBranding(orgId: string): Promise<OrgBranding | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from("org_branding")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    organizationId: data.organization_id,
    companyName: data.company_name,
    logoUrl: data.logo_url,
    accentColor: data.accent_color,
  };
}

export async function fetchBrandingForTrip(tripId: string): Promise<OrgBranding | null> {
  if (!isSupabaseConfigured()) return null;

  // Get the trip's org_id, then fetch branding
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("organization_id")
    .eq("id", tripId)
    .maybeSingle();

  if (tripError || !trip?.organization_id) return null;

  return fetchBranding(trip.organization_id);
}

export async function updateBranding(
  orgId: string,
  patch: Partial<Pick<OrgBranding, "companyName" | "logoUrl" | "accentColor">>,
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase not configured" };

  const row: Record<string, unknown> = { organization_id: orgId };
  if (patch.companyName !== undefined) row.company_name = patch.companyName;
  if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
  if (patch.accentColor !== undefined) row.accent_color = patch.accentColor;

  const { error } = await supabase
    .from("org_branding")
    .upsert(row, { onConflict: "organization_id" });

  return { error: error?.message ?? null };
}
