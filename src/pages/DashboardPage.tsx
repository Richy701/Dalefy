import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus, Search, Plane, Calendar as LucideCalendar, Trash2, ArrowUpRight,
  MoreVertical, LayoutGrid, List, ExternalLink, Users, Sun, Moon,
  MapPin, DollarSign, Briefcase, Expand, Hotel, Utensils, Compass, Globe,
  Heart, Share2, Star
} from "lucide-react";
import NumberFlow from "@number-flow/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import type { DisplayMode, Trip } from "@/types";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { useTripStats } from "@/hooks/useTripStats";
import { NotificationPanel } from "@/components/shared/NotificationPanel";
import { ImportItineraryDialog } from "@/components/shared/ImportItineraryDialog";
import { InviteTeamDialog } from "@/components/shared/InviteTeamDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MobileSidebar } from "@/components/sidebar/MobileSidebar";
import { ComposableMap, Geographies, Geography, Marker, Sphere, Graticule } from "react-simple-maps";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const DEST_COORDS: Record<string, [number, number]> = {
  "Kenya":        [ 36.8219,  -1.2921],
  "Japan":        [139.6503,  35.6762],
  "Maldives":     [ 73.2207,   3.2028],
  "Amalfi Coast": [ 14.6027,  40.6340],
  "Iceland":      [-21.8954,  64.1355],
  "Bali":         [115.0920,  -8.3405],
  "Swiss Alps":   [  8.2275,  46.8182],
  "New York":     [-74.0060,  40.7128],
};

const TRIP_DEST: Record<string, string> = {
  "Kenya Luxury Safari":   "Kenya",
  "Japan Discovery":       "Japan",
  "Maldives Retreat":      "Maldives",
  "Amalfi Coast Tour":     "Amalfi Coast",
  "Iceland Coastal FAM":   "Iceland",
  "Bali VIP Retreat":      "Bali",
  "Swiss Alps Winter FAM": "Swiss Alps",
  "New York Urban FAM":    "New York",
};

const EVENT_TAGS: Record<string, string[]> = {
  activity: ["Experience", "Adventure", "Culture"],
  hotel:    ["Luxury", "Stay", "Comfort"],
  dining:   ["Food", "Local Cuisine", "Dining"],
  flight:   ["Transfer", "Flight", "Transit"],
};

const EVENT_COLORS = {
  activity: { bg: "bg-[#0bd2b5]/10", text: "text-[#0bd2b5]", Icon: Compass },
  hotel:    { bg: "bg-amber-400/10",  text: "text-amber-500",  Icon: Hotel },
  dining:   { bg: "bg-pink-400/10",   text: "text-pink-500",   Icon: Utensils },
  flight:   { bg: "bg-blue-400/10",   text: "text-blue-500",   Icon: Plane },
};

function daysUntil(dateStr: string) {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000));
}
function tripDuration(start: string, end: string) {
  return Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
}
function fakeRating(seed: number) {
  return (4.2 + (seed % 8) * 0.1).toFixed(1);
}
function fakeReviews(seed: number) {
  return 28 + (seed % 7) * 13;
}


export function DashboardPage() {
  const { trips, addTrip, deleteTrip } = useTrips();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const { showToast, addNotification } = useNotifications();
  const stats = useTripStats(trips);
  const navigate = useNavigate();

  const [displayMode, setDisplayMode] = useState<DisplayMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewTripOpen, setIsNewTripOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [newTripData, setNewTripData] = useState<{
    name: string; attendees: string; dateRange: DateRange | undefined; image: string;
    destination: string; paxCount: string; tripType: string; budget: string; currency: string;
  }>({ name: "", attendees: "", dateRange: undefined, image: "", destination: "", paxCount: "", tripType: "", budget: "", currency: "USD" });

  const isDark = theme === "dark";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const firstName = user?.name?.split(" ")[0] || "Traveller";

  const filteredTrips = useMemo(() =>
    trips.filter(t =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.attendees.toLowerCase().includes(searchQuery.toLowerCase())
    ), [trips, searchQuery]);

  const lightboxSlides = useMemo(() =>
    filteredTrips.map(t => ({ src: t.image, title: t.name, description: t.destination })),
    [filteredTrips]);

  const openLightbox = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  // Next 2 upcoming trips for cards
  const upcomingCards = useMemo(() =>
    [...trips]
      .sort((a, b) => a.start.localeCompare(b.start))
      .filter(t => new Date(t.end) >= new Date())
      .slice(0, 2),
    [trips]);

  // Spotlight trip for "For your X Trip"
  const spotlightTrip = useMemo(() =>
    [...trips]
      .filter(t => t.status !== "Draft")
      .sort((a, b) => a.start.localeCompare(b.start))
      .find(t => new Date(t.end) >= new Date()) || trips[0] || null,
    [trips]);

  // Place-worthy events (activity, hotel, dining) for spotlight
  const spotlightPlaces = useMemo(() => {
    if (!spotlightTrip) return [];
    return spotlightTrip.events
      .filter(e => e.type === "activity" || e.type === "hotel" || e.type === "dining")
      .slice(0, 4);
  }, [spotlightTrip]);

  // Map pins
  const mapPins = useMemo(() =>
    Object.entries(DEST_COORDS)
      .filter(([name]) => trips.some(t => TRIP_DEST[t.name] === name))
      .map(([name, coords]) => ({ name, coords })),
    [trips]);

  const handleCreateTripSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTripData.dateRange?.from || !newTripData.dateRange?.to) {
      showToast("Please select travel dates", "error");
      return;
    }
    const newTrip: Trip = {
      id: Date.now().toString(),
      name: newTripData.name,
      attendees: newTripData.attendees,
      destination: newTripData.destination || undefined,
      paxCount: newTripData.paxCount || undefined,
      tripType: newTripData.tripType || undefined,
      budget: newTripData.budget || undefined,
      currency: newTripData.currency || "USD",
      start: format(newTripData.dateRange.from, "yyyy-MM-dd"),
      end: format(newTripData.dateRange.to, "yyyy-MM-dd"),
      status: "Draft",
      image: newTripData.image || "https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=1000&auto=format&fit=crop",
      events: [],
    };
    addTrip(newTrip);
    setIsNewTripOpen(false);
    setNewTripData({ name: "", attendees: "", dateRange: undefined, image: "", destination: "", paxCount: "", tripType: "", budget: "", currency: "USD" });
    showToast("Trip created successfully");
    toast.success("Trip created successfully");
    addNotification({ message: "Trip created", detail: newTrip.name, time: "Just now", type: "success" });
  };

  const handleDeleteTrip = (id: string) => {
    deleteTrip(id);
    setDeletingTripId(null);
    showToast("Trip removed");
    toast.success("Trip removed");
  };

  const handleOpenTrip = (trip: Trip) => navigate(`/trip/${trip.id}`);

  // Prevent horizontal scroll container from swallowing vertical wheel events
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) return; // vertical — let page handle
      e.preventDefault();
      el.scrollLeft += e.deltaX;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#050505]">

      {/* ── Header ── */}
      <header className="h-16 shrink-0 border-b border-slate-200 dark:border-[#1f1f1f] px-4 lg:px-8 flex items-center justify-between sticky top-0 z-40 bg-slate-50/80 dark:bg-[#050505]/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <MobileSidebar />
        </div>
        <div className="flex-1 flex items-center justify-end gap-3 lg:gap-4">
          <div className="max-w-xs w-full relative group hidden md:block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 dark:text-[#888] group-focus-within:text-[#0bd2b5] transition-colors" />
            <label htmlFor="search-trips" className="sr-only">Search trips</label>
            <input id="search-trips" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search trips..." className="pl-10 h-10 bg-white dark:bg-[#111111] border-none rounded-full text-slate-900 dark:text-white placeholder:text-slate-500/40 dark:placeholder:text-[#888]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 w-full text-xs font-medium shadow-inner" />
          </div>
          <button aria-label="Toggle theme" onClick={toggleTheme} className="h-10 w-10 rounded-full bg-white dark:bg-[#111111] hover:bg-slate-100 dark:hover:bg-[#1f1f1f] text-slate-500 dark:text-[#888] hover:text-[#0bd2b5] transition-[background-color,color] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center cursor-pointer shadow-sm shrink-0">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <NotificationPanel />
          <div className="h-7 w-px bg-slate-200 dark:bg-[#1f1f1f] hidden lg:block shrink-0" />
          <Button onClick={() => setIsNewTripOpen(true)} className="rounded-full bg-[#0bd2b5] hover:opacity-90 text-slate-900 dark:text-black font-bold h-10 px-4 lg:px-6 transition-opacity gap-2 text-xs uppercase tracking-wider shrink-0">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Trip</span>
          </Button>
        </div>
      </header>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 lg:px-8 pt-8 pb-16 space-y-8">

          {/* ── Greeting ── */}
          <div>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-slate-900 dark:text-white leading-none">
              {greeting}, {firstName} 👋
            </h1>
            <p className="text-sm text-slate-400 dark:text-[#666] mt-2 font-medium">Plan your itinerary with us</p>
          </div>

          {/* ── Story Strip ── */}
          <div
            ref={stripRef}
            className="flex gap-3 -mx-4 lg:-mx-8 px-4 lg:px-8 py-1 overflow-x-auto"
            style={{ scrollbarWidth: "none", overflowY: "visible" }}
          >
            {trips.map((trip) => {
              const isPast = new Date(trip.end) < new Date();
              return (
                <button
                  key={trip.id}
                  onClick={() => handleOpenTrip(trip)}
                  className="shrink-0 group cursor-pointer"
                >
                  <div className="relative w-[112px] h-[72px] rounded-2xl overflow-hidden ring-1 ring-slate-200 dark:ring-[#2a2a2a] group-hover:ring-2 group-hover:ring-[#0bd2b5] transition-[box-shadow]">
                    <img src={trip.image} alt={trip.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    {isPast && <div className="absolute inset-0 bg-black/20" />}
                  </div>
                </button>
              );
            })}
            <button onClick={() => setIsNewTripOpen(true)} className="shrink-0 group cursor-pointer">
              <div className="w-[112px] h-[72px] rounded-2xl border-2 border-dashed border-slate-200 dark:border-[#2a2a2a] group-hover:border-[#0bd2b5] flex items-center justify-center transition-colors">
                <Plus className="h-5 w-5 text-slate-300 dark:text-[#444] group-hover:text-[#0bd2b5] transition-colors" />
              </div>
            </button>
          </div>

          {/* ── Two-column layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">

            {/* ══ LEFT COLUMN ══ */}
            <div className="space-y-8 min-w-0">

              {/* ── Upcoming Trip ── */}
              <section>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Upcoming Trip</h2>
                    <p className="text-xs text-slate-400 dark:text-[#666] mt-0.5">Remember your upcoming trips!</p>
                  </div>
                  <button
                    onClick={() => setIsNewTripOpen(true)}
                    className="text-[11px] font-bold text-[#0bd2b5] hover:text-[#0bd2b5]/80 transition-colors shrink-0 mt-1"
                  >
                    Details
                  </button>
                </div>

                {upcomingCards.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {upcomingCards.map(trip => {
                      const d = daysUntil(trip.start);
                      return (
                        <button
                          key={trip.id}
                          onClick={() => handleOpenTrip(trip)}
                          className="group bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl px-4 py-3 flex items-center gap-4 text-left hover:border-[#0bd2b5]/40 hover:shadow-md transition-[border-color,box-shadow] duration-200 cursor-pointer"
                        >
                          {/* Thumbnail */}
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0">
                            <img src={trip.image} alt={trip.name} loading="lazy" className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          </div>
                          {/* Name + location */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{trip.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                              <p className="text-[11px] text-slate-400 dark:text-[#666] truncate font-medium">{trip.destination || trip.attendees}</p>
                            </div>
                          </div>
                          <span className="shrink-0 bg-[#0bd2b5] text-[#050505] text-[10px] font-bold px-2.5 py-1 rounded-full leading-none">
                            {d === 0 ? "Today" : `${d}d`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-[#111111] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] rounded-2xl flex flex-col items-center justify-center py-12 text-slate-400 dark:text-[#555]">
                    <LucideCalendar className="h-7 w-7 mb-3 opacity-40" />
                    <p className="text-xs font-bold uppercase tracking-widest">No upcoming trips</p>
                    <button onClick={() => setIsNewTripOpen(true)} className="mt-3 text-[10px] font-bold text-[#0bd2b5] hover:underline">Create one →</button>
                  </div>
                )}
              </section>

              {/* ── For your X Trip — Place Cards ── */}
              {spotlightTrip && (
                <section>
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                        For your{" "}
                        <span className="text-[#0bd2b5] italic">{spotlightTrip.destination || spotlightTrip.name.split(" ")[0]}</span>
                        {" "}Trip
                      </h2>
                      <p className="text-xs text-slate-400 dark:text-[#666] mt-0.5">These can't be missed places</p>
                    </div>
                    <button
                      onClick={() => handleOpenTrip(spotlightTrip)}
                      className="text-[11px] font-bold text-[#0bd2b5] hover:text-[#0bd2b5]/80 transition-colors shrink-0 mt-1"
                    >
                      Details
                    </button>
                  </div>

                  {spotlightPlaces.length > 0 ? (
                    <div className="space-y-3 mt-4">
                      {spotlightPlaces.map((ev, i) => {
                        const cfg = EVENT_COLORS[ev.type as keyof typeof EVENT_COLORS] || EVENT_COLORS.activity;
                        const tags = EVENT_TAGS[ev.type] || [];
                        const rating = fakeRating(i + ev.title.length);
                        const reviews = fakeReviews(i + ev.title.length);
                        const hasImg = !!ev.image;
                        return (
                          <div
                            key={ev.id}
                            className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden flex hover:border-[#0bd2b5]/30 hover:shadow-md transition-[border-color,box-shadow] duration-200 group"
                          >
                            {/* Left image */}
                            <div className="w-[120px] shrink-0 relative overflow-hidden">
                              {hasImg ? (
                                <img src={ev.image} alt={ev.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                              ) : (
                                <div className={`h-full w-full flex items-center justify-center ${cfg.bg}`}>
                                  <cfg.Icon className={`h-8 w-8 ${cfg.text} opacity-60`} />
                                </div>
                              )}
                            </div>

                            {/* Right content */}
                            <div className="flex-1 min-w-0 p-4 flex flex-col justify-between">
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-tight line-clamp-1">{ev.title}</p>
                                    <p className="text-xs text-slate-400 dark:text-[#666] mt-1 line-clamp-2 font-medium leading-relaxed">
                                      {ev.notes || ev.location}
                                    </p>
                                  </div>
                                  {/* Action buttons */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button aria-label="Save" className="h-7 w-7 rounded-full border border-slate-200 dark:border-[#2a2a2a] flex items-center justify-center text-slate-400 hover:text-red-400 hover:border-red-200 transition-colors">
                                      <Heart className="h-3 w-3" aria-hidden="true" />
                                    </button>
                                    <button aria-label="Share" className="h-7 w-7 rounded-full bg-[#0bd2b5] flex items-center justify-center text-[#050505] hover:opacity-80 transition-opacity">
                                      <Share2 className="h-3 w-3" aria-hidden="true" />
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Bottom row: rating + guide + tags */}
                              <div className="mt-3 space-y-2">
                                <div className="flex items-center gap-1">
                                  <Star className="h-3 w-3 text-amber-400 fill-amber-400" aria-hidden="true" />
                                  <span className="text-[11px] font-bold text-slate-700 dark:text-[#ccc]">{rating}</span>
                                  <span className="text-[10px] text-slate-400 dark:text-[#666]">({reviews})</span>
                                </div>
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-medium text-slate-400 dark:text-[#666]">Guide by</span>
                                    <span className="text-[10px] font-semibold text-slate-600 dark:text-[#aaa]">
                                      {spotlightTrip.attendees.split(",")[0]?.trim().split(" ")[0] || "Agent"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {tags.slice(0, 3).map(tag => (
                                      <span key={tag} className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1a1a1a] text-slate-500 dark:text-[#888]">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      onClick={() => handleOpenTrip(spotlightTrip)}
                      className="mt-4 bg-white dark:bg-[#111111] rounded-2xl border border-dashed border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center py-10 text-slate-400 dark:text-[#555] cursor-pointer hover:border-[#0bd2b5]/40 transition-colors group"
                    >
                      <div className="text-center">
                        <Compass className="h-6 w-6 mx-auto mb-2 opacity-30 group-hover:text-[#0bd2b5] transition-colors" />
                        <p className="text-xs font-bold uppercase tracking-widest">Open trip to add events</p>
                      </div>
                    </div>
                  )}
                </section>
              )}

            </div>

            {/* ══ RIGHT COLUMN ══ */}
            <div className="hidden lg:block space-y-4">

              {/* Destinations Map — "Friends Location" equivalent */}
              <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-3xl overflow-hidden">
                <div className="flex items-start justify-between px-5 pt-5 pb-3">
                  <div>
                    <p className="text-base font-black tracking-tight text-slate-900 dark:text-white leading-none">Destinations</p>
                    <p className="text-xs text-slate-400 dark:text-[#666] mt-1">Check your trip coverage</p>
                  </div>
                  <button
                    onClick={() => navigate("/destinations")}
                    className="text-[11px] font-bold text-[#0bd2b5] hover:text-[#0bd2b5]/80 transition-colors mt-0.5"
                  >
                    Expand
                  </button>
                </div>
                <div className="relative" style={{ background: isDark ? "#0d0d0d" : "#f5f7fa" }}>
                  <ComposableMap
                    projection="geoEqualEarth"
                    projectionConfig={{ scale: 128, center: [15, 5] }}
                    style={{ width: "100%", height: "auto", display: "block" }}
                  >
                    <Sphere id="rsm-sphere-dash" fill={isDark ? "#0d0d0d" : "#f5f7fa"} stroke="none" />
                    <Graticule stroke={isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.02)"} strokeWidth={0.25} />
                    <Geographies geography={GEO_URL}>
                      {({ geographies }) =>
                        geographies.map(geo => (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            fill={isDark ? "#1a1a1a" : "#e8ecf1"}
                            stroke={isDark ? "#252525" : "#d0d8e4"}
                            strokeWidth={0.4}
                            style={{
                              default: { outline: "none" },
                              hover: { outline: "none" },
                              pressed: { outline: "none" },
                            }}
                          />
                        ))
                      }
                    </Geographies>
                    {mapPins.map((pin, i) => (
                      <Marker key={pin.name} coordinates={pin.coords}>
                        {/* Pulse ring */}
                        <circle r={7} fill="rgba(11,210,181,0.15)" style={{ animation: `dest-ring-pulse 2.5s ease-in-out ${i * 0.4}s infinite`, transformBox: "fill-box", transformOrigin: "center" }} />
                        {/* Pin dot */}
                        <circle r={4} fill="#0bd2b5" stroke={isDark ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.9)"} strokeWidth={1.5} style={{ filter: "drop-shadow(0 0 4px rgba(11,210,181,0.7))" }} />
                      </Marker>
                    ))}
                  </ComposableMap>
                </div>
              </div>

              {/* One Week Itinerary — featured trip */}
              {spotlightTrip && (
                <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-3xl overflow-hidden">
                  <div className="px-5 pt-5 pb-4">
                    <h3 className="text-base font-black tracking-tight text-slate-900 dark:text-white leading-none line-clamp-1">
                      {tripDuration(spotlightTrip.start, spotlightTrip.end) <= 7 ? "One Week" : `${tripDuration(spotlightTrip.start, spotlightTrip.end)}-Day`} Itinerary — {spotlightTrip.destination || spotlightTrip.name}...
                    </h3>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-xs text-slate-400 dark:text-[#666] font-medium">Traveller:</span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-[#ccc]">
                        {spotlightTrip.attendees.split(",")[0]?.trim() || "Agent"}
                      </span>
                    </div>
                  </div>

                  {/* Image */}
                  <div className="mx-4 rounded-2xl overflow-hidden h-[148px]">
                    <img src={spotlightTrip.image} alt={spotlightTrip.name} className="h-full w-full object-cover" />
                  </div>

                  {/* Details grid */}
                  <div className="px-5 pt-4 pb-5">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#666] mb-3">Details:</p>
                    <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-[#1a1a1a]">
                      <div className="pr-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-[#666]">Budget</p>
                        <p className="text-sm font-black italic tracking-tight text-slate-900 dark:text-white mt-1 leading-none">
                          {spotlightTrip.budget ? `$${spotlightTrip.budget}` : "—"}
                        </p>
                      </div>
                      <div className="px-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-[#666]">Person</p>
                        <p className="text-sm font-black italic tracking-tight text-slate-900 dark:text-white mt-1 leading-none">
                          {spotlightTrip.paxCount || "—"}
                        </p>
                      </div>
                      <div className="pl-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-[#666]">Durations</p>
                        <p className="text-sm font-black italic tracking-tight text-slate-900 dark:text-white mt-1 leading-none">
                          {tripDuration(spotlightTrip.start, spotlightTrip.end)}d, {Math.max(1, tripDuration(spotlightTrip.start, spotlightTrip.end) - 1)}n
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pb-4">
                    <button
                      onClick={() => handleOpenTrip(spotlightTrip)}
                      className="w-full h-10 rounded-2xl bg-[#0bd2b5] hover:opacity-90 text-[#050505] font-semibold text-xs transition-opacity flex items-center justify-center gap-2"
                    >
                      Open Itinerary <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setImportOpen(true)} className="group bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl px-4 py-4 flex flex-col items-center gap-2 hover:border-[#0bd2b5]/40 transition-colors cursor-pointer">
                  <div className="h-9 w-9 rounded-xl bg-[#0bd2b5]/10 flex items-center justify-center group-hover:bg-[#0bd2b5]/20 transition-colors">
                    <ExternalLink className="h-4 w-4 text-[#0bd2b5]" />
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-700 dark:text-[#ccc]">Import</p>
                    <p className="text-[9px] font-bold text-slate-400 dark:text-[#666] mt-0.5">PDF · Doc</p>
                  </div>
                </button>
                <button onClick={() => setInviteOpen(true)} className="group bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl px-4 py-4 flex flex-col items-center gap-2 hover:border-[#0bd2b5]/40 transition-colors cursor-pointer">
                  <div className="h-9 w-9 rounded-xl bg-[#0bd2b5]/10 flex items-center justify-center group-hover:bg-[#0bd2b5]/20 transition-colors">
                    <Users className="h-4 w-4 text-[#0bd2b5]" />
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-700 dark:text-[#ccc]">Invite</p>
                    <p className="text-[9px] font-bold text-slate-400 dark:text-[#666] mt-0.5">Team</p>
                  </div>
                </button>
              </div>

            </div>{/* end right col */}
          </div>{/* end 2-col grid */}

          {/* ── All Trips — full width ── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">All Trips</h3>
                <span className="text-[10px] font-bold text-[#0bd2b5] bg-[#0bd2b5]/10 px-3 py-1.5 rounded-full">{filteredTrips.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="md:hidden relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                  <input aria-label="Search trips" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="pl-8 h-9 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-full text-xs font-medium w-28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 text-slate-900 dark:text-white" />
                </div>
                <div className="flex gap-1 bg-white dark:bg-[#111111] p-1 rounded-2xl border border-slate-200 dark:border-[#1f1f1f] shadow-sm">
                  <button aria-label="Grid view" onClick={() => setDisplayMode("grid")} className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${displayMode === "grid" ? "bg-[#0bd2b5] text-[#050505] shadow-md" : "text-slate-400 dark:text-[#555] hover:text-slate-700 dark:hover:text-white"}`}><LayoutGrid className="h-4 w-4" /></button>
                  <button aria-label="List view" onClick={() => setDisplayMode("list")} className={`h-9 w-9 rounded-xl flex items-center justify-center transition-[background-color,color] ${displayMode === "list" ? "bg-[#0bd2b5] text-[#050505] shadow-md" : "text-slate-400 dark:text-[#555] hover:text-slate-700 dark:hover:text-white"}`}><List className="h-4 w-4" /></button>
                </div>
              </div>
            </div>

            {displayMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTrips.map((trip, tripIndex) => {
                  const startDate = new Date(trip.start);
                  const endDate = new Date(trip.end);
                  const dateStr = `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                  return (
                    <div key={trip.id} className="group relative rounded-[2rem] overflow-hidden flex flex-col min-h-[300px] cursor-pointer" onClick={() => handleOpenTrip(trip)}>
                      <img src={trip.image} alt={trip.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                      <div className="relative z-10 flex items-center justify-between p-4">
                        <span className="text-[11px] font-medium text-white/70">{trip.status === "In Progress" ? "Active" : trip.status}</span>
                        <button onClick={(e) => openLightbox(tripIndex, e)} aria-label="View full image" className="h-7 w-7 rounded-full bg-black/40 text-white/60 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <Expand className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="relative z-10 mt-auto p-4">
                        <h3 className="text-base font-bold leading-tight text-white mb-1.5 line-clamp-2">{trip.name}</h3>
                        <div className="flex items-center gap-2 text-white/60">
                          <span className="text-[11px] font-medium truncate max-w-[80px]">{trip.attendees.split(",")[0]?.trim()}</span>
                          <span className="text-white/30">·</span>
                          <div className="flex items-center gap-1">
                            <LucideCalendar className="h-2.5 w-2.5 text-[#0bd2b5] shrink-0" />
                            <span className="text-[11px] font-medium">{dateStr}</span>
                          </div>
                        </div>
                        <button aria-label="Delete trip" onClick={(e) => { e.stopPropagation(); setDeletingTripId(trip.id); }} className="absolute bottom-4 right-4 h-7 w-7 rounded-lg bg-black/50 text-white/40 hover:bg-red-500/30 hover:text-red-400 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => setIsNewTripOpen(true)} aria-label="Create new trip" className="group bg-white dark:bg-[#111111] rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] flex flex-col items-center justify-center py-12 text-slate-500 dark:text-[#888] hover:border-[#0bd2b5] hover:text-[#0bd2b5] transition-[border-color,color] cursor-pointer min-h-[300px]">
                  <div className="h-12 w-12 rounded-full bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm"><Plus className="h-6 w-6" /></div>
                  <p className="font-medium text-xs">New trip</p>
                </button>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#111111] rounded-2xl border border-slate-200 dark:border-[#1f1f1f] overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-[#050505]">
                    <TableRow className="hover:bg-transparent border-slate-200 dark:border-[#1f1f1f]">
                      <TableHead className="pl-8 py-5 text-[11px] font-bold text-slate-500 dark:text-[#888] uppercase tracking-[0.3em]">Preview</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 dark:text-[#888] uppercase tracking-[0.3em]">Destination</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 dark:text-[#888] uppercase tracking-[0.3em]">Attendees</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 dark:text-[#888] uppercase tracking-[0.3em]">Timeline</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 dark:text-[#888] uppercase tracking-[0.3em]">Events</TableHead>
                      <TableHead className="text-right pr-8 text-[11px] font-bold text-slate-500 dark:text-[#888] uppercase tracking-[0.3em]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrips.map(trip => {
                      const tStart = new Date(trip.start);
                      const tEnd = new Date(trip.end);
                      const tDateStr = `${tStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${tEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                      return (
                        <TableRow key={trip.id} className="group hover:bg-slate-50 dark:hover:bg-[#050505] transition-colors cursor-pointer border-slate-200 dark:border-[#1f1f1f] h-20" onClick={() => handleOpenTrip(trip)}>
                          <TableCell className="pl-8 py-2">
                            <div className="h-14 w-20 rounded-xl overflow-hidden border border-slate-200 dark:border-[#1f1f1f]"><img src={trip.image} alt={trip.name} className="h-full w-full object-cover" /></div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 dark:text-white text-base group-hover:text-[#0bd2b5] transition-colors leading-none">{trip.name}</span>
                              <Badge className={`w-fit text-xs font-semibold px-2 py-0.5 h-auto border-none mt-1.5 text-slate-900 dark:text-black ${trip.status === "Published" ? "bg-emerald-400" : "bg-[#0bd2b5]"}`}>{trip.status}</Badge>
                            </div>
                          </TableCell>
                          <TableCell><span className="font-medium text-slate-600 dark:text-[#aaa] text-xs">{trip.attendees || "Team"}</span></TableCell>
                          <TableCell className="text-slate-500 dark:text-[#888]"><div className="flex items-center gap-2 text-xs font-medium"><LucideCalendar className="h-3.5 w-3.5 text-[#0bd2b5]" />{tDateStr}</div></TableCell>
                          <TableCell><span className="text-xs font-bold text-slate-900 dark:text-white">{trip.events.length}</span></TableCell>
                          <TableCell className="text-right pr-8">
                            <div onClick={e => e.stopPropagation()} className="flex items-center justify-end gap-3">
                              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl bg-slate-50 dark:bg-[#050505] text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-[background-color,color] shadow-sm" onClick={() => handleOpenTrip(trip)}><ExternalLink className="h-4 w-4" aria-hidden="true" /></Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger className="h-9 w-9 rounded-xl bg-slate-50 dark:bg-[#050505] text-slate-500 dark:text-[#888] hover:text-[#0bd2b5] transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-[#0bd2b5] flex items-center justify-center cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-[#1f1f1f] shadow-sm">
                                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white rounded-xl shadow-2xl p-1" align="end">
                                  <DropdownMenuItem onClick={() => setDeletingTripId(trip.id)} className="gap-2 p-2 rounded-lg font-bold text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── New Trip Modal ── */}
      <Dialog open={isNewTripOpen} onOpenChange={setIsNewTripOpen}>
        <DialogContent className="max-w-3xl w-[95vw] bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-0 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
          <div className="px-8 pt-8 pb-5 border-b border-slate-200 dark:border-[#1f1f1f] shrink-0">
            <h2 className="text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white text-balance">Create New Trip</h2>
            <p className="text-slate-500 dark:text-[#888] font-medium uppercase text-xs tracking-[0.2em] mt-1">Set up the details for your team's upcoming travel experience.</p>
          </div>
          <form onSubmit={handleCreateTripSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
              <div className="space-y-3">
                <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] ml-1">Itinerary Title</Label>
                <Input required name="trip-title" autoComplete="off" value={newTripData.name} onChange={e => setNewTripData({ ...newTripData, name: e.target.value })} placeholder="e.g., Kenya Fam Trip" className="h-14 text-xl font-extrabold uppercase tracking-tight bg-transparent border-0 border-b border-slate-200 dark:border-[#1f1f1f] rounded-none focus-visible:border-[#0bd2b5] px-1 transition-[border-color] placeholder:text-slate-500/20 dark:placeholder:text-[#888]/20" />
              </div>
              <div className="space-y-3">
                <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] ml-1">Trip Type</Label>
                <div className="flex flex-wrap gap-2">
                  {["Leisure", "FAM Trip", "Honeymoon", "Corporate", "Adventure", "Group", "Cruise"].map(t => (
                    <button key={t} type="button" onClick={() => setNewTripData({ ...newTripData, tripType: newTripData.tripType === t ? "" : t })}
                      className={`px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-[background-color,border-color,color,box-shadow] border ${newTripData.tripType === t ? "bg-[#0bd2b5] text-black border-[#0bd2b5] shadow-lg shadow-[#0bd2b5]/20" : "bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888] hover:border-[#0bd2b5]/40"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] ml-1">Destination</Label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888]" />
                    <Input name="destination" autoComplete="off" value={newTripData.destination} onChange={e => setNewTripData({ ...newTripData, destination: e.target.value })} placeholder="e.g., Kenya, East Africa" className="h-12 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-semibold text-slate-900 dark:text-white focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]" />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] ml-1">No. of Travelers</Label>
                  <div className="relative">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888]" />
                    <Input type="number" min="1" name="pax-count" autoComplete="off" value={newTripData.paxCount} onChange={e => setNewTripData({ ...newTripData, paxCount: e.target.value })} placeholder="e.g., 12" className="h-12 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-semibold text-slate-900 dark:text-white focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] ml-1">Group / Client Name</Label>
                  <div className="relative">
                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888]" />
                    <Input required name="attendees" autoComplete="organization" value={newTripData.attendees} onChange={e => setNewTripData({ ...newTripData, attendees: e.target.value })} placeholder="e.g., Senior Agents" className="h-12 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-semibold text-slate-900 dark:text-white focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]" />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] ml-1">Travel Dates</Label>
                  <Popover>
                    <PopoverTrigger className={cn("w-full h-12 justify-start text-left font-semibold bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl hover:bg-white dark:hover:bg-[#111111] transition-[background-color] px-4 flex items-center gap-3", !newTripData.dateRange && "text-slate-500 dark:text-[#888]")}>
                      <LucideCalendar className="h-4 w-4 text-[#0bd2b5] shrink-0" />
                      {newTripData.dateRange?.from ? (newTripData.dateRange.to ? <>{format(newTripData.dateRange.from, "MMM d")} – {format(newTripData.dateRange.to, "MMM d, yyyy")}</> : format(newTripData.dateRange.from, "MMM d, yyyy")) : <span className="opacity-50 text-sm">Select dates...</span>}
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border border-slate-200 dark:border-[#2a2a2a] shadow-2xl rounded-[1.5rem] bg-white dark:bg-[#1a1a1a]" align="start">
                      <Calendar initialFocus mode="range" defaultMonth={newTripData.dateRange?.from} selected={newTripData.dateRange} onSelect={range => setNewTripData({ ...newTripData, dateRange: range })} numberOfMonths={2} className="p-4" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-5">
                <div className="col-span-2 space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] ml-1">Total Budget (Optional)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888]" />
                    <Input name="budget" autoComplete="off" value={newTripData.budget} onChange={e => setNewTripData({ ...newTripData, budget: e.target.value })} placeholder="e.g., 45,000" className="h-12 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-semibold text-slate-900 dark:text-white focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]" />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] ml-1">Currency</Label>
                  <select value={newTripData.currency} onChange={e => setNewTripData({ ...newTripData, currency: e.target.value })} className="h-12 w-full px-4 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-bold text-slate-900 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 text-sm appearance-none cursor-pointer">
                    {["USD", "GBP", "EUR", "AUD", "JPY", "AED", "ZAR"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] ml-1">Cover Image URL (Optional)</Label>
                <div className="relative">
                  <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888]" />
                  <Input name="cover-image" autoComplete="off" value={newTripData.image} onChange={e => setNewTripData({ ...newTripData, image: e.target.value })} placeholder="https://images.unsplash.com/..." className="h-12 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-medium text-slate-900 dark:text-white focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]" />
                </div>
              </div>
            </div>
            <div className="px-8 py-5 border-t border-slate-200 dark:border-[#1f1f1f] flex items-center justify-between shrink-0 bg-white dark:bg-[#111111]">
              <button type="button" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-colors px-4 py-2" onClick={() => setIsNewTripOpen(false)}>Cancel</button>
              <Button type="submit" className="rounded-2xl h-10 px-8 font-bold bg-[#0bd2b5] hover:opacity-90 text-slate-900 dark:text-black shadow-xl shadow-[#0bd2b5]/20 transition-opacity uppercase tracking-wider text-xs">Create Itinerary</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deletingTripId}
        onOpenChange={(open) => { if (!open) setDeletingTripId(null); }}
        title="Delete Trip"
        description="This will permanently remove the trip and all its events. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deletingTripId && handleDeleteTrip(deletingTripId)}
        destructive
      />
      <ImportItineraryDialog open={importOpen} onOpenChange={setImportOpen} />
      <InviteTeamDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        index={lightboxIndex}
        slides={lightboxSlides}
        styles={{ container: { backgroundColor: "rgba(5,5,5,0.97)" } }}
      />
    </div>
  );
}
