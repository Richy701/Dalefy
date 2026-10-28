import { resolveCoords } from "@/data/coordinates";
import type { Trip } from "@/types";

export type PlaceKind = "hotel" | "venue" | "airport";
export interface Place { kind: PlaceKind; name: string; tripName: string; lngLat: [number, number] }

const valid = (lng: number, lat: number) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/**
 * Event coordinates were saved in both orders over time ([lat, lng] from the bulk geocoder and the
 * importer, [lng, lat] from the address picker), so take whichever reading sits nearer the trip's
 * destination. Without a destination to compare against, only an unambiguous pair is used.
 */
function eventLngLat(c: [number, number], near: [number, number] | undefined): [number, number] | null {
  const asLngLat: [number, number] = [c[0], c[1]];
  const asLatLng: [number, number] = [c[1], c[0]];
  const okA = valid(...asLngLat), okB = valid(...asLatLng);
  if (okA !== okB) return okA ? asLngLat : asLatLng;
  if (!okA) return null;
  if (!near) return null;
  const dist = (p: [number, number]) => (p[0] - near[0]) ** 2 + (p[1] - near[1]) ** 2;
  return dist(asLngLat) <= dist(asLatLng) ? asLngLat : asLatLng;
}

/** A flight end: the lookup saves [lat, lng]; otherwise the airport code from our own table */
function airportLngLat(coords: [number, number] | undefined, code: string | undefined): [number, number] | null {
  if (coords && valid(coords[1], coords[0])) return [coords[1], coords[0]];
  const known = code ? resolveCoords(code.trim().toUpperCase()) : null;
  return known ? [known[1], known[0]] : null;
}

/**
 * Hotels, venues (activities and restaurants) and airports across the given trips, one pin per place.
 * `destinationOf` gives each trip's destination as [lng, lat] when it's known.
 */
export function tripPlaces(trips: Trip[], destinationOf: (trip: Trip) => [number, number] | undefined): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  const add = (p: Place) => {
    const key = `${p.kind}:${p.lngLat[0].toFixed(3)},${p.lngLat[1].toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };
  for (const trip of trips) {
    const near = destinationOf(trip);
    for (const ev of trip.events) {
      if (ev.type === "flight") {
        const dep = airportLngLat(ev.depCoords, ev.depAirport);
        const arr = airportLngLat(ev.arrCoords, ev.arrAirport);
        if (dep) add({ kind: "airport", name: ev.depAirport || ev.title, tripName: trip.name, lngLat: dep });
        if (arr) add({ kind: "airport", name: ev.arrAirport || ev.title, tripName: trip.name, lngLat: arr });
        continue;
      }
      if (ev.type === "transfer" || !ev.locationCoords) continue;
      const lngLat = eventLngLat(ev.locationCoords, near);
      if (!lngLat) continue;
      // A pin sitting on the destination itself is a country or city centre the geocoder fell back to
      if (near && Math.abs(lngLat[0] - near[0]) < 0.01 && Math.abs(lngLat[1] - near[1]) < 0.01) continue;
      add({ kind: ev.type === "hotel" ? "hotel" : "venue", name: ev.title, tripName: trip.name, lngLat });
    }
  }
  return out;
}
