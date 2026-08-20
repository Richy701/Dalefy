/**
 * Shared core for Mapbox geocoding (single-result coord lookup + autocomplete
 * suggestions). Imported by BOTH api/geocode.ts (Vercel) and vite.config.ts
 * (local dev) so response shapes can never drift.
 */
import { HttpError } from "./_httpError.js";

export const PROXIMITY_RE = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;

/** The subset of the Mapbox Geocoding v5 response this module reads. */
interface MapboxFeature {
  center?: [number, number];
  place_name?: string;
}
interface MapboxResponse {
  features?: MapboxFeature[];
}

async function mapboxFetch(url: string): Promise<MapboxResponse> {
  let resp: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    resp = await fetch(url, { signal: controller.signal });
  } catch {
    throw new HttpError(500, "Failed to geocode");
  } finally {
    clearTimeout(timeout);
  }
  if (!resp.ok) throw new HttpError(resp.status, "Mapbox error");
  return await resp.json() as MapboxResponse;
}

export async function geocode(
  q: string,
  proximity: string | undefined,
  token: string,
): Promise<{ coord: [number, number] | null }> {
  const encoded = encodeURIComponent(q);
  let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&limit=1`;
  if (proximity) url += `&proximity=${encodeURIComponent(proximity)}`;
  const data = await mapboxFetch(url);
  const feat = data?.features?.[0];
  if (!feat?.center) return { coord: null };

  // Return [lat, lng]
  return { coord: [feat.center[1], feat.center[0]] };
}

export async function suggest(
  q: string,
  proximity: string | undefined,
  token: string,
): Promise<{ suggestions: { name: string; center: [number, number] }[] }> {
  const encoded = encodeURIComponent(q);
  let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&autocomplete=true&limit=5&types=place,locality,poi,address`;
  if (proximity) url += `&proximity=${encodeURIComponent(proximity)}`;
  const data = await mapboxFetch(url);
  const suggestions = (data?.features ?? [])
    .filter((f): f is MapboxFeature & { center: [number, number] } =>
      Array.isArray(f?.center) && f.center.length === 2)
    .map((f) => ({
      name: f.place_name ?? "",
      // [lng, lat]
      center: [f.center[0], f.center[1]] as [number, number],
    }));
  return { suggestions };
}
