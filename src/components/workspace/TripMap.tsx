import { useMemo, useEffect, useRef, memo, useState, useCallback } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import { Plane, Hotel, Compass, Utensils, MapPin } from "lucide-react";
import type { Trip, TravelEvent } from "@/types";
import type { Theme } from "@/types";
import { resolveCoords } from "@/data/coordinates";
import { ARC_ANIMATION_MS } from "@/config/constants";
import { EVENT_HEX } from "@/config/eventStyles";
import { geocode } from "@/services/geocode";
import { usePreferences } from "@/context/PreferencesContext";

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
interface MapPointEvent { title: string; day: number; role: "depart" | "arrive" | "stop"; otherCity?: string }
interface MapPoint {
  coords: [number, number];
  label: string;
  type: TravelEvent["type"];
  order: number;
  title: string;
  day: number;
  events: MapPointEvent[];
}

// Marching-ants dash sequences (MapLibre animate technique)
const DASH_SEQ: number[][] = [
  [0,4,3],[0.5,4,2.5],[1,4,2],[1.5,4,1.5],[2,4,1],[2.5,4,0.5],[3,4,0],
  [0,0.5,3,3.5],[0,1,3,3],[0,1.5,3,2.5],[0,2,3,2],[0,2.5,3,1.5],[0,3,3,1],[0,3.5,3,0.5],
];

/** Interpolate a point along an arc at fraction t (0→1) and compute bearing */
function interpolateArc(arc: number[][], t: number): { lng: number; lat: number; bearing: number } {
  const totalLen = arc.length - 1;
  const idx = Math.min(Math.floor(t * totalLen), totalLen - 1);
  const frac = (t * totalLen) - idx;
  const p0 = arc[idx];
  const p1 = arc[Math.min(idx + 1, totalLen)];
  const lng = p0[0] + (p1[0] - p0[0]) * frac;
  const lat = p0[1] + (p1[1] - p0[1]) * frac;
  // Bearing from p0 → p1
  const dLng = (p1[0] - p0[0]) * Math.PI / 180;
  const lat1 = p0[1] * Math.PI / 180;
  const lat2 = p1[1] * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return { lng, lat, bearing };
}

export const TripMap = memo(function TripMap({ theme, trip }: TripMapProps) {
  const isDark = theme === "dark";
  const mapRef = useRef<MapRef>(null);
  const rafRef = useRef<number>(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tappedIdx, setTappedIdx] = useState<number | null>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const { accentColor } = usePreferences();
  const ACCENT = accentColor;
  const TYPE_COLORS: Record<string, string> = {
    ...EVENT_HEX,
    flight:   ACCENT,
    activity: ACCENT,
  };

  const mapStyle = isDark
    ? "mapbox://styles/mapbox/dark-v11"
    : "mapbox://styles/mapbox/light-v11";

  const [points, setPoints] = useState<MapPoint[]>([]);

  // Per-flight arc pairs: origin→destination resolved independently
  type FlightArc = { from: [number, number]; to: [number, number]; fromLabel: string; toLabel: string };
  const [flightArcs, setFlightArcs] = useState<FlightArc[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seen = new Set<string>();
      const result: MapPoint[] = [];
      const arcs: FlightArc[] = [];
      let order = 0;
      const sortedEvents = [...trip.events]
        .filter((e) => e.type === "flight")
        .sort((a, b) =>
          a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time)
        );
      const resolve = async (loc: string): Promise<[number, number] | null> =>
        resolveCoords(loc) ?? (await geocode(loc));

      const tripStartMs = new Date(trip.start + "T00:00:00").getTime();
      const dayOf = (date: string) => {
        const ms = new Date(date + "T00:00:00").getTime();
        const n = Math.floor((ms - tripStartMs) / 86400000) + 1;
        return n > 0 ? n : 1;
      };

      const addPoint = (coords: [number, number], label: string, event: TravelEvent, day: number, role: "depart" | "arrive" | "stop" = "stop", otherCity?: string) => {
        const key = `${coords[0].toFixed(2)},${coords[1].toFixed(2)}`;
        const existing = result.find(p => `${p.coords[0].toFixed(2)},${p.coords[1].toFixed(2)}` === key);
        if (existing) {
          existing.events.push({ title: event.title, day, role, otherCity });
        } else {
          seen.add(key);
          result.push({ coords, label, type: event.type, order: order++, title: event.title, day, events: [{ title: event.title, day, role, otherCity }] });
        }
      };

      for (const event of sortedEvents) {
        const day = dayOf(event.date);
        // "STN to AYT" or "London to Antalya" — also fallback to title "STN → AYT"
        const pairMatch = event.location.match(/^(.+?)\s+to\s+(.+)$/)
          ?? (event.type === "flight" && event.title ? event.title.match(/^(.+?)\s*[→➔]\s*(.+)$/) : null);
        if (pairMatch) {
          const fromCoords = await resolve(pairMatch[1].trim());
          const toCoords = await resolve(pairMatch[2].trim());
          if (fromCoords) addPoint(fromCoords, pairMatch[1].trim(), event, day, "depart", pairMatch[2].trim());
          if (toCoords) addPoint(toCoords, pairMatch[2].trim(), event, day, "arrive", pairMatch[1].trim());
          if (fromCoords && toCoords) {
            arcs.push({ from: fromCoords, to: toCoords, fromLabel: pairMatch[1].trim(), toLabel: pairMatch[2].trim() });
          }
          continue;
        }
        // Single location
        const coords = await resolve(event.location);
        if (!coords) continue;
        addPoint(coords, event.location.split(",")[0].trim(), event, day);
      }
      if (!cancelled) {
        setPoints(result);
        setFlightArcs(arcs);
      }
    })();
    return () => { cancelled = true; };
  }, [trip.events]);

  const allCoords = useMemo(() => points.map(p => p.coords), [points]);

  type ArcFeature = { type: "Feature"; geometry: { type: "LineString"; coordinates: number[][] }; properties: Record<string, never> };
  const [arcGeoJSON, setArcGeoJSON] = useState<{ type: "FeatureCollection"; features: ArcFeature[] }>({ type: "FeatureCollection", features: [] });
  const [planePositions, setPlanePositions] = useState<{ lng: number; lat: number; bearing: number }[]>([]);
  const planeRafRef = useRef<number>(0);

  // Build one arc per flight route
  useEffect(() => {
    if (flightArcs.length === 0) {
      setArcGeoJSON({ type: "FeatureCollection", features: [] });
      return;
    }
    const features: ArcFeature[] = flightArcs.map(({ from, to }) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: buildArc(from, to).map(p => [p[1], p[0]]) },
      properties: {},
    }));
    setArcGeoJSON({ type: "FeatureCollection", features });
  }, [flightArcs]);

  // Animate a single plane cycling through all arcs
  useEffect(() => {
    if (arcGeoJSON.features.length === 0) return;
    const arcs = arcGeoJSON.features.map(f => f.geometry.coordinates);
    const TOTAL_DURATION = arcs.length * ARC_ANIMATION_MS;

    function animatePlanes(ts: number) {
      const elapsed = ts % TOTAL_DURATION;
      const arcIdx = Math.min(Math.floor(elapsed / ARC_ANIMATION_MS), arcs.length - 1);
      const t = (elapsed - arcIdx * ARC_ANIMATION_MS) / ARC_ANIMATION_MS;
      const pos = interpolateArc(arcs[arcIdx], t);
      setPlanePositions([pos]);
      planeRafRef.current = requestAnimationFrame(animatePlanes);
    }
    planeRafRef.current = requestAnimationFrame(animatePlanes);
    return () => cancelAnimationFrame(planeRafRef.current);
  }, [arcGeoJSON]);

  // Fit map to all points after first render
  useEffect(() => {
    if (!mapRef.current || allCoords.length === 0) return;
    const lngs = allCoords.map(c => c[1]);
    const lats = allCoords.map(c => c[0]);
    if (allCoords.length === 1) {
      mapRef.current.flyTo({ center: [lngs[0], lats[0]], zoom: 5, duration: 800 });
      return;
    }
    const mobile = window.innerWidth < 768;
    mapRef.current.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: mobile ? { top: 40, bottom: 100, left: 24, right: 24 } : { top: 120, bottom: 200, left: 120, right: 120 }, maxZoom: 4, duration: 1000 }
    );
  }, [allCoords]);

  // Marching-ants arc animation + strip Mapbox built-in POI/transit/place icons
  const startArcAnimation = useCallback(() => {
    const hideClutter = () => {
      const map = mapRef.current?.getMap();
      if (!map?.getStyle) return;
      try {
        const style = map.getStyle();
        for (const layer of style.layers ?? []) {
          const id = String(layer.id).toLowerCase();
          const src = String((layer as { "source-layer"?: string })["source-layer"] ?? "").toLowerCase();
          const isSymbol = layer.type === "symbol";
          const isClutter =
            /poi/.test(id) || /poi/.test(src) ||
            /transit/.test(id) ||
            (isSymbol && (/hotel|lodging|restaurant|shop|food|amenity/.test(id) || /hotel|lodging/.test(src)));
          if (isClutter) {
            map.setLayoutProperty(layer.id, "visibility", "none");
          }
        }
      } catch { /* ignore */ }
    };

    const map = mapRef.current?.getMap();
    hideClutter();
    map?.on("styledata", hideClutter);

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

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); cancelAnimationFrame(planeRafRef.current); }, []);

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
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
        onLoad={startArcAnimation}
        onClick={() => setTappedIdx(null)}
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

        {/* Animated plane icons flying along arcs */}
        {planePositions.map((pos, i) => (
          <Marker
            key={`plane-${i}`}
            longitude={pos.lng}
            latitude={pos.lat}
            anchor="center"
            style={{ zIndex: 2000 }}
          >
            <div style={{
              transform: `rotate(${pos.bearing - 45}deg)`,
              filter: `drop-shadow(0 0 6px ${ACCENT}88)`,
              transition: "transform 0.05s linear",
            }}>
              <Plane size={16} color={ACCENT} fill={ACCENT} strokeWidth={0} />
            </div>
          </Marker>
        ))}

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
                onClick={(e) => { e.stopPropagation(); setTappedIdx(prev => prev === pt.order ? null : pt.order); }}
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
                  fontSize: 10, fontWeight: 900,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 3, padding: "0 4px",
                  border: `1.5px solid ${bg}`,
                  letterSpacing: "-0.02em",
                  fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                }}>{pt.order + 1}</div>

                {/* Hover / tap tooltip */}
                {(hoveredIdx === pt.order || tappedIdx === pt.order) && (
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
                      fontWeight: 900, fontSize: 12,
                      textTransform: "uppercase", letterSpacing: "-0.02em",
                      color: isDark ? "#fff" : "#111", lineHeight: 1.2,
                    }}>{pt.label}</div>
                    {pt.events.map((ev, i) => (
                      <div key={i} style={{
                        fontSize: 10, color: isDark ? "#888" : "#94a3b8",
                        letterSpacing: "0.1em", textTransform: "uppercase", marginTop: i === 0 ? 3 : 1,
                      }}>
                        {ev.role === "depart" && ev.otherCity ? `Day ${ev.day} · Depart → ${ev.otherCity}` :
                         ev.role === "arrive" && ev.otherCity ? `Day ${ev.day} · Arrive ← ${ev.otherCity}` :
                         `Day ${ev.day}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Marker>
          );
        })}
      </Map>

      {/* Route timeline strip */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000]">
        <div className="mx-2 sm:mx-3 mb-2 sm:mb-3 rounded-2xl sm:rounded-[1.25rem] border border-slate-200 dark:border-[#1f1f1f] bg-white/95 dark:bg-[#111111]/95 backdrop-blur-xl shadow-2xl">
          <div className="px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-brand" style={{ boxShadow: `0 0 6px ${ACCENT}` }} />
                <span className="text-[11px] font-extrabold uppercase tracking-tight text-brand">Route</span>
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888]">{points.length} {points.length === 1 ? "airport" : "airports"}</span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-0.5">
              {points.map((pt, i) => {
                const color = TYPE_COLORS[pt.type] || ACCENT;
                const isLast = i === points.length - 1;
                const isFirst = i === 0;
                const Icon = TYPE_ICONS[pt.type] || MapPin;
                return (
                  <div key={pt.order} className="flex items-center shrink-0">
                    <div
                      className="flex items-center gap-2 shrink-0 rounded-full border pl-1 pr-3 py-1"
                      style={{
                        background: isFirst
                          ? `${ACCENT}14`
                          : (isDark ? "#181818" : "#f8fafc"),
                        borderColor: isFirst
                          ? `${ACCENT}55`
                          : (isDark ? "#1f1f1f" : "#e2e8f0"),
                        boxShadow: isFirst ? `0 0 14px ${ACCENT}22` : "none",
                      }}
                    >
                      <div
                        className="rounded-full flex items-center justify-center shrink-0"
                        style={{
                          width: 22, height: 22,
                          background: isFirst ? ACCENT : `${color}1f`,
                          border: `1.5px solid ${isFirst ? ACCENT : color}`,
                        }}
                      >
                        <Icon size={11} color={isFirst ? "#000" : color} strokeWidth={2.5} />
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className="text-[10px] font-black leading-none tabular-nums uppercase tracking-[0.08em]"
                          style={{ color: isFirst ? ACCENT : (isDark ? "#666" : "#94a3b8") }}
                        >
                          DAY {pt.day}
                        </span>
                        <span
                          className="text-[11px] font-extrabold uppercase tracking-tight whitespace-nowrap leading-none"
                          style={{ color: isDark ? "#e5e5e5" : "#1e293b" }}
                        >
                          {pt.label}
                        </span>
                      </div>
                    </div>
                    {!isLast && (
                      <div className="flex items-center shrink-0 px-1">
                        <div style={{ width: 6, height: 1.5, background: isDark ? "#1f1f1f" : "#e2e8f0" }} />
                        {pt.type === "flight" ? (
                          <Plane size={10} color={TYPE_COLORS.flight} style={{ opacity: 0.7, margin: "0 1px" }} />
                        ) : (
                          <div style={{ width: 3, height: 3, borderRadius: "50%", background: isDark ? "#2a2a2a" : "#cbd5e1", margin: "0 2px" }} />
                        )}
                        <div style={{ width: 6, height: 1.5, background: isDark ? "#1f1f1f" : "#e2e8f0" }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
});
