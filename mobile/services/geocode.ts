import { LOCATION_COORDS, resolveCoords } from "@/shared/coordinates";

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN!;
type Coord = [number, number]; // [lat, lng]

const memCache: Record<string, Coord | null> = {};
const inflight = new Map<string, Promise<Coord | null>>();

export async function geocode(location: string): Promise<Coord | null> {
  if (!location) return null;
  const key = location.trim();
  if (!key) return null;

  const fromStatic = resolveCoords(key);
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
