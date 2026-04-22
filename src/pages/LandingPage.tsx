import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Menu, MapPin, Plane, Hotel, ChevronLeft, ChevronRight, Calendar, Users } from "lucide-react";
import { motion } from "motion/react";
import NumberFlow from "@number-flow/react";
import { default as MapboxMap, Source, Layer, Marker } from "react-map-gl/mapbox";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/shared/Logo";
import { BRAND } from "@/config/brand";
import { LOCATION_COORDS } from "@/data/coordinates";
import { cn } from "@/lib/utils";
import type { MapRef } from "react-map-gl/mapbox";
import type { HeatmapLayerSpecification } from "mapbox-gl";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
const ACCENT = "#0bd2b5";
const fadeUp = "animate-[fade-up_0.6s_cubic-bezier(0.16,1,0.3,1)_both]";

/* ── Shared transition class for scroll-reveal sections ─────────────────── */
const revealTransition = "transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none";

/* ── Scroll-reveal hook ──────────────────────────────────────────────────── */
function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ── Scroll-driven progress (0→1 as element enters viewport) ────────────── */
function useScrollProgress<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = Math.max(0, Math.min(1, 1 - rect.top / vh));
    setProgress(p);
  }, []);
  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);
  return { ref, progress };
}

/* ── Curated destination points for the globe ────────────────────────────── */
const GLOBE_DESTINATIONS: { name: string; region: string; coords: [number, number]; trips: number; events: number; flights: number; hotels: number }[] = [
  { name: "London", region: "United Kingdom", coords: [51.47, -0.4543], trips: 4, events: 18, flights: 6, hotels: 4 },
  { name: "Nairobi", region: "Kenya", coords: [-1.3192, 36.9278], trips: 3, events: 14, flights: 4, hotels: 3 },
  { name: "Tokyo", region: "Japan", coords: [35.772, 140.3929], trips: 2, events: 12, flights: 3, hotels: 2 },
  { name: "Dubai", region: "UAE", coords: [25.2532, 55.3657], trips: 3, events: 10, flights: 4, hotels: 3 },
  { name: "Bali", region: "Indonesia", coords: [-8.7467, 115.167], trips: 2, events: 9, flights: 2, hotels: 2 },
  { name: "New York", region: "United States", coords: [40.6413, -73.7781], trips: 2, events: 11, flights: 3, hotels: 2 },
];

/* ── Flight routes between destinations (showcase arcs) ──────────────────── */
const FLIGHT_ROUTES: [number, number][] = [
  [0, 3], // London → Dubai
  [3, 1], // Dubai → Nairobi
  [0, 2], // London → Tokyo
  [2, 4], // Tokyo → Bali
  [0, 5], // London → New York
];

/* ── Great-circle arc builder ────────────────────────────────────────────── */
function buildArc(from: [number, number], to: [number, number], segments = 60): [number, number][] {
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
    points.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return points;
}

/* ── Marching-ants dash sequence (same as TripMap) ───────────────────────── */
const DASH_SEQ: number[][] = [
  [0,4,3],[0.5,4,2.5],[1,4,2],[1.5,4,1.5],[2,4,1],[2.5,4,0.5],[3,4,0],
  [0,0.5,3,3.5],[0,1,3,3],[0,1.5,3,2.5],[0,2,3,2],[0,2.5,3,1.5],[0,3,3,1],[0,3.5,3,0.5],
];

/* ── Build arc GeoJSON from routes ───────────────────────────────────────── */
function buildArcGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: FLIGHT_ROUTES.map(([fromIdx, toIdx]) => {
      const from = GLOBE_DESTINATIONS[fromIdx].coords;
      const to = GLOBE_DESTINATIONS[toIdx].coords;
      const arc = buildArc(from, to);
      return {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates: arc },
      };
    }),
  };
}

/* ── Interpolate position + bearing along an arc at fraction t ────────────── */
function interpolateArc(arc: [number, number][], t: number): { lng: number; lat: number; bearing: number } {
  const n = arc.length - 1;
  const idx = Math.min(Math.floor(t * n), n - 1);
  const frac = (t * n) - idx;
  const p0 = arc[idx], p1 = arc[Math.min(idx + 1, n)];
  const lng = p0[0] + (p1[0] - p0[0]) * frac;
  const lat = p0[1] + (p1[1] - p0[1]) * frac;
  const dLng = p1[0] - p0[0], dLat = p1[1] - p0[1];
  const bearing = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  return { lng, lat, bearing };
}

/* ── Pre-compute arcs for plane animation ────────────────────────────────── */
const PRECOMPUTED_ARCS = FLIGHT_ROUTES.map(([fromIdx, toIdx]) => {
  const from = GLOBE_DESTINATIONS[fromIdx].coords;
  const to = GLOBE_DESTINATIONS[toIdx].coords;
  return buildArc(from, to);
});

/* ── Heatmap GeoJSON from all known coordinates ──────────────────────────── */
function buildHeatmapData(): GeoJSON.FeatureCollection {
  const seen = new Set<string>();
  const features: GeoJSON.Feature[] = [];
  for (const [, [lat, lng]] of Object.entries(LOCATION_COORDS)) {
    const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: { weight: 0.6 },
    });
  }
  return { type: "FeatureCollection", features };
}

/* ── Interactive Globe ───────────────────────────────────────────────────── */
function LandingGlobe({ onReady }: { onReady?: (api: { flyTo: (idx: number) => void }) => void }) {
  const mapRef = useRef<MapRef>(null);
  const animRef = useRef<number>(0);
  const interacting = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>();
  const heatmap = useMemo(buildHeatmapData, []);
  const arcData = useMemo(buildArcGeoJSON, []);
  const dashRef = useRef<number>(0);
  const dashAnimRef = useRef<ReturnType<typeof setInterval>>();
  const [hoveredDest, setHoveredDest] = useState<string | null>(null);

  // Plane animation state
  const [planePos, setPlanePos] = useState<{ lng: number; lat: number; bearing: number } | null>(null);
  const planeRouteIdx = useRef(0);
  const planeAnimRef = useRef<number>(0);

  const startRotation = useCallback(() => {
    const spin = () => {
      const map = mapRef.current?.getMap();
      if (!map || interacting.current) return;
      const center = map.getCenter();
      center.lng += 0.015;
      map.setCenter(center);
      animRef.current = requestAnimationFrame(spin);
    };
    animRef.current = requestAnimationFrame(spin);
  }, []);

  const onInteractionStart = useCallback(() => {
    interacting.current = true;
    cancelAnimationFrame(animRef.current);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  const onInteractionEnd = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      interacting.current = false;
      startRotation();
    }, 3000);
  }, [startRotation]);

  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    map.addSource("mapbox-dem", {
      type: "raster-dem",
      url: "mapbox://mapbox.mapbox-terrain-dem-v1",
      tileSize: 512,
      maxzoom: 14,
    });
    map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
    map.setFog({
      color: "#050505",
      "high-color": "#050505",
      "horizon-blend": 0.08,
      "space-color": "#050505",
      "star-intensity": 0.25,
    } as any);

    // Hide admin lines
    for (const id of map.getStyle().layers.map((l: any) => l.id)) {
      if (id.includes("boundary") || id.includes("admin")) {
        map.setLayoutProperty(id, "visibility", "none");
      }
    }

    startRotation();

    // Marching-ants animation for flight arcs
    dashAnimRef.current = setInterval(() => {
      dashRef.current = (dashRef.current + 1) % DASH_SEQ.length;
      if (map.getLayer("arcs-dash")) {
        map.setPaintProperty("arcs-dash", "line-dasharray", DASH_SEQ[dashRef.current]);
      }
    }, 50);

    // Plane animation — cycles through all routes
    const ARC_MS = 4000;
    let planeStart = performance.now();
    const animatePlane = (now: number) => {
      const elapsed = now - planeStart;
      const t = Math.min(elapsed / ARC_MS, 1);
      const arc = PRECOMPUTED_ARCS[planeRouteIdx.current];
      if (arc) {
        const pos = interpolateArc(arc, t);
        setPlanePos(pos);
      }
      if (t >= 1) {
        planeRouteIdx.current = (planeRouteIdx.current + 1) % PRECOMPUTED_ARCS.length;
        planeStart = now;
      }
      planeAnimRef.current = requestAnimationFrame(animatePlane);
    };
    planeAnimRef.current = requestAnimationFrame(animatePlane);

    // Expose flyTo
    onReady?.({
      flyTo: (idx: number) => {
        const dest = GLOBE_DESTINATIONS[idx];
        if (!dest) return;
        onInteractionStart();
        map.flyTo({ center: [dest.coords[1], dest.coords[0]], zoom: 3.5, duration: 1800 });
        if (resumeTimer.current) clearTimeout(resumeTimer.current);
        resumeTimer.current = setTimeout(() => {
          interacting.current = false;
          startRotation();
        }, 4000);
      },
    });

  }, [startRotation, onInteractionStart, onReady]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      cancelAnimationFrame(planeAnimRef.current);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      if (dashAnimRef.current) clearInterval(dashAnimRef.current);
    };
  }, []);

  const heatmapLayer: HeatmapLayerSpecification = {
    id: "landing-heatmap",
    type: "heatmap",
    source: "heatmap-src",
    paint: {
      "heatmap-weight": ["get", "weight"],
      "heatmap-radius": 50,
      "heatmap-opacity": 0.4,
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(0,0,0,0)",
        0.2, "rgba(11,210,181,0.05)",
        0.4, "rgba(11,210,181,0.15)",
        0.6, "rgba(11,210,181,0.25)",
        0.8, "rgba(11,210,181,0.35)",
        1, "rgba(11,210,181,0.5)",
      ],
    },
  };

  return (
    <div className="absolute inset-0">
      <MapboxMap
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          longitude: 30,
          latitude: 20,
          zoom: 1.8,
        }}
        projection={{ name: "globe" as any }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        interactive={true}
        dragRotate={true}
        scrollZoom={false}
        doubleClickZoom={false}
        onLoad={onMapLoad}
        onMouseDown={onInteractionStart}
        onTouchStart={onInteractionStart}
        onMouseUp={onInteractionEnd}
        onTouchEnd={onInteractionEnd}
        onDragEnd={onInteractionEnd}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
      >
        <Source id="heatmap-src" type="geojson" data={heatmap}>
          <Layer {...heatmapLayer} />
        </Source>

        {/* Flight arc layers */}
        <Source id="arcs-src" type="geojson" data={arcData}>
          <Layer
            id="arcs-glow"
            type="line"
            paint={{
              "line-color": ACCENT,
              "line-width": 6,
              "line-opacity": 0.06,
            }}
          />
          <Layer
            id="arcs-dash"
            type="line"
            paint={{
              "line-color": ACCENT,
              "line-width": 1.5,
              "line-opacity": 0.5,
              "line-dasharray": [0, 4, 3],
            }}
          />
        </Source>

        {/* Animated plane marker */}
        {planePos && (
          <Marker longitude={planePos.lng} latitude={planePos.lat} anchor="center">
            <div
              style={{ transform: `rotate(${planePos.bearing - 45}deg)` }}
              className="drop-shadow-[0_0_6px_rgba(11,210,181,0.6)]"
            >
              <Plane className="h-4 w-4 text-brand fill-brand" />
            </div>
          </Marker>
        )}

        {GLOBE_DESTINATIONS.map((dest, i) => (
          <Marker
            key={dest.name}
            longitude={dest.coords[1]}
            latitude={dest.coords[0]}
            anchor="center"
          >
            <div
              className="relative flex items-center justify-center cursor-pointer"
              style={{ width: 48, height: 48 }}
              onMouseEnter={() => setHoveredDest(dest.name)}
              onMouseLeave={() => setHoveredDest(null)}
            >
              {/* Outer pulse ring */}
              <div
                className="absolute rounded-full animate-[dest-pin-pulse_3s_ease-in-out_infinite]"
                style={{
                  width: 42, height: 42,
                  border: `1px solid ${ACCENT}25`,
                  animationDelay: `${i * 0.3}s`,
                }}
              />
              {/* Middle ring */}
              <div
                className="absolute rounded-full animate-[dest-pin-pulse_3s_ease-in-out_infinite]"
                style={{
                  width: 26, height: 26,
                  backgroundColor: `${ACCENT}18`,
                  animationDelay: `${i * 0.3 + 0.4}s`,
                }}
              />
              {/* Center dot */}
              <div
                className="relative rounded-full border-2 border-white/30"
                style={{
                  width: 14, height: 14,
                  backgroundColor: ACCENT,
                  boxShadow: `0 0 14px ${ACCENT}88`,
                }}
              />
              {/* Hover tooltip */}
              <div
                className={cn(
                  "absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-none transition-[opacity,transform] duration-200 ease-out",
                  hoveredDest === dest.name ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2",
                )}
              >
                <div className="bg-[#111]/95 backdrop-blur-md border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
                  <div className="px-3 pt-2.5 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-2.5 w-2.5 text-brand shrink-0" />
                      <p className="text-[11px] font-black uppercase tracking-tight text-white leading-none">{dest.name}</p>
                    </div>
                    <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-[#666] mt-0.5 pl-4">{dest.region}</p>
                  </div>
                  <div className="flex items-center border-t border-white/[0.06]">
                    <div className="flex-1 px-3 py-2 text-center border-r border-white/[0.06]">
                      <p className="text-sm font-black text-white leading-none tabular-nums">{dest.trips}</p>
                      <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-[#666] mt-0.5">Trips</p>
                    </div>
                    <div className="flex-1 px-3 py-2 text-center">
                      <p className="text-sm font-black text-white leading-none tabular-nums">{dest.events}</p>
                      <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-[#666] mt-0.5">Events</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-1.5 border-t border-white/[0.06] bg-white/[0.02]">
                    <div className="flex items-center gap-1">
                      <Plane className="h-2.5 w-2.5 text-brand" />
                      <span className="text-[9px] font-bold text-[#999]">{dest.flights}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Hotel className="h-2.5 w-2.5 text-brand" />
                      <span className="text-[9px] font-bold text-[#999]">{dest.hotels}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Marker>
        ))}
      </MapboxMap>

      {/* Top + bottom gradient fades into page bg */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#050505] to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#050505] to-transparent pointer-events-none" />
    </div>
  );
}

/* ── Phone Mockup — CSS-based, no external images ────────────────────────── */
function PhoneMockup({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn("relative", className)} style={style}>
      {/* Outer device shell */}
      <div
        className="relative rounded-[1.6rem] p-[3px]"
        style={{
          background: "linear-gradient(145deg, #333 0%, #1a1a1a 50%, #2a2a2a 100%)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        {/* Inner bezel */}
        <div className="relative rounded-[1.4rem] bg-[#0a0a0a] p-[2px] overflow-hidden">
          {/* Screen */}
          <div className="relative rounded-[1.3rem] overflow-hidden bg-black">
            <img src={src} alt={alt} className="w-full h-auto block" loading="lazy" />
          </div>
        </div>
      </div>

      {/* Side buttons */}
      <div className="absolute top-[18%] -left-[2px] w-[3px] h-[24px] rounded-r-sm bg-[#2a2a2a]" />
      <div className="absolute top-[26%] -left-[2px] w-[3px] h-[46px] rounded-r-sm bg-[#2a2a2a]" />
      <div className="absolute top-[36%] -left-[2px] w-[3px] h-[46px] rounded-r-sm bg-[#2a2a2a]" />
      <div className="absolute top-[28%] -right-[2px] w-[3px] h-[68px] rounded-l-sm bg-[#2a2a2a]" />
    </div>
  );
}

/* ── Globe Section — map + minimal destination navigator ───────────────── */
function GlobeSection({ reveal }: { reveal: { ref: React.RefObject<HTMLDivElement | null>; visible: boolean } }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const globeApi = useRef<{ flyTo: (idx: number) => void } | null>(null);

  const go = useCallback((idx: number) => {
    const next = (idx + GLOBE_DESTINATIONS.length) % GLOBE_DESTINATIONS.length;
    setActiveIdx(next);
    globeApi.current?.flyTo(next);
  }, []);

  const dest = GLOBE_DESTINATIONS[activeIdx];

  return (
    <section ref={reveal.ref} className="relative overflow-hidden">
      <div className={cn(
        "relative h-[500px] sm:h-[600px]",
        revealTransition,
        reveal.visible ? "opacity-100" : "opacity-0",
      )}>
        <LandingGlobe onReady={(api) => { globeApi.current = api; }} />

        {/* Navigator — bottom center overlay */}
        <div className="absolute bottom-8 inset-x-0 flex justify-center pointer-events-none z-10">
          <div className="pointer-events-auto flex items-center gap-3 bg-[#111]/80 backdrop-blur-md border border-white/[0.06] rounded-full px-3 py-1.5">
            <button
              onClick={() => go(activeIdx - 1)}
              aria-label="Previous destination"
              className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-white/[0.06] active:bg-white/[0.1] text-[#888] hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="min-w-[120px] text-center select-none">
              <p className="text-[11px] font-black uppercase tracking-tight text-white leading-none">
                {dest.name}
              </p>
              <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-[#666] mt-0.5">
                {dest.region}
              </p>
            </div>

            <button
              onClick={() => go(activeIdx + 1)}
              aria-label="Next destination"
              className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-white/[0.06] active:bg-white/[0.1] text-[#888] hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Stats counter data ────────────────────────────────────────────────── */
const STATS = [
  { label: "Trips Built", value: 500, suffix: "+" },
  { label: "Countries", value: 12, suffix: "" },
  { label: "Travelers Served", value: 2400, suffix: "+" },
] as const;

function StatsCounter({ reveal }: { reveal: { ref: React.RefObject<HTMLDivElement | null>; visible: boolean } }) {
  const [triggered, setTriggered] = useState(false);
  useEffect(() => { if (reveal.visible) setTriggered(true); }, [reveal.visible]);

  return (
    <section ref={reveal.ref} className="py-14 sm:py-20 px-5">
      <div className={cn(
        "mx-auto max-w-3xl flex items-center justify-center gap-8 sm:gap-16",
        revealTransition,
        reveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
      )}>
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={reveal.visible ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <div className="text-2xl sm:text-4xl font-black text-white tabular-nums leading-none flex items-baseline justify-center">
              <NumberFlow value={triggered ? stat.value : 0} trend={1} />
              {stat.suffix && <span className="text-brand">{stat.suffix}</span>}
            </div>
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-[#666] mt-2">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ── Showcase event cards data ──────────────────────────────────────────── */
const SHOWCASE_EVENTS = [
  { type: "Stay", title: "The Standard, High Line", location: "Meatpacking District, NYC", time: "05:00", period: "PM", hasImage: true },
  { type: "Activity", title: "High Line Walk & Chelsea Market", location: "Chelsea, Manhattan", time: "09:00", period: "AM", hasImage: false },
  { type: "Activity", title: "Brooklyn Bridge & DUMBO Tour", location: "Brooklyn Bridge, NYC", time: "02:00", period: "PM", hasImage: false },
] as const;

/* ── Main Landing Page ───────────────────────────────────────────────────── */
export function LandingPage() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const workspaceReveal = useReveal();
  const statsReveal = useReveal();
  const destIntroReveal = useReveal();
  const mobileReveal = useReveal();
  const globeReveal = useReveal();
  const { ref: heroRef, progress: heroP } = useScrollProgress<HTMLDivElement>();
  const heroTilt = `perspective(1200px) rotateX(${6 - heroP * 6}deg) scale(${0.92 + heroP * 0.08})`;

  return (
    <div
      className="min-h-dvh bg-[#050505] text-white selection:bg-brand/30"
      style={{ "--brand-rgb": "11 210 181", "--primary": "171 85% 43%", "--ring": "171 85% 43%" } as React.CSSProperties}
    >
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#050505]/60 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="mx-auto max-w-6xl flex items-center justify-between h-14 px-5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 bg-brand rounded-lg flex items-center justify-center logo-shimmer">
              <Logo className="text-black h-4 w-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-tight">
              {BRAND.nameUpper}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <button
              onClick={() => navigate("/login")}
              className="h-9 px-4 text-[11px] font-bold uppercase tracking-wider text-[#888] hover:text-white active:text-white/80 transition-colors cursor-pointer rounded-lg hover:bg-white/[0.04]"
            >
              Sign In
            </button>
          </div>

          {/* Mobile */}
          <div className="sm:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Open menu"
                  className="h-10 w-10 flex items-center justify-center text-[#888] hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/[0.04]"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-[#0a0a0a] border-white/[0.04] w-64 p-0">
                <div className="flex flex-col h-full pt-12 px-6">
                  <button
                    onClick={() => { setMobileOpen(false); navigate("/login"); }}
                    className="h-11 text-sm font-bold uppercase tracking-wider text-[#888] hover:text-white transition-colors cursor-pointer text-left"
                  >
                    Sign In
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      {/* ── Hero — Headline ─────────────────────────────────────────── */}
      <section className="relative pt-32 sm:pt-40 pb-8 px-5 overflow-hidden">
        <div className="relative mx-auto max-w-4xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand mb-4"
          >
            Itinerary platform for travel professionals
          </motion.p>
          <h1 className="text-[clamp(2.5rem,8vw,5.5rem)] font-black uppercase leading-[0.9] tracking-[-0.02em]">
            {["Build", "trips."].map((word, i) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="inline-block mr-[0.25em]"
              >
                {word}
              </motion.span>
            ))}
            {["Share", "instantly."].map((word, i) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.5, delay: 0.4 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="inline-block mr-[0.25em] text-brand"
              >
                {word}
              </motion.span>
            ))}
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 text-[15px] sm:text-lg text-[#b0b0b0] max-w-md mx-auto leading-relaxed"
          >
            Itineraries, route maps, branded exports, and a mobile app
            your travelers will actually open.
          </motion.p>
        </div>
      </section>

      {/* ── Dashboard screenshot — scroll-driven 3D tilt ──────────── */}
      <section ref={heroRef} className="relative px-5 pb-20 sm:pb-28">
        <div
          className={cn(fadeUp, "relative mx-auto max-w-5xl will-change-transform motion-reduce:!transform-none")}
          style={{ animationDelay: "350ms", transform: heroTilt }}
        >
          <div className="relative rounded-xl ring-1 ring-white/[0.08] overflow-hidden animate-[landing-glow-pulse_4s_ease-in-out_2s_infinite]">
            <img
              src="/hero-dashboard.png"
              alt="Dalefy dashboard showing upcoming trips, countdown timer, and destination map"
              className="w-full h-auto block"
              loading="eager"
            />
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#050505] to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* ── Workspace ───────────────────────────────────────────────── */}
      <section ref={workspaceReveal.ref} className="py-20 sm:py-28 px-5">
        <div className={cn(
          "mx-auto max-w-5xl flex flex-col lg:flex-row items-center gap-10 lg:gap-16",
          revealTransition,
          workspaceReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
        )}>
          <div className="lg:w-5/12 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand mb-4">
              Itinerary Builder
            </p>
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight leading-tight mb-4">
              Every day, mapped out
            </h2>
            <p className="text-sm text-[#999] leading-relaxed mb-6">
              Flights, hotels, activities — laid out day by day with a live route map.
              Confirmation numbers, room types, terminal info. It all goes in.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="h-9 text-xs font-bold uppercase tracking-wider text-brand hover:underline underline-offset-4 cursor-pointer flex items-center gap-1.5 group"
            >
              Try the builder <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
          <div className="lg:w-7/12">
            <div className="rounded-xl ring-1 ring-white/[0.06] overflow-hidden">
              <img src="/hero-workspace.png" alt="Trip workspace with day-by-day itinerary and route map" className="w-full h-auto block" loading="lazy" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────── */}
      <StatsCounter reveal={statsReveal} />

      {/* ── Destinations intro + showcase cards ─────────────────────── */}
      <section ref={destIntroReveal.ref} className="py-20 sm:py-28 px-5">
        <div className={cn(
          "mx-auto max-w-5xl",
          revealTransition,
          destIntroReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
        )}>
          {/* Centered heading */}
          <div className="text-center mb-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand mb-4">
              Destinations
            </p>
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight leading-tight mb-4">
              Every trip, on the map
            </h2>
            <p className="text-sm text-[#999] leading-relaxed max-w-md mx-auto">
              Flight routes, destination heatmaps, and live stats
              across every trip you manage.
            </p>
          </div>

          {/* Cards row — trip card + event stack */}
          <div className="flex flex-col sm:flex-row gap-4 max-w-3xl mx-auto">
            {/* Trip card — tall image style */}
            <div className="sm:w-[220px] shrink-0 rounded-2xl overflow-hidden ring-1 ring-white/[0.06]" style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}>
              <div className="relative h-[240px] sm:h-[260px]">
                <img src="https://images.unsplash.com/photo-1523805009345-7448845a9e53?q=80&w=500&auto=format&fit=crop" alt="Kenya safari landscape with giraffe" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/80" />
                <div className="absolute top-3 left-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.12em] bg-brand/20 text-brand backdrop-blur-sm border border-brand/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
                    Active
                  </span>
                </div>
                <div className="absolute bottom-3 left-3 right-3">
                  <h4 className="text-sm font-black text-white leading-tight uppercase">Kenya Luxury Safari</h4>
                </div>
              </div>
              <div className="bg-[#111] px-3.5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 text-[#666]" />
                  <span className="text-[10px] font-bold text-[#999]">Mar 17 — Mar 24</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-[#666]" />
                  <span className="text-[10px] font-bold text-[#999]">1</span>
                </div>
              </div>
            </div>

            {/* Event cards stack */}
            <div className="flex-1 flex flex-col gap-2.5 min-w-0 justify-center">
              {SHOWCASE_EVENTS.map((ev, evIdx) => (
                <motion.div
                  key={ev.title}
                  initial={{ opacity: 0, x: 40 }}
                  animate={destIntroReveal.visible ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.2 + evIdx * 0.12, ease: [0.16, 1, 0.3, 1] }}
                  className="bg-[#111] border border-white/[0.06] rounded-xl overflow-hidden flex items-stretch"
                >
                  <div className="w-[64px] shrink-0 flex items-center justify-center">
                    {ev.hasImage ? (
                      <img src="https://images.unsplash.com/photo-1534430480872-3498386e7856?q=80&w=200&auto=format&fit=crop" alt="The Standard hotel exterior" className="w-full h-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center">
                        <MapPin className="h-3.5 w-3.5 text-brand" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 px-3 py-2.5 min-w-0">
                    <span className="text-[8px] font-bold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded bg-brand/15 text-brand">{ev.type}</span>
                    <p className="text-[11px] font-bold text-white leading-tight truncate mt-1">{ev.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="h-2 w-2 text-brand shrink-0" />
                      <span className="text-[9px] text-[#888] truncate">{ev.location}</span>
                    </div>
                  </div>
                  <div className="shrink-0 px-3 py-2.5 text-right flex flex-col justify-center">
                    <p className="text-base font-black text-white leading-none tabular-nums">{ev.time}</p>
                    <p className="text-[8px] font-bold uppercase text-[#666] mt-0.5">{ev.period}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Globe — Destinations ──────────────────────────────────── */}
      <GlobeSection reveal={globeReveal} />

      {/* ── Mobile App ──────────────────────────────────────────────── */}
      <section ref={mobileReveal.ref} className="py-20 sm:py-28 px-5 overflow-hidden">
        <div className="mx-auto max-w-5xl">
          <div className={cn(
            "flex flex-col lg:flex-row items-center gap-12 lg:gap-20",
            revealTransition,
            mobileReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
          )}>
            {/* Phones — 3-up staggered */}
            <div
              className={cn(
                "relative flex items-end justify-center lg:order-1",
                revealTransition,
                "delay-150",
                mobileReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12",
              )}
              style={{ perspective: "1200px" }}
            >
              {/* Ambient glow */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] rounded-full bg-brand/[0.06] blur-3xl" />
              </div>

              <motion.div
                initial={{ opacity: 0, y: 60, rotateY: 12 }}
                animate={mobileReveal.visible ? { opacity: 1, y: 0, rotateY: 8 } : {}}
                transition={{ duration: 0.7, delay: 0, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10"
                style={{ animation: mobileReveal.visible ? "landing-float 6s ease-in-out 1s infinite" : "none" }}
              >
                <PhoneMockup
                  src="/mobile-home.png"
                  alt="Dalefy mobile app — trips home with countdown timer"
                  className="w-[130px] sm:w-[170px]"
                  style={{ transform: "rotateX(2deg)" }}
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 80, rotateY: 0 }}
                animate={mobileReveal.visible ? { opacity: 1, y: 0, rotateY: 0 } : {}}
                transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-20 -ml-3 sm:-ml-4 mb-8 sm:mb-12"
                style={{ animation: mobileReveal.visible ? "landing-float-alt 6s ease-in-out 1.2s infinite" : "none" }}
              >
                <PhoneMockup
                  src="/mobile-trip.png"
                  alt="Dalefy mobile app — Santorini trip detail with organizer info"
                  className="w-[130px] sm:w-[170px]"
                  style={{ transform: "rotateX(2deg)" }}
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 60, rotateY: -12 }}
                animate={mobileReveal.visible ? { opacity: 1, y: 0, rotateY: -8 } : {}}
                transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 -ml-3 sm:-ml-4"
                style={{ animation: mobileReveal.visible ? "landing-float 6s ease-in-out 1.4s infinite" : "none" }}
              >
                <PhoneMockup
                  src="/mobile-itinerary.png"
                  alt="Dalefy mobile app — day itinerary with flight and hotel details"
                  className="w-[130px] sm:w-[170px]"
                  style={{ transform: "rotateX(2deg)" }}
                />
              </motion.div>
            </div>

            {/* Copy */}
            <div className="lg:w-5/12 shrink-0 text-center lg:text-left">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand mb-4">
                Mobile App
              </p>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight leading-tight mb-4">
                Their trip, their pocket
              </h2>
              <p className="text-sm text-[#999] leading-relaxed max-w-sm mx-auto lg:mx-0">
                Your travelers get a PIN, open the app, and see the full itinerary.
                No account, no download link they'll lose. Just the trip, ready to go.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="py-10 px-5 border-t border-white/[0.04]">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 bg-brand rounded-md flex items-center justify-center">
              <Logo className="text-black h-3 w-3" />
            </div>
            <span className="text-[11px] font-black uppercase tracking-tight text-[#666]">
              {BRAND.nameUpper}
            </span>
          </div>
          <p className="text-[10px] text-[#555]">
            &copy; {new Date().getFullYear()} {BRAND.name}
          </p>
        </div>
      </footer>
    </div>
  );
}
