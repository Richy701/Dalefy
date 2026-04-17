/** Great-circle arc between two [lat, lng] points, returns array of [lat, lng] */
export function buildArc(from: [number, number], to: [number, number], segments = 50): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from[0]), lon1 = toRad(from[1]);
  const lat2 = toRad(to[0]),   lon2 = toRad(to[1]);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
  ));
  if (d < 0.0001) return [from, to];
  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    points.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))]);
  }
  return points;
}

/** Interpolate a point along a [lng, lat][] coordinate array at fraction t (0→1) */
export function interpolateArc(coords: number[][], t: number): { lng: number; lat: number; bearing: number } {
  const len = coords.length - 1;
  const idx = Math.min(Math.floor(t * len), len - 1);
  const frac = (t * len) - idx;
  const p0 = coords[idx];
  const p1 = coords[Math.min(idx + 1, len)];
  const lng = p0[0] + (p1[0] - p0[0]) * frac;
  const lat = p0[1] + (p1[1] - p0[1]) * frac;
  const dLng = (p1[0] - p0[0]) * Math.PI / 180;
  const lat1r = p0[1] * Math.PI / 180;
  const lat2r = p1[1] * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return { lng, lat, bearing };
}
