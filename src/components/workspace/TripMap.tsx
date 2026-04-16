import { useMemo, useEffect, useRef, memo, useState, useCallback } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { Plane, Hotel, Compass, Utensils, MapPin } from "lucide-react";
import type { Trip, TravelEvent } from "@/types";
import type { Theme } from "@/types";
import { resolveCoords } from "@/data/coordinates";
import { geocode } from "@/services/geocode";

const ACCENT = "#0bd2b5";

const TYPE_COLORS: Record<string, string> = {
  flight:   "#0bd2b5",
  hotel:    "#f59e0b",
  activity: "#0bd2b5",
  dining:   "#f472b6",
};

const TYPE_ICONS = {
  flight:   Plane,
  hotel:    Hotel,
  activity: Compass,
  dining:   Utensils,
} as const;

/** Great-circle arc between two lat/lng points */
function buildArc(from: [number, number], to: [number, number], segments = 50): [number, number][] {
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

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

interface TripMapProps { theme: Theme; trip: Trip; }
interface MapPoint {
  coords: [number, number];
  label: string;
  type: TravelEvent["type"];
  order: number;
  title: string;
}

// Marching-ants dash sequences (MapLibre animate technique)
const DASH_SEQ: number[][] = [
  [0,4,3],[0.5,4,2.5],[1,4,2],[1.5,4,1.5],[2,4,1],[2.5,4,0.5],[3,4,0],
  [0,0.5,3,3.5],[0,1,3,3],[0,1.5,3,2.5],[0,2,3,2],[0,2.5,3,1.5],[0,3,3,1],[0,3.5,3,0.5],
];

export const TripMap = memo(function TripMap({ theme, trip }: TripMapProps) {
  const isDark = theme === "dark";
  const mapRef = useRef<MapRef>(null);
  const rafRef = useRef<number>(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const mapStyle = isDark
    ? "mapbox://styles/mapbox/dark-v11"
    : "mapbox://styles/mapbox/light-v11";

  const [points, setPoints] = useState<MapPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seen = new Set<string>();
      const result: MapPoint[] = [];
      let order = 0;
      const sortedEvents = [...trip.events].sort((a, b) =>
        a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time)
      );
      const resolve = async (loc: string): Promise<[number, number] | null> =>
        resolveCoords(loc) ?? (await geocode(loc));

      for (const event of sortedEvents) {
        const codeMatch = event.location.match(/^([A-Z]{3})\s+to\s+([A-Z]{3})$/);
        if (codeMatch) {
          for (const code of [codeMatch[1], codeMatch[2]]) {
            const c = await resolve(code);
            if (c) {
              const key = `${c[0].toFixed(2)},${c[1].toFixed(2)}`;
              if (!seen.has(key)) { seen.add(key); result.push({ coords: c, label: code, type: event.type, order: order++, title: event.title }); }
            }
          }
          continue;
        }
        const toMatch = event.location.match(/^(.+?)\s+to\s+(.+)$/);
        if (toMatch) {
          for (const loc of [toMatch[1], toMatch[2]]) {
            const c = await resolve(loc.trim());
            if (c) {
              const key = `${c[0].toFixed(2)},${c[1].toFixed(2)}`;
              if (!seen.has(key)) { seen.add(key); result.push({ coords: c, label: loc.trim(), type: event.type, order: order++, title: event.title }); }
            }
          }
          continue;
        }
        const coords = await resolve(event.location);
        if (!coords) continue;
        const key = `${coords[0].toFixed(2)},${coords[1].toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const parts = event.location.split(",");
        const label = parts[0].trim().length > 22 ? parts[0].trim().slice(0, 20) + "…" : parts[0].trim();
        result.push({ coords, label, type: event.type, order: order++, title: event.title });
      }
      if (!cancelled) setPoints(result);
    })();
    return () => { cancelled = true; };
  }, [trip.events]);

  const allCoords = useMemo(() => points.map(p => p.coords), [points]);

  const [arcGeoJSON, setArcGeoJSON] = useState<{ type: "FeatureCollection"; features: Array<{ type: "Feature"; geometry: { type: "LineString"; coordinates: number[][] }; properties: Record<string, never> }> }>({ type: "FeatureCollection", features: [] });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const flights = trip.events.filter(e => e.type === "flight");
      const features = [] as Array<{ type: "Feature"; geometry: { type: "LineString"; coordinates: number[][] }; properties: Record<string, never> }>;
      for (const fe of flights) {
        const match = fe.location.match(/^(.+?)\s+to\s+(.+)$/);
        if (!match) continue;
        const from = resolveCoords(match[1].trim()) ?? (await geocode(match[1].trim()));
        const to   = resolveCoords(match[2].trim()) ?? (await geocode(match[2].trim()));
        if (!from || !to) continue;
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: buildArc(from, to).map(p => [p[1], p[0]]) },
          properties: {},
        });
      }
      if (!cancelled) setArcGeoJSON({ type: "FeatureCollection", features });
    })();
    return () => { cancelled = true; };
  }, [trip.events]);

  // Fit map to all points after first render
  useEffect(() => {
    if (!mapRef.current || allCoords.length === 0) return;
    const lngs = allCoords.map(c => c[1]);
    const lats = allCoords.map(c => c[0]);
    if (allCoords.length === 1) {
      mapRef.current.flyTo({ center: [lngs[0], lats[0]], zoom: 5, duration: 800 });
      return;
    }
    mapRef.current.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: { top: 120, bottom: 200, left: 120, right: 120 }, maxZoom: 4, duration: 1000 }
    );
  }, [allCoords]);

  // Marching-ants arc animation
  const startArcAnimation = useCallback(() => {
    const step = { current: 0 };
    function animate(ts: number) {
      const idx = Math.floor(ts / 50) % DASH_SEQ.length;
      const m = mapRef.current?.getMap();
      if (m && m.getLayer && m.getLayer("arcs-dash")) {
        try { m.setPaintProperty("arcs-dash", "line-dasharray", DASH_SEQ[idx]); } catch { /* ignore */ }
      }
      rafRef.current = requestAnimationFrame(animate);
    }
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  if (points.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-50 dark:bg-[#050505]">
        <div className="text-center space-y-3">
          <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-[#111111] flex items-center justify-center mx-auto border border-slate-200 dark:border-[#1f1f1f]">
            <MapPin className="h-6 w-6 text-slate-500 dark:text-[#888]" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888]">No locations to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative overflow-hidden">
      {/* Edge vignette */}
      <div className="absolute inset-0 z-[500] pointer-events-none" style={{
        boxShadow: `inset 0 0 50px 15px ${isDark ? "#050505" : "#f8fafc"}`,
      }} />
      {isDark && (
        <div className="absolute inset-0 z-[400] pointer-events-none" style={{
          background: `radial-gradient(ellipse at 50% 40%, ${ACCENT}06 0%, transparent 70%)`,
        }} />
      )}

      <Map
        ref={mapRef}
        initialViewState={{ longitude: 25, latitude: 30, zoom: 2 }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
        reuseMaps
        attributionControl={true}
        style={{ width: "100%", height: "100%" }}
        onLoad={startArcAnimation}
      >
        {/* Flight arc — glow halo */}
        <Source id="arcs" type="geojson" data={arcGeoJSON}>
          <Layer
            id="arcs-glow"
            type="line"
            paint={{ "line-color": ACCENT, "line-width": 8, "line-opacity": 0.06 }}
          />
          <Layer
            id="arcs-dash"
            type="line"
            layout={{ "line-cap": "round" }}
            paint={{ "line-color": ACCENT, "line-width": 1.5, "line-opacity": 0.6 }}
          />
        </Source>

        {/* Markers */}
        {points.map(pt => {
          const color = TYPE_COLORS[pt.type] || ACCENT;
          const isFirst = pt.order === 0;
          const size = isFirst ? 38 : 30;
          const iconSize = isFirst ? 14 : 11;
          const Icon = TYPE_ICONS[pt.type] || MapPin;
          const bg = isDark ? "#111111" : "#ffffff";
          const borderColor = isFirst ? ACCENT : (isDark ? "#1f1f1f" : "#e2e8f0");
          const shadow = isFirst
            ? `0 0 20px ${ACCENT}33, 0 0 0 4px ${ACCENT}15, 0 4px 16px rgba(0,0,0,0.3)`
            : `0 2px 8px rgba(0,0,0,${isDark ? "0.5" : "0.12"})`;

          return (
            <Marker
              key={pt.order}
              longitude={pt.coords[1]}
              latitude={pt.coords[0]}
              anchor="center"
              style={{ zIndex: isFirst ? 1000 : 100 - pt.order }}
            >
              <div
                style={{ position: "relative", width: size, height: size, cursor: "pointer" }}
                onMouseEnter={() => setHoveredIdx(pt.order)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Pulse rings for first marker */}
                {isFirst && (
                  <>
                    <div style={{
                      position: "absolute", top: "50%", left: "50%",
                      width: size + 20, height: size + 20,
                      marginLeft: -(size + 20) / 2, marginTop: -(size + 20) / 2,
                      borderRadius: "50%", border: `2px solid ${ACCENT}`,
                      animation: "marker-pulse 2.5s ease-out infinite",
                      pointerEvents: "none",
                    }} />
                    <div style={{
                      position: "absolute", top: "50%", left: "50%",
                      width: size + 20, height: size + 20,
                      marginLeft: -(size + 20) / 2, marginTop: -(size + 20) / 2,
                      borderRadius: "50%", border: `2px solid ${ACCENT}`,
                      animation: "marker-pulse 2.5s ease-out 1.25s infinite",
                      pointerEvents: "none",
                    }} />
                  </>
                )}

                {/* Main dot */}
                <div style={{
                  width: size, height: size, borderRadius: "50%",
                  background: bg,
                  border: `${isFirst ? 2.5 : 1.5}px solid ${borderColor}`,
                  boxShadow: shadow,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative", zIndex: 2,
                }}>
                  <Icon size={iconSize} color={color} strokeWidth={2.5} />
                </div>

                {/* Number badge */}
                <div style={{
                  position: "absolute", top: -5, right: -5,
                  minWidth: 16, height: 16, borderRadius: 8,
                  background: isFirst ? ACCENT : (isDark ? "#2a2a2a" : "#e2e8f0"),
                  color: isFirst ? "#000" : (isDark ? "#ccc" : "#555"),
                  fontSize: 10, fontWeight: 900, fontStyle: "italic",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 3, padding: "0 4px",
                  border: `1.5px solid ${bg}`,
                  letterSpacing: "-0.02em",
                  fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                }}>{pt.order + 1}</div>

                {/* Hover tooltip */}
                {hoveredIdx === pt.order && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 10px)", left: "50%",
                    transform: "translateX(-50%)",
                    background: isDark ? "#111111" : "#ffffff",
                    border: `1px solid ${isDark ? "#1f1f1f" : "#e2e8f0"}`,
                    borderRadius: 10, padding: "6px 10px",
                    whiteSpace: "nowrap", zIndex: 200,
                    boxShadow: `0 4px 20px rgba(0,0,0,${isDark ? "0.5" : "0.15"})`,
                    pointerEvents: "none",
                  }}>
                    <div style={{
                      fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                      fontWeight: 900, fontSize: 12, fontStyle: "italic",
                      textTransform: "uppercase", letterSpacing: "-0.02em",
                      color: isDark ? "#fff" : "#111", lineHeight: 1.2,
                    }}>{pt.label}</div>
                    <div style={{
                      fontSize: 10, color: isDark ? "#888" : "#94a3b8",
                      letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3,
                    }}>{pt.title.length > 28 ? pt.title.slice(0, 26) + "…" : pt.title}</div>
                  </div>
                )}
              </div>
            </Marker>
          );
        })}
      </Map>

      {/* Route timeline strip */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000]">
        <div className="mx-3 mb-3 rounded-[1.25rem] border border-slate-200 dark:border-[#1f1f1f] bg-white/95 dark:bg-[#111111]/95 backdrop-blur-xl shadow-2xl">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-[#0bd2b5]" style={{ boxShadow: `0 0 6px ${ACCENT}` }} />
                <span className="text-[11px] font-extrabold uppercase tracking-tight text-[#0bd2b5]">Route</span>
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888]">{points.length} stops</span>
            </div>
            <div className="flex items-center overflow-x-auto scrollbar-hide pb-0.5">
              {points.slice(0, 8).map((pt, i) => {
                const color = TYPE_COLORS[pt.type];
                const isLast = i === Math.min(points.length - 1, 7);
                const isFirst = i === 0;
                return (
                  <div key={pt.order} className="flex items-center shrink-0">
                    <div className="flex flex-col items-center" style={{ minWidth: 44 }}>
                      <div className="rounded-full flex items-center justify-center" style={{
                        width: isFirst ? 24 : 20, height: isFirst ? 24 : 20,
                        background: isFirst ? ACCENT : `${color}15`,
                        border: `1.5px solid ${isFirst ? ACCENT : color}`,
                        boxShadow: isFirst ? `0 0 10px ${ACCENT}33` : "none",
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 900, fontStyle: "italic", color: isFirst ? "#000" : color, letterSpacing: "-0.02em" }}>
                          {pt.order + 1}
                        </span>
                      </div>
                      <span className="text-xs font-extrabold uppercase tracking-tight mt-1 text-center leading-tight text-slate-500 dark:text-[#888]" style={{ maxWidth: 52 }}>
                        {pt.label.length > 8 ? pt.label.slice(0, 7) + "…" : pt.label}
                      </span>
                    </div>
                    {!isLast && (
                      <div className="flex items-center mx-0.5" style={{ marginTop: -10 }}>
                        <div style={{ width: 12, height: 1.5, background: isDark ? "#1f1f1f" : "#e2e8f0" }} />
                        {pt.type === "flight" && (
                          <Plane size={8} color={ACCENT} opacity={0.4} style={{ margin: "0 -1px" }} />
                        )}
                        <div style={{ width: 12, height: 1.5, background: isDark ? "#1f1f1f" : "#e2e8f0" }} />
                      </div>
                    )}
                  </div>
                );
              })}
              {points.length > 8 && (
                <span className="text-xs font-black ml-2 shrink-0 text-slate-500 dark:text-[#888]">+{points.length - 8}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute top-3 right-3 z-[1000] bg-white/90 dark:bg-[#111111]/90 backdrop-blur-xl border border-slate-200 dark:border-[#1f1f1f] rounded-xl px-3 py-2.5 shadow-lg">
        <div className="flex flex-col gap-2">
          {([
            { type: "flight",   label: "Flights" },
            { type: "hotel",    label: "Hotels" },
            { type: "activity", label: "Activities" },
            { type: "dining",   label: "Dining" },
          ] as const).map(({ type, label }) => (
            <div key={type} className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[type], boxShadow: `0 0 4px ${TYPE_COLORS[type]}44` }} />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
