import { useState, useMemo, useRef, useCallback } from "react";
import { Search, MapPin, Calendar as LucideCalendar, Plane, Hotel, Compass, Utensils, Globe } from "lucide-react";
import MapboxMap, { Marker, Source, Layer } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { PageHeader } from "@/components/shared/PageHeader";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

interface Destination {
  name: string;
  region: string;
  tripCount: number;
  tripNames: string[];
  eventCount: number;
  nextVisit: string;
  image: string;
  types: { flights: number; hotels: number; activities: number; dining: number };
}

const TRIP_DESTINATIONS: Record<string, { name: string; region: string }> = {
  "Kenya Luxury Safari":  { name: "Kenya",       region: "East Africa" },
  "Japan Discovery":      { name: "Japan",        region: "East Asia" },
  "Maldives Retreat":     { name: "Maldives",     region: "Indian Ocean" },
  "Amalfi Coast Tour":    { name: "Amalfi Coast", region: "Southern Europe" },
  "Iceland Coastal FAM":  { name: "Iceland",      region: "Northern Europe" },
  "Bali VIP Retreat":     { name: "Bali",         region: "Southeast Asia" },
  "Swiss Alps Winter FAM":{ name: "Swiss Alps",   region: "Central Europe" },
  "New York Urban FAM":   { name: "New York",     region: "North America" },
};

// [longitude, latitude] — react-simple-maps uses lng,lat order
const DEST_COORDS: Record<string, [number, number]> = {
  "Kenya":       [ 36.8219,  -1.2921],
  "Japan":       [139.6503,  35.6762],
  "Maldives":    [ 73.2207,   3.2028],
  "Amalfi Coast":[ 14.6027,  40.6340],
  "Iceland":     [-21.8954,  64.1355],
  "Bali":        [115.0920,  -8.3405],
  "Swiss Alps":  [  8.2275,  46.8182],
  "New York":    [-74.0060,  40.7128],
};

export function DestinationsPage() {
  const { trips } = useTrips();
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const isDark = theme === "dark";

  const destinations: Destination[] = useMemo(() => {
    const map = new Map<string, Destination>();
    trips.forEach(trip => {
      const info = TRIP_DESTINATIONS[trip.name];
      const destName = info?.name || trip.name;
      const region = info?.region || "International";
      if (!map.has(destName)) {
        map.set(destName, {
          name: destName, region, tripCount: 0, tripNames: [],
          eventCount: 0, nextVisit: trip.start, image: trip.image,
          types: { flights: 0, hotels: 0, activities: 0, dining: 0 },
        });
      }
      const dest = map.get(destName)!;
      if (!dest.tripNames.includes(trip.name)) { dest.tripCount++; dest.tripNames.push(trip.name); }
      dest.eventCount += trip.events.length;
      if (trip.start < dest.nextVisit) dest.nextVisit = trip.start;
      trip.events.forEach(e => {
        if (e.type === "flight") dest.types.flights++;
        else if (e.type === "hotel") dest.types.hotels++;
        else if (e.type === "activity") dest.types.activities++;
        else if (e.type === "dining") dest.types.dining++;
      });
    });
    return [...map.values()].sort((a, b) => b.eventCount - a.eventCount);
  }, [trips]);

  const regions = useMemo(() => {
    const unique = [...new Set(destinations.map(d => d.region))].sort();
    return ["all", ...unique];
  }, [destinations]);

  const filtered = useMemo(() => {
    let result = destinations;
    if (filter !== "all") result = result.filter(d => d.region === filter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.region.toLowerCase().includes(q) ||
        d.tripNames.some(n => n.toLowerCase().includes(q))
      );
    }
    return result;
  }, [destinations, search, filter]);

  const mapPins = useMemo(() =>
    destinations
      .map(d => ({ ...d, coords: DEST_COORDS[d.name] as [number, number] | undefined }))
      .filter((d): d is typeof d & { coords: [number, number] } => !!d.coords),
    [destinations]
  );

  type MapPin = typeof mapPins[0];
  const [hoveredPin, setHoveredPin] = useState<MapPin | null>(null);
  const mousePos = useRef({ x: 0, y: 0 });
  const mapRef = useRef<MapRef>(null);

  // On load: strip all text/symbol layers for a clean minimal look
  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.getStyle().layers.forEach(layer => {
      if (layer.type === "symbol") {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    });
  }, []);

  const connectionLines = useMemo(() => {
    const added = new Set<string>();
    type LineFeature = { type: "Feature"; geometry: { type: "LineString"; coordinates: [number, number][] }; properties: Record<string, never> };
    const features: LineFeature[] = [];
    for (const from of mapPins) {
      const nearest = [...mapPins]
        .filter(p => p.name !== from.name)
        .sort((a, b) => {
          const da = Math.hypot(from.coords[0] - a.coords[0], from.coords[1] - a.coords[1]);
          const db = Math.hypot(from.coords[0] - b.coords[0], from.coords[1] - b.coords[1]);
          return da - db;
        })
        .slice(0, 2);
      for (const to of nearest) {
        const key = [from.name, to.name].sort().join("-");
        if (!added.has(key)) {
          added.add(key);
          features.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: [from.coords, to.coords] },
            properties: {},
          });
        }
      }
    }
    return { type: "FeatureCollection" as const, features };
  }, [mapPins]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#050505]">
      <PageHeader
        left={
          <div className="max-w-md w-full relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888] group-focus-within:text-[#0bd2b5] transition-colors pointer-events-none" />
            <label htmlFor="search-destinations" className="sr-only">Search destinations</label>
            <input
              id="search-destinations"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH DESTINATIONS..."
              className="pl-12 h-11 bg-white dark:bg-[#111111] border-none rounded-full text-slate-900 dark:text-white placeholder:text-slate-500/40 dark:placeholder:text-[#888888]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 w-full text-xs font-bold tracking-widest uppercase shadow-inner"
            />
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto min-h-0">

        {/* ── World Map ── */}
        <div
          className="relative w-full overflow-hidden shrink-0 h-[440px]"
          onMouseMove={e => { mousePos.current = { x: e.clientX, y: e.clientY }; }}
        >
          <MapboxMap
            ref={mapRef}
            initialViewState={{ longitude: 10, latitude: 15, zoom: 0.35 }}
            mapStyle={isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11"}
            mapboxAccessToken={MAPBOX_TOKEN}
            projection="mercator"
            attributionControl={false}
            style={{ width: "100%", height: "100%" }}
            scrollZoom={false}
            dragPan={false}
            dragRotate={false}
            touchZoomRotate={false}
            keyboard={false}
            renderWorldCopies={false}
            onLoad={onMapLoad}
          >
            {/* Connection lines — outer glow + sharp core */}
            <Source id="connections" type="geojson" data={connectionLines}>
              <Layer
                id="connections-glow"
                type="line"
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{ "line-color": "#0bd2b5", "line-width": 8, "line-opacity": 0.07 }}
              />
              <Layer
                id="connections-mid"
                type="line"
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{ "line-color": "#0bd2b5", "line-width": 2, "line-opacity": 0.25 }}
              />
              <Layer
                id="connections-core"
                type="line"
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{ "line-color": "#0bd2b5", "line-width": 0.8, "line-opacity": 0.7 }}
              />
            </Source>

            {/* Destination markers */}
            {mapPins.map((pin, i) => (
              <Marker
                key={pin.name}
                longitude={pin.coords[0]}
                latitude={pin.coords[1]}
                anchor="center"
              >
                <div
                  style={{ position: "relative", width: 48, height: 48, cursor: "pointer" }}
                  onMouseEnter={() => setHoveredPin(pin)}
                  onMouseLeave={() => setHoveredPin(null)}
                >
                  {/* Outermost slow pulse */}
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: 48, height: 48, marginLeft: -24, marginTop: -24,
                    borderRadius: "50%",
                    border: "1px solid rgba(11,210,181,0.2)",
                    background: "rgba(11,210,181,0.06)",
                    animation: `dest-pin-pulse 3s ease-in-out ${i * 0.35}s infinite`,
                    pointerEvents: "none",
                  }} />
                  {/* Mid ring */}
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: 28, height: 28, marginLeft: -14, marginTop: -14,
                    borderRadius: "50%",
                    background: "rgba(11,210,181,0.18)",
                    animation: `dest-pin-pulse 3s ease-in-out ${i * 0.35 + 0.4}s infinite`,
                    pointerEvents: "none",
                  }} />
                  {/* Core dot */}
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: 18, height: 18, marginLeft: -9, marginTop: -9,
                    borderRadius: "50%",
                    background: "#0bd2b5",
                    border: `2px solid ${isDark ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.95)"}`,
                    boxShadow: "0 0 12px rgba(11,210,181,1), 0 0 28px rgba(11,210,181,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 2,
                  }}>
                    <span style={{
                      fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                      fontSize: 9, fontWeight: 900, fontStyle: "italic",
                      color: "#050505", lineHeight: 1,
                    }}>{pin.tripCount}</span>
                  </div>
                </div>
              </Marker>
            ))}
          </MapboxMap>

          {/* Edge vignette */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{ boxShadow: `inset 0 0 100px 35px ${isDark ? "#050505" : "#f8fafc"}` }}
          />
          {/* Subtle teal radial glow */}
          <div className="absolute inset-0 pointer-events-none z-10" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(11,210,181,0.05) 0%, transparent 65%)" }} />

          {/* Top-left label */}
          <div className="absolute top-6 left-6 z-20 pointer-events-none flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#0bd2b5] flex items-center justify-center shadow-lg shadow-[#0bd2b5]/30">
              <Globe className="h-4 w-4 text-black" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#0bd2b5] leading-none mb-1">World Coverage</p>
              <p className="text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white drop-shadow-lg leading-none">{destinations.length} Destinations</p>
            </div>
          </div>
        </div>

        {/* Tooltip — fixed to cursor */}
        {hoveredPin && (
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{ left: mousePos.current.x + 14, top: mousePos.current.y - 10 }}
          >
            <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl shadow-2xl px-4 py-3 min-w-[160px]">
              <p className="text-xs font-black italic uppercase tracking-tight text-[#0bd2b5] leading-none mb-1">{hoveredPin.name}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#888] mb-2">{hoveredPin.region}</p>
              <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-[#1f1f1f]">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-[#666]">Trips</p>
                  <p className="text-sm font-black italic text-slate-900 dark:text-white leading-none">{hoveredPin.tripCount}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-[#666]">Events</p>
                  <p className="text-sm font-black italic text-slate-900 dark:text-white leading-none">{hoveredPin.eventCount}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Cards Section ── */}
        <div className="px-4 lg:px-8 py-7 space-y-6">
          <div className="space-y-6">
            <div className="flex items-end justify-between flex-wrap gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#0bd2b5] mb-2">DAF Adventures</p>
                <h2 className="text-2xl lg:text-4xl font-extrabold uppercase tracking-tight leading-none text-slate-900 dark:text-white text-balance">Destinations</h2>
              </div>
              <div className="flex items-center gap-px rounded-2xl overflow-hidden border border-slate-200 dark:border-[#1f1f1f] shrink-0">
                {[
                  { label: "Visited", value: destinations.length },
                  { label: "Regions", value: regions.length - 1 },
                  { label: "Events", value: destinations.reduce((s, d) => s + d.eventCount, 0) },
                ].map((stat, i) => (
                  <div key={stat.label} className={`px-5 py-3 bg-white dark:bg-[#111111] flex flex-col items-center gap-0.5 ${i < 2 ? "border-r border-slate-200 dark:border-[#1f1f1f]" : ""}`}>
                    <span className="text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white leading-none">{stat.value}</span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {regions.map(r => (
                <button
                  key={r}
                  onClick={() => setFilter(r)}
                  className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-[background-color,border-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/40 ${filter === r ? "bg-[#0bd2b5] text-black shadow-lg shadow-[#0bd2b5]/20" : "bg-white dark:bg-[#111111] text-slate-500 dark:text-[#888] border border-slate-200 dark:border-[#1f1f1f] hover:border-[#0bd2b5]/40"}`}
                >
                  {r === "all" ? "All Regions" : r}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-10">
            {filtered.map((dest, idx) => (
              <div
                key={dest.name}
                className={`group relative rounded-[2rem] overflow-hidden border border-white/10 dark:border-white/5 flex flex-col min-h-[380px] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.32)] stagger-${Math.min(idx + 1, 8)}`}
                style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
              >
                <div className="absolute inset-0">
                  <img src={dest.image} alt={dest.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/5" />
                </div>
                <div className="relative z-10 flex items-start justify-between p-6">
                  <span className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] bg-black/30 text-white/70 border border-white/10">{dest.region}</span>
                  <span className="bg-black/30 text-white/60 text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-white/10">{dest.eventCount} Events</span>
                </div>
                <div className="relative z-10 mt-auto p-6">
                  <h3 className="text-3xl font-black italic uppercase tracking-tight leading-none text-white drop-shadow-2xl mb-4">{dest.name}</h3>
                  <div className="flex items-center gap-1.5 flex-wrap mb-5">
                    {dest.types.flights > 0 && (
                      <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-2 py-0.5">
                        <Plane className="h-2.5 w-2.5 text-white/70" />
                        <span className="text-[9px] font-bold text-white/70">{dest.types.flights}</span>
                      </div>
                    )}
                    {dest.types.hotels > 0 && (
                      <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-2 py-0.5">
                        <Hotel className="h-2.5 w-2.5 text-amber-300" />
                        <span className="text-[9px] font-bold text-white/70">{dest.types.hotels}</span>
                      </div>
                    )}
                    {dest.types.activities > 0 && (
                      <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-2 py-0.5">
                        <Compass className="h-2.5 w-2.5 text-[#0bd2b5]" />
                        <span className="text-[9px] font-bold text-white/70">{dest.types.activities}</span>
                      </div>
                    )}
                    {dest.types.dining > 0 && (
                      <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-2 py-0.5">
                        <Utensils className="h-2.5 w-2.5 text-pink-300" />
                        <span className="text-[9px] font-bold text-white/70">{dest.types.dining}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-white/10">
                    <div className="flex items-center gap-1.5">
                      <LucideCalendar className="h-3 w-3 text-[#0bd2b5]" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-white/60">
                        {new Date(dest.nextVisit).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-white/40" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-white/60">
                        {dest.tripCount} {dest.tripCount === 1 ? "Trip" : "Trips"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
