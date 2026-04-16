import { LOCATION_COORDS } from "@/data/coordinates";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
const CACHE_KEY = "daf-geocode-cache-v1";

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

export async function geocode(location: string): Promise<Coord | null> {
  if (!location) return null;
  const key = location.trim();
  if (!key) return null;

  const fromStatic = staticLookup(key);
  if (fromStatic) return fromStatic;

  if (key in memCache) return memCache[key];
  if (inflight.has(key)) return inflight.get(key)!;

  if (!TOKEN) return null;

  const p = (async () => {
    try {
      const q = encodeURIComponent(key);
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${TOKEN}&limit=1`);
      if (!res.ok) return null;
      const data = await res.json();
      const feat = data?.features?.[0];
      if (!feat?.center) return null;
      const coord: Coord = [feat.center[1], feat.center[0]]; // [lat, lng]
      memCache[key] = coord;
      saveCache(memCache);
      return coord;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

export async function geocodeMany(locations: string[]): Promise<Record<string, Coord>> {
  const unique = Array.from(new Set(locations.filter(Boolean)));
  const results = await Promise.all(unique.map(l => geocode(l).then(c => [l, c] as const)));
  const out: Record<string, Coord> = {};
  for (const [l, c] of results) if (c) out[l] = c;
  return out;
}
