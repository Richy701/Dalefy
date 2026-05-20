import { LOCATION_COORDS } from "@/data/coordinates";
import { STORAGE } from "@/config/storageKeys";

const CACHE_KEY = STORAGE.GEOCODE_CACHE;

type Coord = [number, number]; // [lat, lng]

function loadCache(): Record<string, Coord | null> {
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
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return coords;
  }
  return null;
}

export async function geocode(location: string, proximity?: Coord): Promise<Coord | null> {
  if (!location) return null;
  const key = location.trim();
  if (!key) return null;

  const fromStatic = staticLookup(key);
  if (fromStatic) return fromStatic;

  const cacheKey = proximity ? `${key}@${proximity.join(",")}` : key;
  if (cacheKey in memCache) return memCache[cacheKey];
  if (inflight.has(cacheKey)) return inflight.get(cacheKey)!;

  const p = (async () => {
    try {
      const q = encodeURIComponent(key);
      let url = `/api/geocode?q=${q}`;
      if (proximity) url += `&proximity=${proximity[1]},${proximity[0]}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
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

export async function geocodeMany(locations: string[], proximity?: Coord): Promise<Record<string, Coord>> {
  const unique = Array.from(new Set(locations.filter(Boolean)));
  const results = await Promise.all(unique.map(l => geocode(l, proximity).then(c => [l, c] as const)));
  const out: Record<string, Coord> = {};
  for (const [l, c] of results) if (c) out[l] = c;
  return out;
}
