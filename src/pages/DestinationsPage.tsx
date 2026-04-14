import { useState, useMemo, useRef } from "react";
import { Search, MapPin, Calendar as LucideCalendar, Plane, Hotel, Compass, Utensils, Sun, Moon, Globe } from "lucide-react";
import { ComposableMap, Geographies, Geography, Graticule, Line, Marker, Sphere } from "react-simple-maps";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { NotificationPanel } from "@/components/shared/NotificationPanel";
import { MobileSidebar } from "@/components/sidebar/MobileSidebar";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

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
  const { theme, toggleTheme } = useTheme();
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

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#050505]">
      <header className="h-20 shrink-0 border-b border-slate-200 dark:border-[#1f1f1f] px-4 lg:px-10 flex items-center justify-between sticky top-0 z-40 bg-slate-50/80 dark:bg-[#050505]/80 backdrop-blur-md">
        <div className="flex-1 flex items-center gap-4 lg:gap-8">
          <MobileSidebar />
          <div className="max-w-md w-full relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888] group-focus-within:text-[#0bd2b5] transition-colors" />
            <label htmlFor="search-destinations" className="sr-only">Search destinations</label>
            <input
              id="search-destinations"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH DESTINATIONS..."
              className="pl-12 h-12 bg-white dark:bg-[#111111] border-none rounded-full text-slate-900 dark:text-white placeholder:text-slate-500/40 dark:placeholder:text-[#888888]/40 focus:outline-none focus:ring-2 focus:ring-[#0bd2b5]/20 w-full text-xs font-bold tracking-widest uppercase shadow-inner"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 lg:gap-6">
          <button aria-label="Toggle theme" onClick={toggleTheme} className="h-11 w-11 rounded-full bg-white dark:bg-[#111111] hover:bg-slate-100 dark:hover:bg-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:text-[#0bd2b5] transition-all border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center cursor-pointer shadow-sm">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <NotificationPanel />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0">

        {/* ── World Map ── */}
        <div
          className="relative w-full overflow-hidden shrink-0"
          style={{ background: isDark ? "#050505" : "#f8fafc" }}
          onMouseMove={e => { mousePos.current = { x: e.clientX, y: e.clientY }; }}
        >
          <ComposableMap
            projection="geoNaturalEarth1"
            projectionConfig={{ scale: 160, center: [15, 10] }}
            style={{ width: "100%", height: "auto", display: "block" }}
          >
            {/* Ocean fill */}
            <Sphere id="ocean" fill={isDark ? "#0a0a0a" : "#e8edf2"} stroke="none" />

            {/* Lat/lng graticule grid */}
            <Graticule stroke={isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.03)"} strokeWidth={0.3} />

            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map(geo => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={isDark ? "#161616" : "#f8fafc"}
                    stroke={isDark ? "#252525" : "#dde3ea"}
                    strokeWidth={0.4}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: isDark ? "#1e1e1e" : "#f1f5f9" },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>

            {/* Nearest-neighbour connections — each pin links to its 2 closest only */}
            {mapPins.flatMap(from => {
              const dist = ([ax, ay]: [number, number], [bx, by]: [number, number]) =>
                Math.hypot(ax - bx, ay - by);
              const nearest = [...mapPins]
                .filter(p => p.name !== from.name)
                .sort((a, b) => dist(from.coords, a.coords) - dist(from.coords, b.coords))
                .slice(0, 2);
              return nearest.map(to => {
                const key = [from.name, to.name].sort().join("-");
                return (
                  <Line
                    key={key}
                    from={from.coords}
                    to={to.coords}
                    stroke="#0bd2b5"
                    strokeWidth={0.35}
                    strokeOpacity={0.2}
                    strokeLinecap="round"
                    style={{ fill: "none", pointerEvents: "none" }}
                  />
                );
              });
            })}

            {/* Destination markers */}
            {mapPins.map((pin, i) => (
              <Marker key={pin.name} coordinates={pin.coords}>
                {/* Animated pulse ring */}
                <circle
                  r={10}
                  fill="rgba(11,210,181,0.15)"
                  style={{
                    animation: `dest-ring-pulse 2.5s ease-in-out ${i * 0.3}s infinite`,
                    transformBox: "fill-box",
                    transformOrigin: "center",
                    pointerEvents: "none",
                  }}
                />
                {/* Hover hit area */}
                <circle
                  r={14}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredPin(pin)}
                  onMouseLeave={() => setHoveredPin(null)}
                />
                {/* Main dot */}
                <circle
                  r={7}
                  fill="#0bd2b5"
                  stroke={isDark ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.6)"}
                  strokeWidth={1.5}
                  style={{ filter: "drop-shadow(0 0 6px rgba(11,210,181,0.8))", cursor: "pointer", pointerEvents: "none" }}
                />
                <text
                  textAnchor="middle"
                  y={3}
                  style={{
                    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                    fontSize: 7, fontWeight: 900, fontStyle: "italic",
                    fill: "#050505", pointerEvents: "none", userSelect: "none",
                  }}
                >
                  {pin.tripCount}
                </text>
              </Marker>
            ))}
          </ComposableMap>

          {/* Edge vignette */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{ boxShadow: `inset 0 0 80px 30px ${isDark ? "#050505" : "#f8fafc"}` }}
          />
          {isDark && (
            <div className="absolute inset-0 pointer-events-none z-10" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(11,210,181,0.04) 0%, transparent 70%)" }} />
          )}

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
        <div className="px-4 lg:px-10 py-10 space-y-8">
          <div className="space-y-6">
            <div className="flex items-end justify-between flex-wrap gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#0bd2b5] mb-2">DAF Adventures</p>
                <h2 className="text-4xl lg:text-6xl font-extrabold uppercase tracking-tight leading-none text-slate-900 dark:text-white">Destinations</h2>
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
                  className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/40 ${filter === r ? "bg-[#0bd2b5] text-black shadow-lg shadow-[#0bd2b5]/20" : "bg-white dark:bg-[#111111] text-slate-500 dark:text-[#888] border border-slate-200 dark:border-[#1f1f1f] hover:border-[#0bd2b5]/40"}`}
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
