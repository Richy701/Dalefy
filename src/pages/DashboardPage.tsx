import { useState, useMemo, useCallback, useRef, useEffect, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus, Search, Plane, Calendar as LucideCalendar, Trash2, ArrowUpRight,
  MoreVertical, LayoutGrid, List, ExternalLink, Users,
  MapPin, DollarSign, Briefcase, Expand, Hotel, Utensils, Compass, Globe,
  Heart, Share2, Star, X, Upload
} from "lucide-react";
import NumberFlow from "@number-flow/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer } from "vaul";
import { Calendar } from "@/components/ui/calendar";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { ImportItineraryDialog } from "@/components/shared/ImportItineraryDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InviteTeamDialog } from "@/components/shared/InviteTeamDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import MapboxMap from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;


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
  const { theme } = useTheme();
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
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.items.length > 0) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files[0];
    if (file) { setDroppedFile(file); setImportOpen(true); }
  }, []);

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
    <div
      className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#050505] relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* ── Drag-to-import overlay ── */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 px-20 py-14 rounded-[2rem] border-2 border-dashed border-[#0bd2b5] bg-[#0bd2b5]/[0.04]">
            <div className="h-16 w-16 rounded-2xl bg-[#0bd2b5]/15 flex items-center justify-center">
              <Upload className="h-7 w-7 text-[#0bd2b5]" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xl font-black uppercase tracking-[0.15em] text-white">Drop to Import</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#0bd2b5]/70">PDF · DOCX · PPTX · TXT</p>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        left={
          <div className="max-w-xs w-full relative group hidden md:flex items-center">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 dark:text-[#888888] group-focus-within:text-[#0bd2b5] transition-colors pointer-events-none" />
            <label htmlFor="search-trips" className="sr-only">Search trips</label>
            <input id="search-trips" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search trips..." className="pl-10 h-10 bg-white dark:bg-[#111111] border-none rounded-full text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 w-full text-xs font-medium shadow-inner" />
          </div>
        }
        cta={
          <Button onClick={() => setIsNewTripOpen(true)} className="rounded-full bg-[#0bd2b5] hover:opacity-90 text-slate-900 dark:text-black font-bold h-11 px-4 lg:px-6 transition-opacity gap-2 text-xs uppercase tracking-wider shrink-0">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Trip</span>
          </Button>
        }
      />

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-full gap-3 px-4 py-16">
            <img src="/illus-riding.svg" alt="" className="w-72 h-72 object-contain dark:drop-shadow-[0_0_48px_rgba(255,255,255,0.18)]" draggable={false} />
            <div className="text-center space-y-1.5">
              <p className="text-base font-black uppercase tracking-widest text-slate-800 dark:text-white">No trips yet</p>
              <p className="text-xs font-medium text-slate-400 dark:text-[#666]">Create your first trip to get started</p>
            </div>
            <button
              onClick={() => setIsNewTripOpen(true)}
              className="h-10 px-6 rounded-full bg-[#0bd2b5] text-[#050505] text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <Plus className="h-3.5 w-3.5" /> New Trip
            </button>
            {/* Drag-to-import hint */}
            <div className="flex items-center gap-3 w-full max-w-[300px] pt-1">
              <div className="h-px flex-1 bg-slate-200 dark:bg-[#1f1f1f]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300 dark:text-[#333]">or drag a file</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-[#1f1f1f]" />
            </div>
            <div className="w-full max-w-[300px] rounded-2xl border border-dashed border-slate-200 dark:border-[#222] overflow-hidden">
              <div className="flex items-center h-10">
                <div className="px-3 shrink-0 h-full flex items-center border-r border-dashed border-slate-200 dark:border-[#222]">
                  <Upload className="h-3 w-3 text-[#0bd2b5]" />
                </div>
                <div className="flex-1 overflow-hidden relative">
                  <div className="flex animate-marquee">
                    {[0, 1].map(i => (
                      <span key={i} className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#444] px-3">
                        PDF &nbsp;·&nbsp; DOCX &nbsp;·&nbsp; PPTX &nbsp;·&nbsp; TXT &nbsp;·&nbsp; Extracts flights &amp; hotels &nbsp;·&nbsp;&emsp;
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
        <div className="px-4 lg:px-8 pt-8 pb-16 space-y-8">

          {/* ── Greeting ── */}
          <div>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-slate-900 dark:text-white leading-none">
              {greeting}, {firstName} 👋
            </h1>
            {upcomingCards[0] ? (
              <div className="flex items-center gap-2.5 mt-2.5">
                <span className="text-sm font-bold text-slate-900 dark:text-white truncate leading-none">
                  {upcomingCards[0].destination || upcomingCards[0].name}
                </span>
                <span className="shrink-0 text-[10px] font-black bg-[#0bd2b5] text-black px-2.5 py-1 rounded-full leading-none tracking-wide">
                  {daysUntil(upcomingCards[0].start) === 0 ? "Today" : `${daysUntil(upcomingCards[0].start)}d`}
                </span>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-medium">No upcoming departures</p>
            )}
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
                  aria-label={trip.name}
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
            <button onClick={() => setIsNewTripOpen(true)} aria-label="Add new trip" className="shrink-0 group cursor-pointer">
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
                    <p className="text-xs text-slate-500 dark:text-[#888888] mt-0.5">Departing within 30 days</p>
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
                              <MapPin className="h-3 w-3 text-slate-500 dark:text-slate-400 shrink-0" />
                              <p className="text-[11px] text-slate-500 dark:text-[#888888] truncate font-medium">{trip.destination || trip.attendees}</p>
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
                  <div className="bg-white dark:bg-[#111111] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] rounded-2xl flex flex-col items-center justify-center py-12 text-slate-500 dark:text-[#888888]">
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
                      <p className="text-xs text-slate-500 dark:text-[#888888] mt-0.5">Key events on your itinerary</p>
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
                                    <p className="text-xs text-slate-500 dark:text-[#888888] mt-1 line-clamp-2 font-medium leading-relaxed">
                                      {ev.notes || ev.location}
                                    </p>
                                  </div>
                                  {/* Action buttons */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button aria-label="Save" className="h-7 w-7 rounded-full border border-slate-200 dark:border-[#2a2a2a] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-red-400 hover:border-red-200 transition-colors">
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
                                  <span className="text-[10px] text-slate-500 dark:text-[#888888]">({reviews})</span>
                                </div>
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-medium text-slate-500 dark:text-[#888888]">Guide by</span>
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
                      className="mt-4 bg-white dark:bg-[#111111] rounded-2xl border border-dashed border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center py-10 text-slate-500 dark:text-[#888888] cursor-pointer hover:border-[#0bd2b5]/40 transition-colors group"
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
                    <p className="text-xs text-slate-500 dark:text-[#888888] mt-1">Check your trip coverage</p>
                  </div>
                  <button
                    onClick={() => navigate("/destinations")}
                    className="text-[11px] font-bold text-[#0bd2b5] hover:text-[#0bd2b5]/80 transition-colors mt-0.5"
                  >
                    Expand
                  </button>
                </div>
                <div className="relative h-[220px] overflow-hidden rounded-b-3xl">
                  <MapboxMap
                    initialViewState={{ longitude: 15, latitude: 5, zoom: 0 }}
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
                  >
                  </MapboxMap>
                  {/* Edge vignette to blend into card */}
                  <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 40px 12px ${isDark ? "#111111" : "#f5f7fa"}` }} />
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
                      <span className="text-xs text-slate-500 dark:text-[#888888] font-medium">Traveller:</span>
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
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888] mb-3">Details:</p>
                    <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-[#1a1a1a]">
                      <div className="pr-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888888]">Budget</p>
                        <p className="text-sm font-black tracking-tight text-slate-900 dark:text-white mt-1 leading-none">
                          {spotlightTrip.budget ? `$${spotlightTrip.budget}` : "—"}
                        </p>
                      </div>
                      <div className="px-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888888]">Person</p>
                        <p className="text-sm font-black tracking-tight text-slate-900 dark:text-white mt-1 leading-none">
                          {spotlightTrip.paxCount || "—"}
                        </p>
                      </div>
                      <div className="pl-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888888]">Durations</p>
                        <p className="text-sm font-black tracking-tight text-slate-900 dark:text-white mt-1 leading-none">
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
                    <p className="text-[9px] font-bold text-slate-500 dark:text-[#888888] mt-0.5">PDF · Doc</p>
                  </div>
                </button>
                <button onClick={() => setInviteOpen(true)} className="group bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl px-4 py-4 flex flex-col items-center gap-2 hover:border-[#0bd2b5]/40 transition-colors cursor-pointer">
                  <div className="h-9 w-9 rounded-xl bg-[#0bd2b5]/10 flex items-center justify-center group-hover:bg-[#0bd2b5]/20 transition-colors">
                    <Users className="h-4 w-4 text-[#0bd2b5]" />
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-700 dark:text-[#ccc]">Invite</p>
                    <p className="text-[9px] font-bold text-slate-500 dark:text-[#888888] mt-0.5">Team</p>
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 dark:text-slate-400" />
                  <input aria-label="Search trips" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="pl-8 h-9 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-full text-xs font-medium w-28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 text-slate-900 dark:text-white" />
                </div>
                <div className="flex gap-1 bg-white dark:bg-[#111111] p-1 rounded-2xl border border-slate-200 dark:border-[#1f1f1f] shadow-sm">
                  <button aria-label="Grid view" onClick={() => setDisplayMode("grid")} className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${displayMode === "grid" ? "bg-[#0bd2b5] text-[#050505] shadow-md" : "text-slate-500 dark:text-[#888888] hover:text-slate-700 dark:hover:text-white"}`}><LayoutGrid className="h-4 w-4" /></button>
                  <button aria-label="List view" onClick={() => setDisplayMode("list")} className={`h-9 w-9 rounded-xl flex items-center justify-center transition-[background-color,color] ${displayMode === "list" ? "bg-[#0bd2b5] text-[#050505] shadow-md" : "text-slate-500 dark:text-[#888888] hover:text-slate-700 dark:hover:text-white"}`}><List className="h-4 w-4" /></button>
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
                    {filteredTrips.length === 0 && (
                      <TableRow className="hover:bg-transparent border-0">
                        <TableCell colSpan={6} className="py-20 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-14 w-14 rounded-2xl bg-[#0bd2b5]/10 flex items-center justify-center">
                              <Plane className="h-6 w-6 text-[#0bd2b5] opacity-60" />
                            </div>
                            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#555]">No trips yet</p>
                            <button onClick={() => setIsNewTripOpen(true)} className="text-[11px] font-bold text-[#0bd2b5] hover:underline">Create your first trip →</button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
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
                            <div className="flex flex-col gap-1.5">
                              <span className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-[#0bd2b5] transition-colors leading-none">{trip.name}</span>
                              <span className={`inline-flex items-center gap-1.5 w-fit text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${
                                trip.status === "Published"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : trip.status === "In Progress"
                                  ? "bg-[#0bd2b5]/10 text-[#0bd2b5]"
                                  : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400"
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                  trip.status === "Published" ? "bg-emerald-500 dark:bg-emerald-400"
                                  : trip.status === "In Progress" ? "bg-[#0bd2b5]"
                                  : "bg-slate-400 dark:bg-slate-500"
                                }`} />
                                {trip.status}
                              </span>
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
        )}
      </div>

      {/* ── New Trip Drawer ── */}
      <Drawer.Root open={isNewTripOpen} onOpenChange={setIsNewTripOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[2rem] bg-white dark:bg-[#111111] border-t border-slate-200 dark:border-[#1f1f1f] max-h-[90vh] focus:outline-none">
            <div className="mx-auto w-12 h-1 rounded-full bg-slate-200 dark:bg-[#2a2a2a] mt-4 shrink-0" />
            <div className="flex-1 overflow-y-auto px-6 sm:px-10 pb-10">
              <div className="pt-6 pb-8 flex items-start justify-between">
                <div>
                  <Drawer.Title className="text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white">New Trip</Drawer.Title>
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#555] mt-1">Build your next adventure</p>
                </div>
                <button onClick={() => setIsNewTripOpen(false)} className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2a2a2a] flex items-center justify-center text-slate-400 dark:text-[#555] hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleCreateTripSubmit} className="space-y-6 max-w-2xl mx-auto">
                {/* Title */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666]">Itinerary Title</label>
                  <input required name="trip-title" autoComplete="off" value={newTripData.name} onChange={e => setNewTripData({ ...newTripData, name: e.target.value })} placeholder="e.g., Kenya Fam Trip"
                    className="w-full h-14 px-0 bg-transparent border-0 border-b border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight focus:outline-none focus:border-[#0bd2b5] placeholder:text-slate-300 dark:placeholder:text-[#333] transition-colors" />
                </div>

                {/* Trip Type */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666]">Trip Type</label>
                  <div className="flex flex-wrap gap-2">
                    {["Leisure", "FAM Trip", "Honeymoon", "Corporate", "Adventure", "Group", "Cruise"].map(t => (
                      <button key={t} type="button" onClick={() => setNewTripData({ ...newTripData, tripType: newTripData.tripType === t ? "" : t })}
                        className={`px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all border ${newTripData.tripType === t ? "bg-[#0bd2b5] text-black border-[#0bd2b5] shadow-lg shadow-[#0bd2b5]/20" : "bg-slate-50 dark:bg-[#0a0a0a] border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888] hover:border-[#0bd2b5]/40"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Destination + Pax */}
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><MapPin className="h-3 w-3" /> Destination</label>
                    <input name="destination" autoComplete="off" value={newTripData.destination} onChange={e => setNewTripData({ ...newTripData, destination: e.target.value })} placeholder="e.g., Kenya, East Africa"
                      className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-[#0bd2b5]/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><Users className="h-3 w-3" /> No. of Travelers</label>
                    <input type="number" min="1" name="pax-count" autoComplete="off" value={newTripData.paxCount} onChange={e => setNewTripData({ ...newTripData, paxCount: e.target.value })} placeholder="e.g., 12"
                      className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-[#0bd2b5]/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all" />
                  </div>
                </div>

                {/* Group */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><Briefcase className="h-3 w-3" /> Group / Client</label>
                  <input required name="attendees" autoComplete="organization" value={newTripData.attendees} onChange={e => setNewTripData({ ...newTripData, attendees: e.target.value })} placeholder="e.g., Senior Agents"
                    className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-[#0bd2b5]/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all" />
                </div>

                {/* Travel Dates — inline to avoid Popover/Drawer z-index conflict */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><LucideCalendar className="h-3 w-3" /> Travel Dates</label>
                    {newTripData.dateRange?.from && newTripData.dateRange?.to && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#0bd2b5]">
                          {format(newTripData.dateRange.from, "MMM d")} – {format(newTripData.dateRange.to, "MMM d, yyyy")}
                        </span>
                        <button type="button" onClick={() => setNewTripData({ ...newTripData, dateRange: undefined })} className="text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-red-400 transition-colors">Clear</button>
                      </div>
                    )}
                  </div>
                  <Calendar mode="range" defaultMonth={newTripData.dateRange?.from ?? new Date()} selected={newTripData.dateRange} onSelect={range => setNewTripData({ ...newTripData, dateRange: range })} numberOfMonths={1} className="p-0" />
                </div>

                {/* Budget + Currency */}
                <div className="grid grid-cols-3 gap-5">
                  <div className="col-span-2 space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><DollarSign className="h-3 w-3" /> Total Budget (Optional)</label>
                    <input name="budget" autoComplete="off" value={newTripData.budget} onChange={e => setNewTripData({ ...newTripData, budget: e.target.value })} placeholder="e.g., 45,000"
                      className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-[#0bd2b5]/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666]">Currency</label>
                    <Select value={newTripData.currency} onValueChange={(v) => setNewTripData({ ...newTripData, currency: v })}>
                      <SelectTrigger className="h-12 w-full px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-bold text-slate-900 dark:text-white text-sm focus:border-[#0bd2b5]/50 dark:bg-input/0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["USD", "GBP", "EUR", "AUD", "JPY", "AED", "ZAR"].map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Cover Image */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><ImageIcon className="h-3 w-3" /> Cover Image URL (Optional)</label>
                  <input name="cover-image" autoComplete="off" value={newTripData.image} onChange={e => setNewTripData({ ...newTripData, image: e.target.value })} placeholder="https://images.unsplash.com/..."
                    className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-900 dark:text-white text-sm font-medium focus:outline-none focus:border-[#0bd2b5]/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all" />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsNewTripOpen(false)}
                    className="flex-1 h-12 rounded-2xl bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#666] text-xs font-black uppercase tracking-wider hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-[#2a2a2a] transition-all">
                    Cancel
                  </button>
                  <button type="submit"
                    className="flex-[2] h-12 rounded-2xl bg-[#0bd2b5] text-black text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-[#0bd2b5]/20 flex items-center justify-center gap-2">
                    <Plus className="h-4 w-4" /> Create Itinerary
                  </button>
                </div>
              </form>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <ConfirmDialog
        open={!!deletingTripId}
        onOpenChange={(open) => { if (!open) setDeletingTripId(null); }}
        title="Delete Trip"
        description="This will permanently remove the trip and all its events. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deletingTripId && handleDeleteTrip(deletingTripId)}
        destructive
      />
      <ImportItineraryDialog
        open={importOpen}
        onOpenChange={(v) => { setImportOpen(v); if (!v) setDroppedFile(null); }}
        initialFile={droppedFile}
      />
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
