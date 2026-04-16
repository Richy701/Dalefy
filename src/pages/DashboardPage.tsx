import { useState, useMemo, useCallback, useRef, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus, Search, Plane, Calendar as LucideCalendar, Trash2, ArrowUpRight,
  MoreVertical, LayoutGrid, List, ExternalLink, Users,
  MapPin, DollarSign, Briefcase, Hotel, Utensils, Compass, Globe,
  X, Upload, Loader2, RefreshCw, ChevronRight,
  Clock, Hash, Tag, ArrowRight
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
import { InviteTeamDialog } from "@/components/shared/InviteTeamDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { searchImages } from "@/services/imageSearch";
import MapboxMap from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;


const EVENT_COLORS = {
  activity: { bg: "bg-brand/10", text: "text-brand", Icon: Compass },
  hotel:    { bg: "bg-amber-400/10",  text: "text-amber-500",  Icon: Hotel },
  dining:   { bg: "bg-pink-400/10",   text: "text-pink-500",   Icon: Utensils },
  flight:   { bg: "bg-blue-400/10",   text: "text-blue-500",   Icon: Plane },
};

const IMG = (id: string) => `https://images.unsplash.com/photo-${id}?q=80&w=1200&auto=format&fit=crop`;
const COVER_IMGS = [
  { url: IMG("1763878119119-aff0820121fd"), label: "Safari" },
  { url: IMG("1603477849227-705c424d1d80"), label: "Beach" },
  { url: IMG("1604223190546-a43e4c7f29d7"), label: "Mountain" },
  { url: IMG("1677254817050-cb9b29fbb16e"), label: "Japan" },
  { url: IMG("1680454769871-f58768c6187b"), label: "Italy" },
  { url: IMG("1643718220983-d6499832d422"), label: "Bali" },
  { url: IMG("1514939775307-d44e7f10cabd"), label: "City" },
  { url: IMG("1637576308588-6647bf80944d"), label: "Maldives" },
  { url: IMG("1669711671489-3f181b312531"), label: "Kyoto" },
  { url: IMG("1629711129507-d09c820810b1"), label: "Resort" },
  { url: IMG("1612638945907-1cb1d758f2d3"), label: "Alps" },
  { url: IMG("1647363377737-8d0ad7c2f494"), label: "Flight" },
];

function daysUntil(dateStr: string) {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000));
}
function tripDuration(start: string, end: string) {
  return Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
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
  const [coverSearch, setCoverSearch] = useState("");
  const [coverResults, setCoverResults] = useState<string[]>([]);
  const [isCoverSearching, setIsCoverSearching] = useState(false);
  const [coverPage, setCoverPage] = useState(1);
  const [coverLastQuery, setCoverLastQuery] = useState("");

  const isDark = theme === "dark";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const firstName = user?.name?.split(" ")[0] || "Traveller";

  const filteredTrips = useMemo(() =>
    trips.filter(t =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.attendees.toLowerCase().includes(searchQuery.toLowerCase())
    ), [trips, searchQuery]);

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
      .slice(0, 3);
  }, [spotlightTrip]);


  const runCoverSearch = async (query: string, page = 1) => {
    if (!query.trim()) { setCoverResults([]); return; }
    setIsCoverSearching(true);
    setCoverLastQuery(query);
    setCoverPage(page);
    try {
      const { urls } = await searchImages(query, page, 12);
      if (urls.length) { setCoverResults(urls); return; }
      const shuffled = [...COVER_IMGS].sort(() => Math.random() - 0.5);
      setCoverResults(shuffled.map(i => i.url));
    } finally {
      setIsCoverSearching(false);
    }
  };

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
      image: (() => {
        const raw = newTripData.image.trim();
        if (raw.startsWith("http")) return raw;
        return "https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=1600&auto=format&fit=crop";
      })(),
      events: [],
    };
    addTrip(newTrip);
    setIsNewTripOpen(false);
    setNewTripData({ name: "", attendees: "", dateRange: undefined, image: "", destination: "", paxCount: "", tripType: "", budget: "", currency: "USD" });
    setCoverSearch(""); setCoverResults([]);
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
          <div className="flex flex-col items-center gap-5 px-20 py-14 rounded-[2rem] border-2 border-dashed border-brand bg-brand/[0.04]">
            <div className="h-16 w-16 rounded-2xl bg-brand/15 flex items-center justify-center">
              <Upload className="h-7 w-7 text-brand" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xl font-black uppercase tracking-[0.15em] text-white">Drop to Import</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-brand/70">PDF · DOCX · PPTX · TXT</p>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        left={
          <div className="max-w-xs w-full relative group hidden md:flex items-center">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 dark:text-[#888888] group-focus-within:text-brand transition-colors pointer-events-none" />
            <label htmlFor="search-trips" className="sr-only">Search trips</label>
            <input id="search-trips" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search trips..." className="pl-10 h-10 bg-white dark:bg-[#111111] border-none rounded-full text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 w-full text-xs font-medium shadow-inner" />
          </div>
        }
        cta={
          <Button onClick={() => setIsNewTripOpen(true)} className="rounded-full bg-brand hover:opacity-90 text-slate-900 dark:text-black font-bold h-11 px-4 lg:px-6 transition-opacity gap-2 text-xs uppercase tracking-wider shrink-0">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Trip</span>
          </Button>
        }
      />

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-full gap-3 px-4 py-16">
            <img src="/illustrations/illus-riding.svg" alt="" className="w-72 h-72 object-contain dark:drop-shadow-[0_0_48px_rgba(255,255,255,0.18)]" draggable={false} />
            <div className="text-center space-y-1.5">
              <p className="text-base font-black uppercase tracking-widest text-slate-800 dark:text-white">No trips yet</p>
              <p className="text-xs font-medium text-slate-400 dark:text-[#666]">Create your first trip to get started</p>
            </div>
            <button
              onClick={() => setIsNewTripOpen(true)}
              className="h-10 px-6 rounded-full bg-brand text-[#050505] text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <Plus className="h-3.5 w-3.5" /> New Trip
            </button>
            {/* Drag-to-import hint */}
            <div className="flex items-center gap-3 w-full max-w-[300px] pt-1">
              <div className="h-px flex-1 bg-slate-200 dark:bg-[#1f1f1f]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300 dark:text-[#333]">or drag a file</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-[#1f1f1f]" />
            </div>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="w-full max-w-[300px] rounded-2xl border border-dashed border-slate-200 dark:border-[#222] overflow-hidden hover:border-brand/60 transition-colors group cursor-pointer"
            >
              <div className="flex items-center h-10">
                <div className="px-3 shrink-0 h-full flex items-center border-r border-dashed border-slate-200 dark:border-[#222] group-hover:border-brand/40 transition-colors">
                  <Upload className="h-3 w-3 text-brand" />
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
            </button>
          </div>
        ) : (
        <div data-compact-section className="px-4 lg:px-8 pt-8 pb-16 space-y-8">

          {/* ── Greeting Hero ── */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand/10 via-slate-50 to-slate-50 dark:from-brand/10 dark:via-[#0a0a0a] dark:to-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] px-6 py-12 lg:px-8 lg:py-16">
            <div className="relative z-10 max-w-[55%]">
              <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-slate-900 dark:text-white leading-none">
                {greeting}, {firstName} 👋
              </h1>
              {upcomingCards[0] ? (
                <button
                  onClick={() => handleOpenTrip(upcomingCards[0])}
                  className="group mt-5 block text-left"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] mb-2">
                    {daysUntil(upcomingCards[0].start) === 1 ? "Day to Departure" : "Days to Departure"}
                  </p>
                  <span className="block text-6xl lg:text-7xl font-black leading-[0.85] tracking-tighter text-slate-900 dark:text-white tabular-nums">
                    <NumberFlow value={daysUntil(upcomingCards[0].start)} />
                  </span>
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 dark:text-[#ccc] group-hover:text-brand transition-colors">
                    <MapPin className="h-3 w-3 text-brand" />
                    {upcomingCards[0].destination || upcomingCards[0].name}
                    <ArrowUpRight className="h-3 w-3" />
                  </p>
                </button>
              ) : (
                <button
                  onClick={() => setIsNewTripOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand text-black px-5 py-2.5 text-xs font-black uppercase tracking-[0.15em] hover:opacity-90 transition-opacity"
                >
                  <Plus className="h-3.5 w-3.5" /> Plan a Trip
                </button>
              )}
            </div>
            <img
              src="/illustrations/illus-together.svg"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="hidden sm:block absolute -right-4 -bottom-4 h-48 lg:h-56 w-auto object-contain pointer-events-none select-none opacity-90 dark:drop-shadow-[0_0_40px_rgba(11,210,181,0.15)]"
            />
          </div>

          {/* ── Two-column layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-stretch">

            {/* ══ LEFT COLUMN ══ */}
            <div className="flex flex-col gap-8 min-w-0">

              {/* ── Upcoming Trip ── */}
              <section>
                <div className="mb-4">
                  <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Upcoming Trip</h2>
                  <p className="text-xs text-slate-500 dark:text-[#888888] mt-0.5">Departing within 30 days</p>
                </div>

                {upcomingCards.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {upcomingCards.map(trip => {
                      const d = daysUntil(trip.start);
                      return (
                        <button
                          key={trip.id}
                          onClick={() => handleOpenTrip(trip)}
                          className="group bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl p-3 flex items-center gap-3 text-left hover:border-brand/50 hover:shadow-md transition-[border-color,box-shadow] duration-200 cursor-pointer"
                        >
                          <img src={trip.image} alt="" className="h-12 w-12 rounded-xl object-cover shrink-0 group-hover:scale-105 transition-transform duration-500" />
                          <div className="text-left flex-1 min-w-0">
                            <p className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-none truncate">
                              {trip.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">
                              <span className="flex items-center gap-1 whitespace-nowrap min-w-0"><MapPin className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{trip.destination || "—"}</span></span>
                              <span className="text-slate-300 dark:text-[#333]">·</span>
                              <span className="flex items-center gap-1 whitespace-nowrap"><LucideCalendar className="h-2.5 w-2.5 shrink-0" />{format(new Date(trip.start), "MMM d")}</span>
                              {trip.paxCount && (
                                <>
                                  <span className="text-slate-300 dark:text-[#333]">·</span>
                                  <span className="flex items-center gap-1 whitespace-nowrap"><Users className="h-2.5 w-2.5 shrink-0" />{trip.paxCount}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 text-[10px] font-black bg-brand text-black px-2.5 py-1 rounded-full leading-none tracking-wide">
                            {d === 0 ? "Today" : `${d}d`}
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 dark:text-[#555] group-hover:text-brand transition-colors shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-[#111111] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] rounded-2xl flex flex-col items-center justify-center py-12 text-slate-500 dark:text-[#888888]">
                    <LucideCalendar className="h-7 w-7 mb-3 opacity-40" />
                    <p className="text-xs font-bold uppercase tracking-widest">No upcoming trips</p>
                    <button onClick={() => setIsNewTripOpen(true)} className="mt-3 text-[10px] font-bold text-brand hover:underline">Create one →</button>
                  </div>
                )}
              </section>

              {/* ── For your X Trip — Place Cards ── */}
              {spotlightTrip && (
                <section className="flex-1 flex flex-col min-h-0">
                  <div className="mb-1">
                    <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                      For your{" "}
                      <span className="text-brand">{spotlightTrip.destination || spotlightTrip.name.split(" ")[0]}</span>
                      {" "}Trip
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-[#888888] mt-0.5">Key events on your itinerary</p>
                  </div>

                  {spotlightPlaces.length > 0 ? (
                    <div className="mt-4 flex-1 flex flex-col gap-3">
                      {spotlightPlaces.map((ev) => {
                        const cfg = EVENT_COLORS[ev.type as keyof typeof EVENT_COLORS] || EVENT_COLORS.activity;
                        const hasImg = !!ev.image;
                        const typeLabel =
                          ev.type === "flight"   ? "Flight"
                          : ev.type === "hotel"  ? "Stay"
                          : ev.type === "dining" ? "Dining"
                          : "Activity";
                        const eventDate = ev.date ? new Date(ev.date + "T12:00:00") : null;
                        const weekdayLabel = eventDate
                          ? eventDate.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()
                          : null;
                        const monthDayLabel = eventDate
                          ? eventDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()
                          : null;
                        const timeParts = ev.time ? ev.time.trim().split(/\s+/) : null;

                        // Type-specific detail row
                        const detail: React.ReactNode =
                          ev.type === "flight" && (ev.airline || ev.flightNum || ev.duration) ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              {(ev.airline || ev.flightNum) && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-[#ddd]">
                                  <Plane className="h-3 w-3 text-blue-500" strokeWidth={2} />
                                  {[ev.airline, ev.flightNum].filter(Boolean).join(" · ")}
                                </span>
                              )}
                              {ev.duration && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-[#888]">
                                  <Clock className="h-3 w-3" strokeWidth={2} />
                                  {ev.duration}
                                </span>
                              )}
                            </div>
                          ) : ev.type === "hotel" && (ev.roomType || ev.checkin || ev.checkout) ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              {ev.roomType && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-[#ddd]">
                                  <Hotel className="h-3 w-3 text-amber-500" strokeWidth={2} />
                                  {ev.roomType}
                                </span>
                              )}
                              {(ev.checkin || ev.checkout) && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-[#888]">
                                  {ev.checkin || "—"}
                                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                                  {ev.checkout || "—"}
                                </span>
                              )}
                            </div>
                          ) : (ev.price || ev.endTime) ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              {ev.price && (
                                <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold", cfg.text)}>
                                  <Tag className="h-3 w-3" strokeWidth={2} />
                                  {ev.price}
                                </span>
                              )}
                              {ev.endTime && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-[#888]">
                                  <Clock className="h-3 w-3" strokeWidth={2} />
                                  ends {ev.endTime}
                                </span>
                              )}
                            </div>
                          ) : null;

                        return (
                          <button
                            key={ev.id}
                            onClick={() => handleOpenTrip(spotlightTrip!)}
                            className="text-left bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden flex flex-1 hover:border-brand/30 hover:shadow-md transition-[border-color,box-shadow] duration-200 group"
                          >
                            {/* Left: image */}
                            <div className="w-[120px] shrink-0 relative overflow-hidden">
                              {hasImg ? (
                                <img src={ev.image} alt={ev.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                              ) : (
                                <div className={`h-full w-full flex items-center justify-center ${cfg.bg}`}>
                                  <cfg.Icon className={`h-8 w-8 ${cfg.text} opacity-60`} />
                                </div>
                              )}
                            </div>

                            {/* Center: content */}
                            <div className="flex-1 min-w-0 p-4 flex flex-col justify-between gap-2">
                              {/* Top: type pill + title */}
                              <div className="min-w-0">
                                <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.15em]", cfg.bg, cfg.text)}>
                                  <cfg.Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
                                  {typeLabel}
                                </div>
                                <p className="mt-1.5 text-sm font-black tracking-tight text-slate-900 dark:text-white leading-tight line-clamp-1">
                                  {ev.title}
                                </p>

                                {ev.location && (
                                  <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-[#888] min-w-0">
                                    <MapPin className="h-3 w-3 shrink-0" strokeWidth={2} />
                                    <span className="truncate">{ev.location}</span>
                                  </div>
                                )}
                              </div>

                              {/* Middle: type-specific detail */}
                              {detail}

                              {/* Bottom: status + conf */}
                              {(ev.status || ev.confNumber) && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {ev.status && (
                                    <span className={cn("text-[9px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border", cfg.bg, cfg.text, "border-current/20")}>
                                      {ev.status}
                                    </span>
                                  )}
                                  {ev.confNumber && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
                                      <Hash className="h-2.5 w-2.5" strokeWidth={2.5} />
                                      {ev.confNumber}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Right: when block — weekday, big time, date */}
                            {(timeParts || eventDate) && (
                              <div className="shrink-0 flex flex-col items-center justify-center gap-0.5 px-5 min-w-[96px] border-l border-slate-100 dark:border-[#1a1a1a]">
                                {weekdayLabel && (
                                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-[#888]">
                                    {weekdayLabel}
                                  </span>
                                )}
                                {timeParts ? (
                                  <>
                                    <span className="text-2xl font-black tracking-tighter text-slate-900 dark:text-white leading-none tabular-nums mt-0.5">
                                      {timeParts[0]}
                                    </span>
                                    {timeParts[1] && (
                                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-[#888]">
                                        {timeParts[1]}
                                      </span>
                                    )}
                                  </>
                                ) : null}
                                {monthDayLabel && (
                                  <span className={cn(
                                    "text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-[#555]",
                                    timeParts ? "mt-1" : "mt-0.5",
                                  )}>
                                    {monthDayLabel}
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      onClick={() => handleOpenTrip(spotlightTrip)}
                      className="mt-4 bg-white dark:bg-[#111111] rounded-2xl border border-dashed border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center py-10 text-slate-500 dark:text-[#888888] cursor-pointer hover:border-brand/40 transition-colors group"
                    >
                      <div className="text-center">
                        <Compass className="h-6 w-6 mx-auto mb-2 opacity-30 group-hover:text-brand transition-colors" />
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
                    className="text-[11px] font-bold text-brand hover:text-brand/80 transition-colors mt-0.5"
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

              {/* Spotlight trip — brand cinema card */}
              {spotlightTrip && (() => {
                const days   = tripDuration(spotlightTrip.start, spotlightTrip.end);
                const nights = Math.max(1, days - 1);
                const agent  = spotlightTrip.attendees.split(",")[0]?.trim() || "Agent";
                const pax    = spotlightTrip.paxCount || "—";
                const budget = spotlightTrip.budget ? `$${spotlightTrip.budget}` : "—";
                const dateRange = (() => {
                  const s = new Date(spotlightTrip.start);
                  const e = new Date(spotlightTrip.end);
                  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
                  return `${s.toLocaleDateString("en-US", opts)} — ${e.toLocaleDateString("en-US", opts)}`;
                })();
                const statusStyle =
                  spotlightTrip.status === "Published"  ? "bg-brand text-[#050505]"
                  : spotlightTrip.status === "In Progress" ? "bg-white/15 text-white backdrop-blur border border-brand/40"
                  : "bg-white/15 text-white/80 backdrop-blur border border-white/15";

                return (
                  <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-3xl overflow-hidden">
                    {/* Full-bleed hero */}
                    <div className="relative h-[200px]">
                      <img src={spotlightTrip.image} alt={spotlightTrip.name} className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/90" />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />

                      {/* Status + eyebrow */}
                      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                        <span className="text-[9px] font-bold tracking-[0.22em] text-brand uppercase">
                          DAF · Spotlight
                        </span>
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[9px] font-bold tracking-[0.12em] uppercase inline-flex items-center gap-1",
                          statusStyle
                        )}>
                          {spotlightTrip.status === "In Progress" ? (
                            <>
                              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
                              Active
                            </>
                          ) : spotlightTrip.status === "Published" ? "✓ Published"
                            : "Draft"}
                        </span>
                      </div>

                      {/* Title block */}
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <h3 className="italic font-black tracking-tight text-white text-xl leading-[1.1] uppercase line-clamp-2">
                          {spotlightTrip.name}
                        </h3>
                        {spotlightTrip.destination ? (
                          <div className="flex items-center gap-1.5 mt-2">
                            <MapPin className="h-3 w-3 text-brand" strokeWidth={2.2} />
                            <span className="text-[11px] font-bold tracking-wide text-white/90 uppercase">
                              {spotlightTrip.destination}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Agent + date range */}
                    <div className="flex items-center justify-between px-5 pt-4">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-brand/15 text-brand flex items-center justify-center text-[10px] font-black">
                          {agent.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-[#ccc]">{agent}</span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888888]">
                        {dateRange}
                      </span>
                    </div>

                    {/* Stat row */}
                    <div className="grid grid-cols-3 gap-2 px-5 pt-4 pb-4">
                      {[
                        { icon: LucideCalendar, label: "Duration", value: `${days} day${days === 1 ? "" : "s"}` },
                        { icon: Users,          label: "Pax",      value: pax },
                        { icon: DollarSign,     label: "Budget",   value: budget },
                      ].map(({ icon: Icon, label, value }) => (
                        <div
                          key={label}
                          className="rounded-2xl bg-slate-50 dark:bg-[#0a0a0a] border border-slate-100 dark:border-[#1a1a1a] px-3 py-2.5"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon className="h-3 w-3 text-brand" strokeWidth={2} />
                            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888888]">
                              {label}
                            </span>
                          </div>
                          <p className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-none">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* CTA */}
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => handleOpenTrip(spotlightTrip)}
                        className="w-full h-11 rounded-2xl bg-brand hover:opacity-90 text-[#050505] font-bold text-xs uppercase tracking-[0.12em] transition-opacity flex items-center justify-center gap-2"
                      >
                        Open Itinerary <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                );
              })()}

            </div>{/* end right col */}
          </div>{/* end 2-col grid */}

          {/* ── All Trips — full width ── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">All Trips</h3>
                <span className="text-[10px] font-bold text-brand bg-brand/10 px-3 py-1.5 rounded-full">{filteredTrips.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="md:hidden relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 dark:text-slate-400" />
                  <input aria-label="Search trips" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="pl-8 h-9 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-full text-xs font-medium w-28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 text-slate-900 dark:text-white" />
                </div>
<div className="flex gap-1 bg-white dark:bg-[#111111] p-1 rounded-2xl border border-slate-200 dark:border-[#1f1f1f] shadow-sm">
                  <button aria-label="Grid view" onClick={() => setDisplayMode("grid")} className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${displayMode === "grid" ? "bg-brand text-[#050505] shadow-md" : "text-slate-500 dark:text-[#888888] hover:text-slate-700 dark:hover:text-white"}`}><LayoutGrid className="h-4 w-4" /></button>
                  <button aria-label="List view" onClick={() => setDisplayMode("list")} className={`h-9 w-9 rounded-xl flex items-center justify-center transition-[background-color,color] ${displayMode === "list" ? "bg-brand text-[#050505] shadow-md" : "text-slate-500 dark:text-[#888888] hover:text-slate-700 dark:hover:text-white"}`}><List className="h-4 w-4" /></button>
                </div>
              </div>
            </div>

            {displayMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTrips.map((trip) => {
                  const startDate = new Date(trip.start);
                  const endDate = new Date(trip.end);
                  const dateStr = `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                  const daysLeft = daysUntil(trip.start);
                  const isActive = trip.status === "In Progress";
                  const isUpcoming = daysLeft > 0;
                  return (
                    <div key={trip.id} className="group isolate relative rounded-[2rem] overflow-hidden flex flex-col min-h-[340px] cursor-pointer ring-1 ring-slate-200 dark:ring-[#1f1f1f] hover:ring-brand/40 hover:shadow-xl hover:shadow-black/20 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5" style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }} onClick={() => handleOpenTrip(trip)}>
                      <img src={trip.image} alt={trip.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/10" />

                      {/* Top row: status + delete */}
                      <div className="relative z-10 flex items-center justify-between p-4">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-full backdrop-blur-md ${isActive ? "bg-brand/90 text-black" : "bg-white/15 text-white"}`}>
                          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-black animate-pulse" />}
                          {isActive ? "Active" : trip.status}
                        </span>
                        {isUpcoming && (
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/80 bg-black/35 backdrop-blur-md px-2.5 py-1 rounded-full">
                            {daysLeft === 0 ? "Today" : `${daysLeft}d away`}
                          </span>
                        )}
                      </div>

                      {/* Bottom content */}
                      <div className="relative z-10 mt-auto p-5">
                        {trip.destination && (
                          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-brand mb-2 flex items-center gap-1.5">
                            <MapPin className="h-2.5 w-2.5" /> {trip.destination}
                          </p>
                        )}
                        <h3 className="text-2xl font-black leading-[1.05] text-white mb-3 line-clamp-2 tracking-tight">{trip.name}</h3>
                        <div className="flex items-center gap-3 text-white/70 pt-3 border-t border-white/15">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <LucideCalendar className="h-3 w-3 text-brand shrink-0" />
                            <span className="text-[11px] font-bold tracking-wide truncate">{dateStr}</span>
                          </div>
                          <span className="text-white/20">·</span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Users className="h-3 w-3 text-brand shrink-0" />
                            <span className="text-[11px] font-bold tracking-wide truncate">{trip.paxCount || trip.attendees.split(",").length}</span>
                          </div>
                        </div>
                        <button aria-label="Delete trip" onClick={(e) => { e.stopPropagation(); setDeletingTripId(trip.id); }} className="absolute -top-14 right-4 h-8 w-8 rounded-xl bg-black/60 backdrop-blur text-white/60 hover:bg-red-500/40 hover:text-red-300 transition-[background-color,color] flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => setIsNewTripOpen(true)} aria-label="Create new trip" className="group bg-white dark:bg-[#111111] rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] flex flex-col items-center justify-center py-12 text-slate-500 dark:text-[#888] hover:border-brand hover:text-brand transition-[border-color,color] cursor-pointer min-h-[340px]">
                  <div className="h-14 w-14 rounded-full bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm"><Plus className="h-6 w-6" /></div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em]">New Trip</p>
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
                            <div className="h-14 w-14 rounded-2xl bg-brand/10 flex items-center justify-center">
                              <Plane className="h-6 w-6 text-brand opacity-60" />
                            </div>
                            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#555]">No trips yet</p>
                            <button onClick={() => setIsNewTripOpen(true)} className="text-[11px] font-bold text-brand hover:underline">Create your first trip →</button>
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
                              <span className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-brand transition-colors leading-none">{trip.name}</span>
                              <span className={`inline-flex items-center gap-1.5 w-fit text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${
                                trip.status === "Published"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : trip.status === "In Progress"
                                  ? "bg-brand/10 text-brand"
                                  : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400"
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                  trip.status === "Published" ? "bg-emerald-500 dark:bg-emerald-400"
                                  : trip.status === "In Progress" ? "bg-brand"
                                  : "bg-slate-400 dark:bg-slate-500"
                                }`} />
                                {trip.status}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell><span className="font-medium text-slate-600 dark:text-[#aaa] text-xs">{trip.attendees || "Team"}</span></TableCell>
                          <TableCell className="text-slate-500 dark:text-[#888]"><div className="flex items-center gap-2 text-xs font-medium"><LucideCalendar className="h-3.5 w-3.5 text-brand" />{tDateStr}</div></TableCell>
                          <TableCell><span className="text-xs font-bold text-slate-900 dark:text-white">{trip.events.length}</span></TableCell>
                          <TableCell className="text-right pr-8">
                            <div onClick={e => e.stopPropagation()} className="flex items-center justify-end gap-3">
                              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl bg-slate-50 dark:bg-[#050505] text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-[background-color,color] shadow-sm" onClick={() => handleOpenTrip(trip)}><ExternalLink className="h-4 w-4" aria-hidden="true" /></Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger className="h-9 w-9 rounded-xl bg-slate-50 dark:bg-[#050505] text-slate-500 dark:text-[#888] hover:text-brand transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-brand flex items-center justify-center cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-[#1f1f1f] shadow-sm">
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
              <div className="pt-6 pb-6 flex items-start justify-between">
                <div>
                  <Drawer.Title className="text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white">New Trip</Drawer.Title>
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#555] mt-1">Build your next adventure</p>
                </div>
                <button onClick={() => setIsNewTripOpen(false)} className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2a2a2a] flex items-center justify-center text-slate-400 dark:text-[#555] hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Import-from-file shortcut */}
              <button
                type="button"
                onClick={() => { setIsNewTripOpen(false); setImportOpen(true); }}
                className="w-full mb-8 flex items-center gap-3 px-4 py-3 rounded-2xl border border-dashed border-slate-200 dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#0a0a0a] hover:border-brand/60 hover:bg-brand/5 transition-colors group text-left"
              >
                <div className="h-9 w-9 rounded-xl bg-brand/10 flex items-center justify-center group-hover:bg-brand/20 transition-colors shrink-0">
                  <Upload className="h-4 w-4 text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-700 dark:text-white">Import from file instead</p>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-[#666] mt-0.5">PDF · DOCX · PPTX · TXT — we'll fill this in for you</p>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 dark:text-[#555] group-hover:text-brand transition-colors shrink-0" />
              </button>

              <form onSubmit={handleCreateTripSubmit} className="space-y-6 max-w-2xl mx-auto">
                {/* Title */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666]">Itinerary Title</label>
                  <input required name="trip-title" autoComplete="off" value={newTripData.name} onChange={e => setNewTripData({ ...newTripData, name: e.target.value })} placeholder="e.g., Kenya Fam Trip"
                    className="w-full h-14 px-0 bg-transparent border-0 border-b border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight focus:outline-none focus:border-brand placeholder:text-slate-300 dark:placeholder:text-[#333] transition-colors" />
                </div>

                {/* Trip Type */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666]">Trip Type</label>
                  <div className="flex flex-wrap gap-2">
                    {["Leisure", "FAM Trip", "Honeymoon", "Corporate", "Adventure", "Group", "Cruise"].map(t => (
                      <button key={t} type="button" onClick={() => setNewTripData({ ...newTripData, tripType: newTripData.tripType === t ? "" : t })}
                        className={`px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all border ${newTripData.tripType === t ? "bg-brand text-black border-brand shadow-lg shadow-brand/20" : "bg-slate-50 dark:bg-[#0a0a0a] border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888] hover:border-brand/40"}`}>
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
                      className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-brand/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><Users className="h-3 w-3" /> No. of Travelers</label>
                    <input type="number" min="1" name="pax-count" autoComplete="off" value={newTripData.paxCount} onChange={e => setNewTripData({ ...newTripData, paxCount: e.target.value })} placeholder="e.g., 12"
                      className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-brand/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all" />
                  </div>
                </div>

                {/* Group */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><Briefcase className="h-3 w-3" /> Group / Client</label>
                  <input required name="attendees" autoComplete="organization" value={newTripData.attendees} onChange={e => setNewTripData({ ...newTripData, attendees: e.target.value })} placeholder="e.g., Senior Agents"
                    className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-brand/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all" />
                </div>

                {/* Travel Dates — inline to avoid Popover/Drawer z-index conflict */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><LucideCalendar className="h-3 w-3" /> Travel Dates</label>
                    {newTripData.dateRange?.from && newTripData.dateRange?.to && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-brand">
                          {format(newTripData.dateRange.from, "MMM d")} – {format(newTripData.dateRange.to, "MMM d, yyyy")}
                        </span>
                        <button type="button" onClick={() => setNewTripData({ ...newTripData, dateRange: undefined })} className="text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-red-400 transition-colors">Clear</button>
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-slate-200 dark:border-[#1f1f1f] bg-slate-50 dark:bg-[#0a0a0a] w-full">
                    <Calendar mode="range" defaultMonth={newTripData.dateRange?.from ?? new Date()} selected={newTripData.dateRange} onSelect={range => setNewTripData({ ...newTripData, dateRange: range })} numberOfMonths={1} className="w-full" />
                  </div>
                </div>

                {/* Budget + Currency */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><DollarSign className="h-3 w-3" /> Total Budget (Optional)</label>
                  <div className="flex gap-2">
                    <input
                      name="budget"
                      autoComplete="off"
                      inputMode="numeric"
                      value={newTripData.budget}
                      onChange={e => setNewTripData({ ...newTripData, budget: e.target.value.replace(/[^0-9]/g, "") })}
                      placeholder="e.g. 45000"
                      className="flex-1 h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-brand/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all"
                    />
                    <div className="flex gap-1 flex-wrap items-center">
                      {["USD", "GBP", "EUR", "AUD", "JPY", "AED", "ZAR"].map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewTripData({ ...newTripData, currency: c })}
                          className={`h-12 px-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all border ${
                            newTripData.currency === c
                              ? "bg-brand/10 border-brand/40 text-brand"
                              : "bg-slate-50 dark:bg-[#0a0a0a] border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#555] hover:text-slate-800 dark:hover:text-white hover:border-slate-300 dark:hover:border-[#333]"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Cover Image */}
                <div className="space-y-3">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2">
                    <ImageIcon className="h-3 w-3" /> Cover Image
                  </label>
                  {/* Preview */}
                  {newTripData.image?.startsWith("http") && (
                    <div className="h-28 rounded-2xl overflow-hidden relative">
                      <img src={newTripData.image} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    </div>
                  )}
                  {/* Search bar */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-[#555] pointer-events-none" />
                      <input
                        value={coverSearch}
                        onChange={e => setCoverSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); runCoverSearch(coverSearch); } }}
                        placeholder="Search destinations…"
                        className="w-full h-10 pl-9 pr-3 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus:outline-none focus:border-brand/50 transition-colors"
                      />
                    </div>
                    <button type="button" onClick={() => runCoverSearch(coverSearch)}
                      className="h-10 px-4 rounded-2xl bg-brand text-black text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center gap-1.5 shrink-0">
                      {isCoverSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    </button>
                    {coverResults.length > 0 && (
                      <>
                        <button type="button" aria-label="Refresh" onClick={() => runCoverSearch(coverLastQuery || coverSearch, coverPage)} disabled={isCoverSearching}
                          className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-brand transition-colors shrink-0 disabled:opacity-40">
                          <RefreshCw className={`h-3.5 w-3.5 ${isCoverSearching ? "animate-spin" : ""}`} />
                        </button>
                        <button type="button" aria-label="Next page" onClick={() => runCoverSearch(coverLastQuery || coverSearch, coverPage + 1)} disabled={isCoverSearching}
                          className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-brand transition-colors shrink-0 disabled:opacity-40">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => { setCoverResults([]); setCoverSearch(""); setCoverPage(1); setCoverLastQuery(""); }}
                          className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-colors shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                  {/* Thumbnail grid */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {isCoverSearching ? (
                      <div className="col-span-4 flex items-center justify-center h-20 gap-2 text-slate-500 dark:text-[#888]">
                        <Loader2 className="h-4 w-4 animate-spin text-brand" />
                        <span className="text-xs font-bold uppercase tracking-wider">Searching…</span>
                      </div>
                    ) : coverResults.length > 0 ? (
                      coverResults.map((url, i) => (
                        <button key={i} type="button" onClick={() => setNewTripData({ ...newTripData, image: url })}
                          className={`relative h-16 rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.03] ${newTripData.image === url ? "border-brand shadow-lg shadow-brand/30 scale-[1.03]" : "border-transparent hover:border-brand/50"}`}>
                          <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        </button>
                      ))
                    ) : (
                      COVER_IMGS.map(({ url, label }) => (
                        <button key={url} type="button" onClick={() => setNewTripData({ ...newTripData, image: url })}
                          className={`relative h-16 rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.03] ${newTripData.image === url ? "border-brand shadow-lg shadow-brand/30 scale-[1.03]" : "border-transparent hover:border-brand/50"}`}>
                          <img src={url} alt={label} className="w-full h-full object-cover" loading="lazy" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/10" />
                          <span className="absolute bottom-1 left-0 right-0 text-center text-[8px] font-black uppercase tracking-wider text-white">{label}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsNewTripOpen(false)}
                    className="flex-1 h-12 rounded-2xl bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#666] text-xs font-black uppercase tracking-wider hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-[#2a2a2a] transition-all">
                    Cancel
                  </button>
                  <button type="submit"
                    className="flex-[2] h-12 rounded-2xl bg-brand text-black text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-brand/20 flex items-center justify-center gap-2">
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
    </div>
  );
}
