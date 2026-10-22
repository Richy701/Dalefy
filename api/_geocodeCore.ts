/**
 * Shared core for Mapbox geocoding (single-result coord lookup + autocomplete
 * suggestions). Imported by BOTH api/geocode.ts (Vercel) and vite.config.ts
 * (local dev) so response shapes can never drift.
 *
 * Geocoding v6. Single lookups use permanent geocoding because their results are
 * saved (on events, in the browser cache); Mapbox doesn't allow storing temporary
 * results. Autocomplete stays temporary: suggestions are only shown, and a picked
 * one is looked up again permanently before it's saved.
 */
import { HttpError } from "./_httpError.js";

export const PROXIMITY_RE = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;

/** The subset of the Mapbox Geocoding v6 response this module reads. */
interface MapboxFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { name?: string; place_formatted?: string; full_address?: string };
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
  let url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encoded}&access_token=${token}&limit=1&language=en&permanent=true`;
  if (proximity) url += `&proximity=${encodeURIComponent(proximity)}`;
  const data = await mapboxFetch(url);
  const point = data?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(point) || point.length !== 2) return { coord: null };

  // Return [lat, lng]
  return { coord: [point[1], point[0]] };
}

export async function suggest(
  q: string,
  proximity: string | undefined,
  token: string,
): Promise<{ suggestions: { name: string; center: [number, number] }[] }> {
  const encoded = encodeURIComponent(q);
  let url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encoded}&access_token=${token}&autocomplete=true&limit=5&language=en&types=country,region,district,place,locality,neighborhood,street,address`;
  if (proximity) url += `&proximity=${encodeURIComponent(proximity)}`;
  const data = await mapboxFetch(url);
  const suggestions = (data?.features ?? [])
    .filter((f) => Array.isArray(f?.geometry?.coordinates) && f.geometry!.coordinates!.length === 2)
    .map((f) => {
      const p = f.properties ?? {};
      return {
        name: p.full_address || [p.name, p.place_formatted].filter(Boolean).join(", "),
        // [lng, lat]
        center: [f.geometry!.coordinates![0], f.geometry!.coordinates![1]] as [number, number],
      };
    });
  return { suggestions };
}
