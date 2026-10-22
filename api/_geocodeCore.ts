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
/** "lng,lat;lng,lat": the trip's cities, for rejecting results nowhere near them */
export const WITHIN_RE = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?(;-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?){0,9}$/;
/** ISO 3166 alpha-2 codes, comma-separated */
export const COUNTRY_RE = /^[a-z]{2}(,[a-z]{2}){0,9}$/i;
/** Further than this from every anchor and a result is a wrong match, not a venue on the trip */
const MAX_KM = 300;

function km([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const r = Math.PI / 180;
  const h = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The subset of the Mapbox Geocoding v6 response this module reads. */
interface MapboxFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { name?: string; place_formatted?: string; full_address?: string; context?: { country?: { country_code?: string } } };
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

/**
 * One coordinate for a place. Mapbox has no venue data and otherwise returns the best
 * text match anywhere in the world, so callers that know the trip pass `country` (limit
 * to those countries) and `within` (the trip's cities): a result further than MAX_KM
 * from all of them comes back as no coordinate rather than a pin on another continent.
 */
export async function geocode(
  q: string,
  proximity: string | undefined,
  token: string,
  opts: { country?: string; within?: string } = {},
): Promise<{ coord: [number, number] | null; country: string | null }> {
  const encoded = encodeURIComponent(q);
  let url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encoded}&access_token=${token}&limit=1&language=en&permanent=true`;
  if (proximity) url += `&proximity=${encodeURIComponent(proximity)}`;
  if (opts.country) url += `&country=${encodeURIComponent(opts.country.toLowerCase())}`;
  const data = await mapboxFetch(url);
  const feature = data?.features?.[0];
  const point = feature?.geometry?.coordinates;
  if (!Array.isArray(point) || point.length !== 2) return { coord: null, country: null };

  if (opts.within) {
    const anchors = opts.within.split(";").map(p => p.split(",").map(Number) as [number, number]);
    if (!anchors.some(a => km(a, point) <= MAX_KM)) return { coord: null, country: null };
  }

  // Return [lat, lng]
  return { coord: [point[1], point[0]], country: feature?.properties?.context?.country?.country_code?.toLowerCase() ?? null };
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
