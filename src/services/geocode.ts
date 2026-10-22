import { LOCATION_COORDS } from "@/data/coordinates";
import { STORAGE } from "@/config/storageKeys";
import { apiFetch } from "@/lib/api";

const CACHE_KEY = STORAGE.GEOCODE_CACHE;

type Coord = [number, number]; // [lat, lng]

function loadCache(): Record<string, Coord | null> {
  // The v1 cache holds lookups made without the trip's area, many of them on other continents
  try { localStorage.removeItem("daf-geocode-cache-v1"); } catch { /* storage unavailable */ }
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
}
function saveCache(c: Record<string, Coord | null>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota */ }
}

const memCache: Record<string, Coord | null> = loadCache();
const inflight = new Map<string, Promise<Coord | null>>();

function staticLookup(location: string): Coord | null {
  if (LOCATION_COORDS[location]) return LOCATION_COORDS[location];
  const codeMatch = location.match(/^([A-Z]{3})\s+to\s+([A-Z]{3})$/);
  if (codeMatch) return LOCATION_COORDS[codeMatch[1]] || LOCATION_COORDS[codeMatch[2]] || null;
  const lower = location.toLowerCase();
  for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
    if (key.toLowerCase() === lower) return coords;
  }
  // A known place named inside the location ("Hotel X, Seoul"): whole words only, and never
  // airport codes, which hide inside ordinary words ("Adams" -> AMS, "District" -> IST)
  for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
    if (key.length <= 3) continue;
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(location)) return coords;
  }
  return null;
}

/** A trip's cities and countries; lookups made with it only return places on the trip */
export interface TripArea { anchors: Coord[]; countries: string[] }

const areaCache = new Map<string, Promise<TripArea | null>>();

/**
 * The cities a destination names, looked up once each: "Chiang Mai & Phuket, Thailand"
 * gives both cities, so venues near either are accepted and anything else is rejected.
 */
export function tripArea(destination?: string): Promise<TripArea | null> {
  const dest = destination?.trim();
  if (!dest) return Promise.resolve(null);
  if (!areaCache.has(dest)) {
    const comma = dest.lastIndexOf(",");
    const tail = comma > 0 ? dest.slice(comma) : "";
    const cities = (comma > 0 ? dest.slice(0, comma) : dest)
      .split(/\s*(?:&|\/|\+|\band\b)\s*/i).map(c => c.trim()).filter(Boolean).map(c => c + tail);
    areaCache.set(dest, Promise.all(cities.map(c =>
      apiFetch<{ coord?: Coord | null; country?: string | null }>(`/api/geocode?q=${encodeURIComponent(c)}`).catch(() => null),
    )).then(found => {
      const anchors = found.flatMap(f => f?.coord ? [f.coord] : []);
      const countries = [...new Set(found.flatMap(f => f?.country ? [f.country] : []))];
      return anchors.length ? { anchors, countries } : null;
    }));
  }
  return areaCache.get(dest)!;
}

export async function geocode(location: string, proximity?: Coord, area?: TripArea | null): Promise<Coord | null> {
  if (!location) return null;
  const key = location.trim();
  if (!key) return null;

  const fromStatic = staticLookup(key);
  if (fromStatic) return fromStatic;

  const areaKey = area ? `${area.countries.join(",")}|${area.anchors.map(a => a.map(n => n.toFixed(2)).join(",")).join(";")}` : "";
  const cacheKey = area ? `${key}@${areaKey}` : proximity ? `${key}@${proximity.join(",")}` : key;
  if (cacheKey in memCache) return memCache[cacheKey];
  if (inflight.has(cacheKey)) return inflight.get(cacheKey)!;

  const p = (async () => {
    try {
      const q = encodeURIComponent(key);
      let url = `/api/geocode?q=${q}`;
      const near = area?.anchors[0] ?? proximity;
      if (near) url += `&proximity=${near[1]},${near[0]}`;
      if (area) {
        if (area.countries.length) url += `&country=${area.countries.join(",")}`;
        url += `&within=${area.anchors.map(a => `${a[1]},${a[0]}`).join(";")}`;
      }
      const data = await apiFetch<{ coord?: Coord }>(url);
      if (!data.coord) return null;
      const coord: Coord = data.coord;
      memCache[cacheKey] = coord;
      saveCache(memCache);
      return coord;
    } catch {
      return null;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, p);
  return p;
}

export async function geocodeMany(locations: string[], area?: TripArea | null): Promise<Record<string, Coord>> {
  const unique = Array.from(new Set(locations.filter(Boolean)));
  const results = await Promise.all(unique.map(l => geocode(l, undefined, area).then(c => [l, c] as const)));
  const out: Record<string, Coord> = {};
  for (const [l, c] of results) if (c) out[l] = c;
  return out;
}
