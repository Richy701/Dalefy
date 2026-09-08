import { LOCATION_COORDS, resolveCoords, AREA_PLACE_TYPES } from "@/shared/coordinates";

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN!;
type Coord = [number, number]; // [lat, lng]

const memCache: Record<string, Coord | null> = {};
const inflight = new Map<string, Promise<Coord | null>>();

/** `near` is [lat, lng]; when given, results are biased toward it (e.g. the trip destination). */
export async function geocode(location: string, near?: Coord): Promise<Coord | null> {
  if (!location) return null;
  const loc = location.trim();
  if (!loc) return null;

  const fromStatic = resolveCoords(loc);
  if (fromStatic) return fromStatic;

  const key = near ? `${loc}@${near[0]},${near[1]}` : loc;

  if (key in memCache) return memCache[key];
  if (inflight.has(key)) return inflight.get(key)!;
  if (!TOKEN) return null;

  const p = (async () => {
    try {
      const q = encodeURIComponent(loc);
      const prox = near ? `&proximity=${near[1]},${near[0]}` : "";
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${TOKEN}&limit=1${prox}`);
      if (!res.ok) return null;
      const data = await res.json();
      const feat = data?.features?.[0];
      if (!feat?.center) return null;
      // A country/region match means the venue itself was not found
      if ((feat.place_type ?? []).some((t: string) => AREA_PLACE_TYPES.has(t))) { memCache[key] = null; return null; }
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
