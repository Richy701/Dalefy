import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapPin, Calendar as LucideCalendar, Plane, Hotel, Compass, Utensils, Globe, ChevronLeft, ChevronRight } from "lucide-react";
import MapboxMap, { Marker, Source, Layer } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { usePreferences } from "@/context/PreferencesContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { BrandIllustration } from "@/components/shared/BrandIllustration";
import { resolveCoords } from "@/data/coordinates";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

interface Destination {
  name: string;
  region: string;
  tripCount: number;
  tripNames: string[];
  tripIds: string[];
  eventCount: number;
  nextVisit: string;
  image: string;
  types: { flights: number; hotels: number; activities: number; dining: number };
}

// Cache geocoded coordinates in memory so we don't re-fetch on every render
const geocodeCache: Record<string, [number, number] | null> = {};

async function geocodeDestination(name: string): Promise<[number, number] | null> {
  if (name in geocodeCache) return geocodeCache[name];
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(name)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
    );
    const json = await res.json();
    const center = json.features?.[0]?.center as [number, number] | undefined;
    const region = json.features?.[0]?.context?.find((c: { id: string }) => c.id.startsWith("country"))?.text ?? "International";
    geocodeCache[name] = center ?? null;
    return center ?? null;
  } catch {
    geocodeCache[name] = null;
    return null;
  }
}

export function DestinationsPage() {
  const { trips } = useTrips();
  const { theme } = useTheme();
  const { accentColor } = usePreferences();
  const ACCENT = accentColor;
  const ACCENT_RGB = (() => { const r = parseInt(accentColor.slice(1, 3), 16), g = parseInt(accentColor.slice(3, 5), 16), b = parseInt(accentColor.slice(5, 7), 16); return `${r}, ${g}, ${b}`; })();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const isDark = theme === "dark";

  const destinations: Destination[] = useMemo(() => {
    const map = new Map<string, Destination>();
    trips.forEach(trip => {
      // Derive destination from trip data — prioritise real place names
      const INVALID_DEST = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|tbd|tba|n\/a)$/i;
      // Collect hotel names so we can reject them as destinations
      const hotelNames = new Set(
        trip.events.filter(e => e.type === "hotel").map(e => e.location.toLowerCase()),
      );
      const isHotelName = (n: string) => {
        const lower = n.toLowerCase();
        return hotelNames.has(lower) || [...hotelNames].some(h => h.includes(lower) || lower.includes(h));
      };

      let destName = "";
      // 1. Use trip.destination if it's a real place (not a month, not a hotel name)
      if (trip.destination && !INVALID_DEST.test(trip.destination.trim()) && !isHotelName(trip.destination.trim())) {
        destName = trip.destination;
      }
      // 2. Extract from flight "X to Y" locations
      if (!destName) {
        const flights = trip.events
          .filter(e => e.type === "flight")
          .sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time));
        for (const f of flights) {
          const match = f.location.match(/^.+?\s+to\s+(.+)$/i);
          if (match) { destName = match[1].trim(); break; }
        }
      }
      // 3. Try activity locations (often contain city/region names)
      if (!destName) {
        const activity = trip.events.find(e => e.type === "activity" && e.location);
        if (activity) destName = activity.location;
      }
      // 4. Last resort: use trip name
      if (!destName) destName = trip.name;
      if (!map.has(destName)) {
        map.set(destName, {
          name: destName, region: "International", tripCount: 0, tripNames: [], tripIds: [],
          eventCount: 0, nextVisit: trip.start, image: trip.image,
          types: { flights: 0, hotels: 0, activities: 0, dining: 0 },
        });
      }
      const dest = map.get(destName)!;
      if (!dest.tripNames.includes(trip.name)) {
        dest.tripCount++;
        dest.tripNames.push(trip.name);
        dest.tripIds.push(trip.id);
      }
      dest.eventCount += trip.events.length;
      // Prefer the nearest future date; fall back to the most recent past date
      const today = new Date().toISOString().slice(0, 10);
      const isFuture = trip.start >= today;
      const currentIsFuture = dest.nextVisit >= today;
      if (isFuture && !currentIsFuture) {
        dest.nextVisit = trip.start;
      } else if (isFuture && currentIsFuture) {
        if (trip.start < dest.nextVisit) dest.nextVisit = trip.start;
      } else if (!isFuture && !currentIsFuture) {
        if (trip.start > dest.nextVisit) dest.nextVisit = trip.start;
      }
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

  const [geoCoords, setGeoCoords] = useState<Record<string, [number, number]>>({});

  useEffect(() => {
    const resolve = (name: string) => {
      // Try local coordinate lookup first (handles airport codes like LHR, NBO)
      const local = resolveCoords(name);
      if (local) {
        // resolveCoords returns [lat, lng], normalize to [lng, lat] for Mapbox
        setGeoCoords(prev => ({ ...prev, [name]: [local[1], local[0]] }));
        return;
      }
      // Fall back to Mapbox geocoding API
      if (name in geocodeCache) {
        const cached = geocodeCache[name];
        if (cached) setGeoCoords(prev => ({ ...prev, [name]: cached }));
      } else {
        geocodeDestination(name).then(coords => {
          if (coords) setGeoCoords(prev => ({ ...prev, [name]: coords }));
        });
      }
    };
    destinations.forEach(d => resolve(d.name));
  }, [destinations]);

  const mapPins = useMemo(() => {
    return destinations
      .map(d => ({ ...d, coords: geoCoords[d.name] as [number, number] | undefined }))
      .filter((d): d is typeof d & { coords: [number, number] } => !!d.coords);
  }, [destinations, geoCoords]);

  const heatmapGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: mapPins.map(p => ({
      type: "Feature" as const,
      properties: { weight: Math.min(p.tripCount / 3, 1) },
      geometry: { type: "Point" as const, coordinates: p.coords },
    })),
  }), [mapPins]);

  type MapPin = typeof mapPins[0];
  const [hoveredPin, setHoveredPin] = useState<MapPin | null>(null);
  const [tappedPin, setTappedPin] = useState<MapPin | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const mousePos = useRef({ x: 0, y: 0 });
  const mapRef = useRef<MapRef>(null);


  // Navigate between destinations
  const flyToPin = useCallback((idx: number) => {
    const map = mapRef.current?.getMap();
    if (!map || mapPins.length === 0) return;
    const pin = mapPins[idx % mapPins.length];
    setActiveIdx(idx % mapPins.length);
    map.flyTo({ center: pin.coords, zoom: 4, duration: 1500 });
  }, [mapPins]);

  const handlePrev = useCallback(() => {
    const next = (activeIdx - 1 + mapPins.length) % mapPins.length;
    flyToPin(next);
  }, [activeIdx, mapPins.length, flyToPin]);

  const handleNext = useCallback(() => {
    const next = (activeIdx + 1) % mapPins.length;
    flyToPin(next);
  }, [activeIdx, mapPins.length, flyToPin]);

  // On load: add 3D terrain + fly to destinations
  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    try {
      const cardBg = isDark ? "rgb(17, 17, 17)" : "rgb(255, 255, 255)";
      map.setFog({
        color: cardBg,
        "high-color": cardBg,
        "horizon-blend": 0.02,
        "space-color": cardBg,
        "star-intensity": isDark ? 0.1 : 0,
      } as Parameters<typeof map.setFog>[0]);
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      // Hide admin boundary lines in dark mode — they bleed through the banner
      if (isDark) {
        map.getStyle().layers?.forEach((layer: any) => {
          if (layer.id.includes("boundary") || layer.id.includes("admin")) {
            map.setLayoutProperty(layer.id, "visibility", "none");
          }
        });
      }
      // Fly to destination pins on map load (works on page switch too)
      if (mapPins.length === 1) {
        map.flyTo({ center: mapPins[0].coords, zoom: 4, duration: 2000 });
      } else if (mapPins.length > 1) {
        const lngs = mapPins.map(p => p.coords[0]);
        const lats = mapPins.map(p => p.coords[1]);
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 60, maxZoom: 5, duration: 2000 }
        );
      }
    } catch { /* older mapbox versions */ }
  }, [isDark, mapPins]);


  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#050505]">
      <PageHeader
        left={destinations.length > 0 ? (
          <div className="max-w-[160px] sm:max-w-md w-full relative group">
            <Search className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 h-3.5 sm:h-4 w-3.5 sm:w-4 text-slate-500 dark:text-[#888888] group-focus-within:text-brand transition-colors pointer-events-none" />
            <label htmlFor="search-destinations" className="sr-only">Search destinations</label>
            <input
              id="search-destinations"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-9 sm:pl-12 h-10 sm:h-11 bg-white dark:bg-[#111111] border-none rounded-full text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 w-full text-xs font-bold tracking-widest uppercase shadow-inner"
            />
          </div>
        ) : undefined}
      />

      <div className="flex-1 overflow-y-auto min-h-0">

        {destinations.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-full gap-3 px-4">
            <BrandIllustration src="/illustrations/illus-movement.svg" className="w-72 h-72 object-contain translate-x-10" draggable={false} />
            <div className="text-center space-y-1.5">
              <p className="text-base font-black uppercase tracking-widest text-slate-800 dark:text-white">No destinations yet</p>
              <p className="text-xs font-medium text-slate-400 dark:text-[#666]">Create trips to populate your world map</p>
            </div>
            <button
              onClick={() => navigate("/dashboard")}
              className="h-10 px-6 rounded-full bg-brand text-[#050505] text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
            >
              Create a Trip
            </button>
          </div>
        ) : (<>

        {/* ── Hero Banner ── */}
        <div className="px-3 sm:px-4 lg:px-8 pt-4 sm:pt-6 pb-2">
          {/* Banner — same style as dashboard */}
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-brand/15 via-brand/[0.03] to-slate-50 dark:from-brand/15 dark:via-brand/[0.03] dark:to-[#0a0a0a] border border-slate-200/50 dark:border-[#1f1f1f]">
            {/* Mobile: stacked layout / Desktop: side-by-side */}
            <div className="flex flex-col sm:flex-row sm:items-stretch sm:h-[420px] lg:h-[520px]">
              {/* Text content */}
              <div className="relative z-10 px-5 py-6 sm:px-6 sm:py-0 sm:max-w-[50%] flex flex-col justify-center lg:px-8">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-slate-900 dark:text-white leading-none">
                  Destinations
                </h1>
                <div className="mt-3 sm:mt-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] mb-2">Your Travel Footprint</p>
                  <span className="block text-5xl sm:text-6xl lg:text-7xl font-black leading-[0.85] tracking-tighter text-slate-900 dark:text-white tabular-nums">
                    {destinations.length}
                  </span>
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 dark:text-[#ccc] flex-wrap">
                    <MapPin className="h-3 w-3 text-brand" />
                    {destinations.length === 1 ? "Destination" : "Destinations"} · {regions.length - 1} {regions.length - 1 === 1 ? "Region" : "Regions"} · {destinations.reduce((s, d) => s + d.eventCount, 0)} Events
                  </p>
                </div>
              </div>
              {/* Globe map — below text on mobile, right side on sm+ */}
              <div
                className="relative h-[220px] sm:h-auto sm:flex-1 overflow-hidden rounded-b-2xl sm:rounded-b-none sm:rounded-r-3xl"
                onMouseMove={e => { mousePos.current = { x: e.clientX, y: e.clientY }; }}
              >
              <MapboxMap
                ref={mapRef}
                initialViewState={{ longitude: 10, latitude: 20, zoom: 1.5 }}
                mapStyle={isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11"}
                mapboxAccessToken={MAPBOX_TOKEN}
                projection="globe"
                attributionControl={false}
                style={{ width: "100%", height: "100%" }}
                scrollZoom={false}
                dragPan={true}
                dragRotate={true}
                touchZoomRotate={true}
                keyboard={false}
                onLoad={onMapLoad}
              >
                <Source id="heatmap-data" type="geojson" data={heatmapGeoJSON}>
                  <Layer
                    id="dest-heatmap"
                    type="heatmap"
                    paint={{
                      "heatmap-weight": ["get", "weight"],
                      "heatmap-intensity": 0.6,
                      "heatmap-radius": 40,
                      "heatmap-opacity": 0.5,
                      "heatmap-color": [
                        "interpolate", ["linear"], ["heatmap-density"],
                        0, "rgba(0,0,0,0)",
                        0.2, `rgba(${ACCENT_RGB},0.15)`,
                        0.4, `rgba(${ACCENT_RGB},0.3)`,
                        0.6, `rgba(${ACCENT_RGB},0.5)`,
                        0.8, `rgba(${ACCENT_RGB},0.7)`,
                        1, ACCENT,
                      ],
                    }}
                  />
                </Source>
                {mapPins.map((pin, i) => (
                  <Marker key={pin.name} longitude={pin.coords[0]} latitude={pin.coords[1]} anchor="center">
                    <div
                      style={{ position: "relative", width: 48, height: 48, cursor: "pointer" }}
                      onMouseEnter={() => setHoveredPin(pin)}
                      onMouseLeave={() => setHoveredPin(null)}
                      onClick={(e) => { e.stopPropagation(); setTappedPin(prev => prev?.name === pin.name ? null : pin); }}
                    >
                      <div style={{
                        position: "absolute", top: "50%", left: "50%",
                        width: 48, height: 48, marginLeft: -24, marginTop: -24, borderRadius: "50%",
                        border: `1px solid rgba(${ACCENT_RGB},0.2)`,
                        background: `rgba(${ACCENT_RGB},0.06)`,
                        animation: `dest-pin-pulse 3s ease-in-out ${i * 0.35}s infinite`,
                        pointerEvents: "none",
                      }} />
                      <div style={{
                        position: "absolute", top: "50%", left: "50%",
                        width: 28, height: 28, marginLeft: -14, marginTop: -14, borderRadius: "50%",
                        background: `rgba(${ACCENT_RGB},0.18)`,
                        animation: `dest-pin-pulse 3s ease-in-out ${i * 0.35 + 0.4}s infinite`,
                        pointerEvents: "none",
                      }} />
                      <div style={{
                        position: "absolute", top: "50%", left: "50%",
                        width: 18, height: 18, marginLeft: -9, marginTop: -9, borderRadius: "50%",
                        background: ACCENT,
                        border: `2px solid ${isDark ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.95)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
                      }}>
                        <span style={{
                          fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                          fontSize: 9, fontWeight: 900, color: "#050505", lineHeight: 1,
                        }}>{pin.tripCount}</span>
                      </div>
                    </div>
                  </Marker>
                ))}
              </MapboxMap>
              {/* Nav buttons — bottom right of globe */}
              {mapPins.length > 1 && (
                <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-white/90 dark:bg-[#111111]/90 backdrop-blur-sm rounded-full border border-slate-200 dark:border-[#1f1f1f] shadow-lg px-1 py-1">
                    <button
                      onClick={handlePrev}
                      className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-[#1a1a1a] active:bg-slate-200 dark:active:bg-[#222] transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-[#aaa]" />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-[#888] px-1 min-w-[60px] text-center truncate">
                      {mapPins[activeIdx]?.name?.split(",")[0] || `${activeIdx + 1}/${mapPins.length}`}
                    </span>
                    <button
                      onClick={handleNext}
                      className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-[#1a1a1a] active:bg-slate-200 dark:active:bg-[#222] transition-colors"
                    >
                      <ChevronRight className="h-4 w-4 text-slate-600 dark:text-[#aaa]" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>{/* end flex row/col */}
          </div>
        </div>

        {/* Tooltip — fixed to cursor (desktop) or centered (mobile tap) */}
        {(hoveredPin || tappedPin) && (() => {
          const pin = hoveredPin || tappedPin;
          if (!pin) return null;
          return (
          <div
            className="fixed z-[9999] pointer-events-none"
            style={hoveredPin ? { left: mousePos.current.x + 16, top: mousePos.current.y - 16 } : { left: "50%", bottom: 24, transform: "translateX(-50%)" }}
          >
            <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl shadow-2xl min-w-[200px] overflow-hidden">
              {/* Header */}
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-5 w-5 rounded-lg flex items-center justify-center" style={{ background: `rgba(${ACCENT_RGB},0.15)` }}>
                    <MapPin className="h-2.5 w-2.5" style={{ color: ACCENT }} />
                  </div>
                  <p className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white leading-none">{pin.name}</p>
                </div>
                <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666] pl-7">{pin.region}</p>
              </div>
              {/* Stats */}
              <div className="flex items-center border-t border-slate-100 dark:border-[#1a1a1a]">
                <div className="flex-1 px-4 py-2.5 text-center border-r border-slate-100 dark:border-[#1a1a1a]">
                  <p className="text-base font-black text-slate-900 dark:text-white leading-none tabular-nums">{pin.tripCount}</p>
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#666] mt-1">{pin.tripCount === 1 ? "Trip" : "Trips"}</p>
                </div>
                <div className="flex-1 px-4 py-2.5 text-center">
                  <p className="text-base font-black text-slate-900 dark:text-white leading-none tabular-nums">{pin.eventCount}</p>
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#666] mt-1">Events</p>
                </div>
              </div>
              {/* Event type breakdown */}
              {(pin.types.flights > 0 || pin.types.hotels > 0 || pin.types.activities > 0 || pin.types.dining > 0) && (
                <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-100 dark:border-[#1a1a1a] bg-slate-50 dark:bg-[#0a0a0a]">
                  {pin.types.flights > 0 && (
                    <div className="flex items-center gap-1">
                      <Plane className="h-2.5 w-2.5" style={{ color: ACCENT }} />
                      <span className="text-[9px] font-bold text-slate-500 dark:text-[#888]">{pin.types.flights}</span>
                    </div>
                  )}
                  {pin.types.hotels > 0 && (
                    <div className="flex items-center gap-1">
                      <Hotel className="h-2.5 w-2.5 text-amber-500" />
                      <span className="text-[9px] font-bold text-slate-500 dark:text-[#888]">{pin.types.hotels}</span>
                    </div>
                  )}
                  {pin.types.activities > 0 && (
                    <div className="flex items-center gap-1">
                      <Compass className="h-2.5 w-2.5" style={{ color: ACCENT }} />
                      <span className="text-[9px] font-bold text-slate-500 dark:text-[#888]">{pin.types.activities}</span>
                    </div>
                  )}
                  {pin.types.dining > 0 && (
                    <div className="flex items-center gap-1">
                      <Utensils className="h-2.5 w-2.5 text-pink-400" />
                      <span className="text-[9px] font-bold text-slate-500 dark:text-[#888]">{pin.types.dining}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* ── Cards Section ── */}
        <div className="px-3 sm:px-4 lg:px-8 py-5 sm:py-7 space-y-4 sm:space-y-6">
          <div className="space-y-6">
            <div className="flex gap-2 flex-wrap">
              {regions.map(r => (
                <button
                  key={r}
                  onClick={() => setFilter(r)}
                  className={`px-3 sm:px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-[background-color,border-color,color,box-shadow,transform] active:scale-95 focus-visible:ring-2 focus-visible:ring-brand/40 ${filter === r ? "bg-brand text-black" : "bg-white dark:bg-[#111111] text-slate-500 dark:text-[#888] border border-slate-200 dark:border-[#1f1f1f] hover:border-brand/40"}`}
                >
                  {r === "all" ? "All Regions" : r}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6 pb-10">
            {filtered.map((dest, idx) => (
              <div
                key={dest.name}
                onClick={() => dest.tripIds[0] && navigate(`/trip/${dest.tripIds[0]}`)}
                className={`group relative rounded-2xl sm:rounded-[2rem] overflow-hidden border border-white/10 dark:border-white/5 flex flex-col min-h-[320px] sm:min-h-[380px] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 active:scale-[0.98] hover:shadow-[0_12px_28px_rgba(0,0,0,0.32)] cursor-pointer stagger-${Math.min(idx + 1, 8)}`}
                style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
              >
                <div className="absolute inset-0">
                  <img src={dest.image} alt={dest.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/5" />
                </div>
                <div className="relative z-10 flex items-start justify-between p-6">
                  <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-black/50 text-white border border-white/15">{dest.region}</span>
                  <span className="bg-black/50 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border border-white/15">{dest.eventCount} Events</span>
                </div>
                <div className="relative z-10 mt-auto p-6">
                  <h3 className="text-3xl font-black uppercase tracking-tight leading-none text-white drop-shadow-2xl mb-4">{dest.name}</h3>
                  <div className="flex items-center gap-1.5 flex-wrap mb-5">
                    {dest.types.flights > 0 && (
                      <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm border border-white/15 rounded-full px-2 py-0.5">
                        <Plane className="h-2.5 w-2.5 text-white/90" />
                        <span className="text-[10px] font-bold text-white/90">{dest.types.flights}</span>
                      </div>
                    )}
                    {dest.types.hotels > 0 && (
                      <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm border border-white/15 rounded-full px-2 py-0.5">
                        <Hotel className="h-2.5 w-2.5 text-amber-300" />
                        <span className="text-[10px] font-bold text-white/90">{dest.types.hotels}</span>
                      </div>
                    )}
                    {dest.types.activities > 0 && (
                      <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm border border-white/15 rounded-full px-2 py-0.5">
                        <Compass className="h-2.5 w-2.5 text-brand" />
                        <span className="text-[10px] font-bold text-white/90">{dest.types.activities}</span>
                      </div>
                    )}
                    {dest.types.dining > 0 && (
                      <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm border border-white/15 rounded-full px-2 py-0.5">
                        <Utensils className="h-2.5 w-2.5 text-pink-300" />
                        <span className="text-[10px] font-bold text-white/90">{dest.types.dining}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-white/15">
                    <div className="flex items-center gap-1.5">
                      <LucideCalendar className="h-3 w-3 text-brand" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">
                        {new Date(dest.nextVisit).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-white/70" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">
                        {dest.tripCount} {dest.tripCount === 1 ? "Trip" : "Trips"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        </>)}
      </div>
    </div>
  );
}
