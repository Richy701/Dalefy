import { useState, useMemo, useCallback, useRef, useEffect, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus, MagnifyingGlass, AirplaneTilt, Calendar as LucideCalendar, Trash, ArrowUpRight,
  DotsThreeVertical, GridFour, List, ArrowSquareOut, Users,
  MapPin, CurrencyDollar, Briefcase, Bed, ForkKnife, Compass, Globe,
  X, Upload, SpinnerGap, ArrowClockwise, CaretRight,
  Clock, Hash, Tag, ArrowRight, Copy, Stack, FloppyDisk, Warning
} from "@phosphor-icons/react";
import { STORAGE } from "@/config/storageKeys";
import { EVENT_ICONS } from "@/config/eventStyles";
import NumberFlow from "@number-flow/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer } from "vaul";
import { Calendar } from "@/components/ui/calendar";
import { Image as ImageIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { parseTripDate } from "@/lib/dates";
import type { DisplayMode, Trip } from "@/types";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useTripStats } from "@/hooks/useTripStats";
import { usePermissions } from "@/hooks/usePermissions";
import { useDemo } from "@/hooks/useDemo";
import { PageHeader } from "@/components/shared/PageHeader";
import { ImportItineraryDialog } from "@/components/shared/ImportItineraryDialog";
import { InviteTeamDialog } from "@/components/shared/InviteTeamDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DemoUpgradeDialog } from "@/components/shared/DemoUpgradeDialog";
import { searchImages } from "@/services/imageSearch";
import { COVER_IMAGES } from "@/data/images";
import { BrandIllustration } from "@/components/shared/BrandIllustration";


const EVENT_COLORS = {
  activity: { bg: "bg-brand/10", text: "text-brand", Icon: EVENT_ICONS.activity },
  hotel:    { bg: "bg-brand/10", text: "text-brand", Icon: EVENT_ICONS.hotel },
  dining:   { bg: "bg-brand/10", text: "text-brand", Icon: EVENT_ICONS.dining },
  flight:   { bg: "bg-brand/10", text: "text-brand", Icon: EVENT_ICONS.flight },
  transfer: { bg: "bg-brand/10", text: "text-brand", Icon: EVENT_ICONS.transfer },
};




function daysUntil(dateStr: string) {
  return Math.max(0, Math.ceil((parseTripDate(dateStr).getTime() - Date.now()) / 86400000));
}

/** Get the actual departure timestamp from the chronologically earliest event */
function getFirstEventTime(trip: Trip): string {
  let earliest: Date | null = null;

  for (const ev of trip.events ?? []) {
    if (!ev.date || !ev.time) continue;
    const match = ev.time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) continue;
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const ampm = match[3]?.toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    const d = parseTripDate(ev.date);
    d.setHours(hours, mins, 0, 0);
    if (!earliest || d < earliest) earliest = d;
  }

  return earliest ? earliest.toISOString() : trip.start;
}

function useLiveCountdown(trip: Trip | undefined) {
  const target = trip ? getFirstEventTime(trip) : undefined;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const diff = Math.max(0, new Date(target).getTime() - now);
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    total: diff,
  };
}
function tripDuration(start: string, end: string) {
  return Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
}

function getRelativeDay(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return target.toLocaleDateString("en-US", { weekday: "long" });
  return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}


export function DashboardPage() {
  const { trips, ready: tripsReady, addTrip, deleteTrip } = useTrips();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { showToast, addNotification } = useNotifications();
  usePreferences();
  const { canDeleteTrip, canEditTrips, isOrgMember, isViewer } = usePermissions();
  const { isDemo, demoGate, upgradeOpen, setUpgradeOpen } = useDemo();
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(() => sessionStorage.getItem("daf-demo-banner-dismissed") === "1");
  const stats = useTripStats(trips);
  const navigate = useNavigate();

  const [displayMode, setDisplayMode] = useState<DisplayMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewTripOpen, setIsNewTripOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date());
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const firstName = (() => {
    const raw = user?.name?.split(" ")[0] || "Traveller";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  })();

  const filteredTrips = useMemo(() =>
    [...trips]
      .sort((a, b) => a.start.localeCompare(b.start))
      .filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.attendees.toLowerCase().includes(searchQuery.toLowerCase())
      ), [trips, searchQuery]);

  // Next 2 upcoming trips for cards
  const upcomingCards = useMemo(() =>
    [...trips]
      .sort((a, b) => a.start.localeCompare(b.start))
      .filter(t => parseTripDate(t.end) >= new Date())
      .slice(0, 2),
    [trips]);

  const countdown = useLiveCountdown(upcomingCards[0]);

  // Spotlight trip for "For your X Trip"
  const spotlightTrip = useMemo(() =>
    [...trips]
      .filter(t => t.status !== "Draft")
      .sort((a, b) => a.start.localeCompare(b.start))
      .find(t => parseTripDate(t.end) >= new Date()) || trips[0] || null,
    [trips]);

  // Place-worthy events (activity, hotel, dining) for spotlight
  const spotlightPlaces = useMemo(() => {
    if (!spotlightTrip) return [];
    return spotlightTrip.events
      .filter(e => e.type === "activity" || e.type === "hotel" || e.type === "dining")
      .slice(0, 3);
  }, [spotlightTrip]);

  const nextEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 14);
    const upcoming: Array<{ event: (typeof trips)[0]["events"][0]; tripName: string; tripId: string }> = [];
    trips.forEach(trip => {
      trip.events.forEach(ev => {
        if (!ev.date) return;
        const d = new Date(ev.date + "T00:00:00");
        if (d >= today && d <= cutoff) upcoming.push({ event: ev, tripName: trip.name, tripId: trip.id });
      });
    });
    return upcoming
      .sort((a, b) => (a.event.date + (a.event.time || "")).localeCompare(b.event.date + (b.event.time || "")))
      .slice(0, 4);
  }, [trips]);

  const attentionItems = useMemo(() => {
    const items: Array<{ tripId: string; tripName: string; message: string; severity: "warn" | "info" }> = [];
    const now = new Date();
    trips.forEach(trip => {
      const start = parseTripDate(trip.start);
      const end = parseTripDate(trip.end);
      const days = Math.ceil((start.getTime() - now.getTime()) / 86400000);
      if (trip.status === "Draft" && days > 0 && days <= 30)
        items.push({ tripId: trip.id, tripName: trip.name, message: `Draft - departs in ${days}d`, severity: "warn" });
      else if (trip.events.length === 0 && end >= now)
        items.push({ tripId: trip.id, tripName: trip.name, message: "No events added", severity: "info" });
      else if (trip.status === "In Progress" && end < now)
        items.push({ tripId: trip.id, tripName: trip.name, message: "Past end date - still active", severity: "warn" });
    });
    return items.slice(0, 3);
  }, [trips]);

  const runCoverSearch = async (query: string, page = 1) => {
    if (!query.trim()) { setCoverResults([]); return; }
    setIsCoverSearching(true);
    setCoverLastQuery(query);
    setCoverPage(page);
    try {
      const { urls } = await searchImages(query, page, 12);
      if (urls.length) { setCoverResults(urls); return; }
      const shuffled = [...COVER_IMAGES].sort(() => Math.random() - 0.5);
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

  const handleDuplicateTrip = (trip: Trip) => {
    const dup: Trip = {
      ...trip,
      id: Date.now().toString(),
      name: `${trip.name} (Copy)`,
      status: "Draft",
      events: trip.events.map(e => ({ ...e, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })),
      shortCode: undefined,
    };
    addTrip(dup);
    showToast("Trip duplicated");
    toast.success("Trip duplicated");
  };

  const handleSaveAsTemplate = (trip: Trip) => {
    const templates: Trip[] = JSON.parse(localStorage.getItem(STORAGE.TEMPLATES) ?? "[]");
    const tpl: Trip = {
      ...trip,
      id: `tpl-${Date.now()}`,
      name: trip.name,
      status: "Draft",
      shortCode: undefined,
    };
    templates.push(tpl);
    localStorage.setItem(STORAGE.TEMPLATES, JSON.stringify(templates));
    showToast("Saved as template");
    toast.success("Saved as template");
  };

  const handleCreateFromTemplate = (tpl: Trip) => {
    const today = new Date();
    const tripStart = new Date(tpl.start);
    const daysDiff = Math.round((today.getTime() - tripStart.getTime()) / 86400000);
    const shiftDate = (d: string) => {
      const dt = new Date(d);
      dt.setDate(dt.getDate() + daysDiff);
      return dt.toISOString().split("T")[0];
    };
    const newTrip: Trip = {
      ...tpl,
      id: Date.now().toString(),
      name: `${tpl.name}`,
      start: shiftDate(tpl.start),
      end: shiftDate(tpl.end),
      status: "Draft",
      shortCode: undefined,
      events: tpl.events.map(e => ({
        ...e,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: shiftDate(e.date),
      })),
    };
    addTrip(newTrip);
    showToast("Trip created from template");
    toast.success("Trip created from template");
    navigate(`/trip/${newTrip.id}`);
  };

  const templates: Trip[] = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE.TEMPLATES) ?? "[]"); }
    catch { return []; }
  }, []);

  const handleOpenTrip = (trip: Trip, eventId?: string) => navigate(`/trip/${trip.id}${eventId ? `?event=${eventId}` : ""}`);

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
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-[#050505]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 px-20 py-14 rounded-[2rem] border-2 border-dashed border-brand bg-brand/[0.04]">
            <div className="h-16 w-16 rounded-2xl bg-brand/15 flex items-center justify-center">
              <Upload className="h-7 w-7 text-brand" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xl font-black uppercase tracking-[0.15em] text-slate-900 dark:text-white">Drop to Import</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-brand/70">PDF · DOCX · PPTX · TXT</p>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        left={
          <div className="max-w-full sm:max-w-xs w-full relative group flex items-center">
            <MagnifyingGlass className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 dark:text-[#888888] group-focus-within:text-brand transition-colors pointer-events-none" />
            <label htmlFor="search-trips" className="sr-only">Search trips</label>
            <input id="search-trips" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="pl-9 sm:pl-10 h-10 bg-white dark:bg-[#111111] border-none rounded-full text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 w-full text-xs font-medium shadow-inner" />
          </div>
        }
        cta={
          <Button onClick={() => { if (!demoGate()) setIsNewTripOpen(true); }} disabled={isViewer} className="rounded-full bg-brand hover:opacity-90 text-slate-900 dark:text-black font-bold h-11 px-4 lg:px-6 transition-opacity gap-2 text-xs uppercase tracking-wider shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">{isViewer ? "View Only" : "New Trip"}</span>
          </Button>
        }
      />

      {/* ── Demo welcome banner ── */}
      {isDemo && !demoBannerDismissed && (
        <div className="mx-4 mt-3 mb-0 flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand/[0.06] px-5 py-3.5">
          <Compass className="h-5 w-5 text-brand shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white">Welcome to the demo</p>
            <p className="text-[11px] text-slate-500 dark:text-[#888] mt-0.5">Browse trips, explore features — sign up to create your own.</p>
          </div>
          <button
            onClick={() => { setDemoBannerDismissed(true); sessionStorage.setItem("daf-demo-banner-dismissed", "1"); }}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-[#555] hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1a1a1a] transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!tripsReady ? (
          <div className="flex flex-col items-center justify-center min-h-full px-4 py-16 gap-4">
            <SpinnerGap className="h-8 w-8 text-brand animate-spin" />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-[#555]">Loading trips</p>
          </div>
        ) : trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-full px-4 py-16 gap-5">
            <BrandIllustration src="/illustrations/illus-riding.svg" className="w-72 h-72 object-contain" draggable={false} />
            <p className="text-sm font-medium text-slate-500 dark:text-[#888] text-center max-w-xs leading-relaxed">
              Plan your first adventure. Add it manually or import an itinerary.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { if (!demoGate()) setIsNewTripOpen(true); }}
                className="inline-flex items-center gap-2 rounded-full bg-brand text-black px-5 py-2.5 text-xs font-black uppercase tracking-[0.15em] hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3.5 w-3.5" /> New Trip
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-[#aaa] px-5 py-2.5 text-xs font-black uppercase tracking-[0.15em] hover:border-brand/40 hover:text-brand transition-colors"
              >
                <Upload className="h-3.5 w-3.5" /> Import
              </button>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#444]">
              Supports PDF · DOCX · PPTX · TXT
            </p>
          </div>
        ) : (
        <div data-compact-section className="px-3 sm:px-4 lg:px-8 pt-6 sm:pt-8 pb-16 space-y-6 sm:space-y-8">

          {/* ── Greeting Hero ── */}
          <div data-compact-hero className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-brand/10 via-brand/[0.02] to-slate-50 dark:from-brand/10 dark:via-brand/[0.02] dark:to-[#050505] border border-brand/[0.08] dark:border-brand/[0.06] shadow-[0_0_80px_-20px] shadow-brand/10 px-5 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16 min-h-[180px] sm:min-h-[220px] lg:min-h-[260px]">
            <div className="relative z-10 max-w-[70%] sm:max-w-[55%]">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-slate-900 dark:text-white leading-none truncate">
                {greeting}, {firstName}
              </h1>
              {upcomingCards[0] && countdown && countdown.total > 0 ? (
                <button
                  onClick={() => handleOpenTrip(upcomingCards[0])}
                  className="group mt-5 block text-left"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#888] mb-2">
                    Next Trip
                  </p>
                  <div data-compact-countdown className="flex items-center gap-1.5 sm:gap-2">
                    {[
                      { value: countdown.days, label: "DAYS" },
                      { value: countdown.hours, label: "HRS" },
                      { value: countdown.minutes, label: "MIN" },
                      { value: countdown.seconds, label: "SEC" },
                    ].map((u, i) => (
                      <div key={u.label} className="flex items-center">
                        <div className="flex flex-col items-center min-w-[40px] sm:min-w-[52px] lg:min-w-[60px]">
                          <span className="text-[32px] sm:text-[42px] lg:text-[50px] font-black leading-none tracking-tighter text-slate-900 dark:text-white tabular-nums">
                            <NumberFlow value={u.value} format={{ minimumIntegerDigits: 2 }} />
                          </span>
                          <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#666] mt-0.5">
                            {u.label}
                          </span>
                        </div>
                        {i < 3 && (
                          <span className="text-xl sm:text-2xl font-black text-brand/60 mx-0.5 -mt-2.5 sm:-mt-3 select-none">:</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-brand/80 group-hover:text-brand transition-colors">
                    <AirplaneTilt className="h-3 w-3" />
                    {upcomingCards[0].destination || upcomingCards[0].name}
                    <ArrowUpRight className="h-2.5 w-2.5 opacity-40" />
                  </p>
                </button>
              ) : upcomingCards[0] && new Date(upcomingCards[0].end) >= new Date() ? (
                <button
                  onClick={() => handleOpenTrip(upcomingCards[0])}
                  className="group mt-5 block text-left"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand mb-2">
                    Currently Travelling
                  </p>
                  <p className="text-[32px] sm:text-[42px] lg:text-[50px] font-black leading-none tracking-tighter text-brand">
                    NOW
                  </p>
                  <p className="mt-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 dark:text-[#ccc] group-hover:text-brand transition-colors">
                    <MapPin className="h-3 w-3 text-brand" />
                    {upcomingCards[0].destination || upcomingCards[0].name}
                    <ArrowUpRight className="h-3 w-3" />
                  </p>
                </button>
              ) : (
                <p className="mt-4 text-sm sm:text-base font-black uppercase tracking-[0.15em] text-slate-400 dark:text-[#555]">
                  Where to next?
                </p>
              )}
            </div>
            {/* Quick Actions — inline in hero */}
            <div className="relative z-10 flex items-center gap-2 flex-wrap mt-6">
              <button
                type="button"
                onClick={() => { if (!demoGate()) setIsNewTripOpen(true); }}
                disabled={isViewer}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/80 dark:bg-white/[0.06] backdrop-blur-sm border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-white/70 text-[10px] font-bold uppercase tracking-[0.12em] hover:bg-brand/20 hover:text-brand hover:border-brand/30 transition-colors disabled:opacity-40"
              >
                <Plus className="h-3 w-3" /> New Trip
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/80 dark:bg-white/[0.06] backdrop-blur-sm border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-white/70 text-[10px] font-bold uppercase tracking-[0.12em] hover:bg-brand/20 hover:text-brand hover:border-brand/30 transition-colors"
              >
                <Upload className="h-3 w-3" /> Import
              </button>
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/80 dark:bg-white/[0.06] backdrop-blur-sm border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-white/70 text-[10px] font-bold uppercase tracking-[0.12em] hover:bg-brand/20 hover:text-brand hover:border-brand/30 transition-colors"
              >
                <Users className="h-3 w-3" /> Invite Team
              </button>
            </div>

            <BrandIllustration
              src="/illustrations/illus-together.svg"
              aria-hidden="true"
              draggable={false}
              className="hidden sm:block absolute -right-4 bottom-6 h-44 lg:h-52 w-auto object-contain pointer-events-none select-none opacity-90"
            />
          </div>

          {/* ── Next Up — cross-trip agenda ── */}
          {nextEvents.length > 0 && (
            <div className="bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent shadow-sm dark:shadow-none rounded-3xl overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <p className="text-lg font-black tracking-tight text-slate-900 dark:text-white leading-none">Next Up</p>
                  <p className="text-xs text-slate-500 dark:text-[#888888] mt-1">Across all your trips</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-100 dark:bg-[#1a1a1a] border-t border-slate-100 dark:border-[#1a1a1a]">
                {nextEvents.map(({ event: ev, tripName, tripId }) => {
                  const cfg = EVENT_COLORS[ev.type as keyof typeof EVENT_COLORS] || EVENT_COLORS.activity;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => navigate(`/trip/${tripId}?event=${ev.id}`)}
                      className="bg-white dark:bg-[#111111] px-4 py-4 text-left hover:bg-brand/[0.03] dark:hover:bg-brand/[0.04] transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className={cn("h-5 w-5 rounded-md flex items-center justify-center shrink-0", cfg.bg)}>
                          <cfg.Icon className={cn("h-2.5 w-2.5", cfg.text)} weight="bold" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-[0.15em] text-brand">{getRelativeDay(ev.date)}</span>
                      </div>
                      <p className="text-xs font-black tracking-tight text-slate-900 dark:text-white leading-tight line-clamp-1 group-hover:text-brand transition-colors">
                        {ev.title}
                      </p>
                      {ev.location && (
                        <p className="text-[10px] font-medium text-slate-500 dark:text-[#888] truncate mt-1 flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />{ev.location}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2.5 gap-2">
                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-[#555] truncate">{tripName}</p>
                        {ev.time && <span className="text-[10px] font-bold text-slate-400 dark:text-[#666] tabular-nums shrink-0">{ev.time}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Two-column layout ── */}
          <div data-compact-grid className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-stretch">

            {/* ══ LEFT COLUMN ══ */}
            <div className="flex flex-col gap-8 min-w-0">

              {/* ── Upcoming Trip ── */}
              <section>
                <div data-compact-section-head className="mb-4">
                  <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Upcoming Trips</h2>
                  <p className="text-xs text-slate-500 dark:text-[#888888] mt-0.5">Your next departures</p>
                </div>

                {upcomingCards.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {upcomingCards.map(trip => {
                      return (
                        <button
                          key={trip.id}
                          onClick={() => handleOpenTrip(trip)}
                          className="group bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent shadow-sm dark:shadow-none rounded-2xl p-3 flex items-center gap-3 text-left hover:border-brand/40 hover:shadow-lg hover:shadow-brand/[0.06] transition-[border-color,box-shadow] duration-200 cursor-pointer"
                        >
                          <img src={trip.image} alt="" className="h-12 w-12 rounded-xl object-cover shrink-0 group-hover:scale-105 transition-transform duration-500" />
                          <div className="text-left flex-1 min-w-0">
                            <p className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-none truncate">
                              {trip.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">
                              <span className="flex items-center gap-1 whitespace-nowrap min-w-0"><MapPin className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{trip.destination || "—"}</span></span>
                              <span className="text-slate-300 dark:text-[#333]">·</span>
                              <span className="flex items-center gap-1 whitespace-nowrap"><LucideCalendar className="h-2.5 w-2.5 shrink-0" />{format(parseTripDate(trip.start), "MMM d")}</span>
                              {trip.paxCount && (
                                <>
                                  <span className="text-slate-300 dark:text-[#333]">·</span>
                                  <span className="flex items-center gap-1 whitespace-nowrap"><Users className="h-2.5 w-2.5 shrink-0" />{trip.paxCount}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 dark:text-[#555] group-hover:text-brand transition-colors shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-[#111111] border-2 border-dashed border-black/[0.06] dark:border-transparent rounded-2xl flex flex-col items-center justify-center py-12 text-slate-500 dark:text-[#888888]">
                    <LucideCalendar className="h-7 w-7 mb-3 opacity-40" />
                    <p className="text-xs font-bold uppercase tracking-widest">No upcoming trips</p>
                    <button onClick={() => { if (!demoGate()) setIsNewTripOpen(true); }} className="mt-3 text-[10px] font-bold text-brand hover:underline">Create one →</button>
                  </div>
                )}
              </section>

              {/* ── For your X Trip — Place Cards ── */}
              {spotlightTrip && (
                <section className="flex-1 flex flex-col min-h-0">
                  <div data-compact-section-head className="mb-1">
                    <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                      For your{" "}
                      <span className="text-brand uppercase">{spotlightTrip.destination || spotlightTrip.name.split(" ")[0]}</span>
                      {" "}Trip
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-[#888888] mt-0.5">Key events on your itinerary</p>
                  </div>

                  {spotlightPlaces.length > 0 ? (
                    <div data-compact-place-list className="mt-4 flex-1 flex flex-col gap-3">
                      {spotlightPlaces.map((ev) => {
                        const cfg = EVENT_COLORS[ev.type as keyof typeof EVENT_COLORS] || EVENT_COLORS.activity;
                        const hasImg = !!ev.image;
                        const typeLabel =
                          ev.type === "flight"    ? "Flight"
                          : ev.type === "hotel"   ? "Stay"
                          : ev.type === "dining"  ? "Dining"
                          : ev.type === "transfer" ? "Transfer"
                          : "Activity";
                        const eventDate = ev.date ? new Date(ev.date + "T12:00:00") : null;
                        const weekdayLabel = eventDate
                          ? eventDate.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()
                          : null;
                        const monthDayLabel = eventDate
                          ? eventDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()
                          : null;
                        const rawTime = ev.time?.trim();
                        const hasRealTime = rawTime && rawTime !== "00:00" && rawTime !== "0:00";
                        const timeParts = hasRealTime ? rawTime.split(/\s+/) : null;

                        // Type-specific detail row
                        const detail: React.ReactNode =
                          ev.type === "flight" && (ev.airline || ev.flightNum || ev.duration) ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              {(ev.airline || ev.flightNum) && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-[#ddd]">
                                  <AirplaneTilt className="h-3 w-3 text-brand" weight="regular" />
                                  {[ev.airline, ev.flightNum].filter(Boolean).join(" · ")}
                                </span>
                              )}
                              {ev.duration && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-[#888]">
                                  <Clock className="h-3 w-3" weight="regular" />
                                  {ev.duration}
                                </span>
                              )}
                            </div>
                          ) : ev.type === "hotel" && (ev.roomType || ev.checkin || ev.checkout) ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              {ev.roomType && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-[#ddd]">
                                  <Bed className="h-3 w-3 text-brand" weight="regular" />
                                  {ev.roomType}
                                </span>
                              )}
                              {(ev.checkin || ev.checkout) && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-[#888]">
                                  {ev.checkin || "—"}
                                  <ArrowRight className="h-2.5 w-2.5" weight="bold" />
                                  {ev.checkout || "—"}
                                </span>
                              )}
                            </div>
                          ) : (ev.price || ev.endTime) ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              {ev.price && (
                                <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold", cfg.text)}>
                                  <Tag className="h-3 w-3" weight="regular" />
                                  {ev.price}
                                </span>
                              )}
                              {ev.endTime && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-[#888]">
                                  <Clock className="h-3 w-3" weight="regular" />
                                  ends {ev.endTime}
                                </span>
                              )}
                            </div>
                          ) : null;

                        return (
                          <button
                            key={ev.id}
                            onClick={() => handleOpenTrip(spotlightTrip!, ev.id)}
                            data-compact-place className="text-left bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent shadow-sm dark:shadow-none rounded-2xl overflow-hidden flex flex-col sm:flex-row flex-1 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/[0.05] transition-[border-color,box-shadow] duration-200 group"
                          >
                            {/* Top/Left: image */}
                            <div data-compact-place-img className="h-28 sm:h-auto sm:w-[160px] sm:min-h-[120px] shrink-0 relative overflow-hidden">
                              {hasImg ? (
                                <img src={ev.image} alt={ev.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                              ) : (
                                <div className={`h-full w-full flex items-center justify-center ${cfg.bg}`}>
                                  <cfg.Icon className={`h-8 w-8 ${cfg.text} opacity-60`} />
                                </div>
                              )}
                            </div>

                            {/* Center: content */}
                            <div data-compact-place-body className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col justify-between gap-2">
                              {/* Top: type pill + title + inline time on mobile */}
                              <div className="min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.15em]", cfg.bg, cfg.text)}>
                                    <cfg.Icon className="h-2.5 w-2.5" weight="bold" />
                                    {typeLabel}
                                  </div>
                                  {(hasRealTime || monthDayLabel) && (
                                    <span className="sm:hidden text-[10px] font-bold text-slate-500 dark:text-[#888] uppercase tracking-wider shrink-0">
                                      {timeParts ? timeParts.join(" ") : monthDayLabel}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1.5 text-sm font-black tracking-tight text-slate-900 dark:text-white leading-tight line-clamp-1">
                                  {ev.title}
                                </p>

                                {ev.location && (
                                  <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-[#888] min-w-0">
                                    <MapPin className="h-3 w-3 shrink-0" weight="regular" />
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
                                      <Hash className="h-2.5 w-2.5" weight="bold" />
                                      {ev.confNumber}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Right: when block — weekday, big time, date (desktop only, shown inline on mobile) */}
                            {(timeParts || eventDate) && (
                              <div className="hidden sm:flex shrink-0 flex-col items-center justify-center gap-0.5 px-5 min-w-[96px] border-l border-slate-100 dark:border-[#1a1a1a]">
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
                      className="mt-4 bg-white dark:bg-[#111111] rounded-2xl border border-dashed border-black/[0.06] dark:border-transparent flex items-center justify-center py-10 text-slate-500 dark:text-[#888888] cursor-pointer hover:border-brand/40 transition-colors group"
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
            <div data-compact-sidebar className="flex flex-col gap-4">

              {/* Needs Attention */}
              {attentionItems.length > 0 && (
                <div className="bg-white dark:bg-[#111111] border border-amber-200/50 dark:border-amber-500/10 shadow-sm dark:shadow-none rounded-3xl overflow-hidden">
                  <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
                    <Warning className="h-4 w-4 text-amber-500 shrink-0" weight="fill" />
                    <div>
                      <p className="text-base font-black tracking-tight text-slate-900 dark:text-white leading-none">Needs Attention</p>
                      <p className="text-xs text-slate-500 dark:text-[#888888] mt-1">{attentionItems.length} trip{attentionItems.length !== 1 ? "s" : ""} to review</p>
                    </div>
                  </div>
                  <div className="px-3 pb-4 space-y-1">
                    {attentionItems.map(item => (
                      <button
                        key={item.tripId}
                        type="button"
                        onClick={() => navigate(`/trip/${item.tripId}`)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-500/[0.04] transition-colors text-left group"
                      >
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          item.severity === "warn" ? "bg-amber-500" : "bg-slate-400 dark:bg-[#555]"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-brand transition-colors">{item.tripName}</p>
                          <p className="text-[10px] font-medium text-slate-500 dark:text-[#888] mt-0.5">{item.message}</p>
                        </div>
                        <ArrowUpRight className="h-3 w-3 text-slate-400 dark:text-[#555] group-hover:text-brand transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* At a Glance — stats card */}
              <div className="bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent shadow-sm dark:shadow-none rounded-3xl overflow-hidden">
                <div className="px-5 pt-5 pb-3">
                  <p className="text-base font-black tracking-tight text-slate-900 dark:text-white leading-none">At a Glance</p>
                  <p className="text-xs text-slate-500 dark:text-[#888888] mt-1">Your travel snapshot</p>
                </div>

                <div className="grid grid-cols-2 gap-2 px-3 pb-2">
                  {[
                    { icon: Globe, label: "Trips", value: stats.pipeline.total },
                    { icon: LucideCalendar, label: "Travel Days", value: stats.totalDays },
                    { icon: AirplaneTilt, label: "Flights", value: stats.insights.flightCount },
                    { icon: Bed, label: "Hotels", value: stats.insights.hotelCount },
                  ].map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="rounded-2xl bg-slate-50 dark:bg-[#0a0a0a] px-3 py-3 group/stat hover:bg-brand/[0.04] dark:hover:bg-brand/[0.06] transition-colors"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Icon className="h-3.5 w-3.5 text-brand" weight="regular" />
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#888]">{label}</span>
                      </div>
                      <p className="text-2xl font-black tracking-tighter text-slate-900 dark:text-white leading-none tabular-nums">
                        <NumberFlow value={value} />
                      </p>
                    </div>
                  ))}
                </div>

                <div className="px-5 pb-5 pt-2 space-y-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#555] mb-1">Pipeline</p>
                  {[
                    { label: "Published", count: stats.pipeline.published, color: "bg-brand" },
                    { label: "Draft", count: stats.pipeline.draft, color: "bg-slate-300 dark:bg-[#333]" },
                    { label: "Active", count: trips.filter(t => t.status === "In Progress" || (parseTripDate(t.start) <= new Date() && parseTripDate(t.end) >= new Date())).length, color: "bg-emerald-500" },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-[#888] w-[60px] shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-[#1a1a1a] overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-700 ease-out", color)}
                          style={{ width: stats.pipeline.total > 0 ? `${Math.max(6, (count / stats.pipeline.total) * 100)}%` : "0%" }}
                        />
                      </div>
                      <span className="text-[10px] font-black text-slate-900 dark:text-white w-5 text-right tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Spotlight trip — brand cinema card */}
              {spotlightTrip && (() => {
                const days   = tripDuration(spotlightTrip.start, spotlightTrip.end);
                const nights = Math.max(1, days - 1);
                const agent  = spotlightTrip.attendees.split(",")[0]?.trim() || "Agent";
                const pax    = spotlightTrip.paxCount || "—";
                const dateRange = (() => {
                  const s = parseTripDate(spotlightTrip.start);
                  const e = parseTripDate(spotlightTrip.end);
                  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
                  return `${s.toLocaleDateString("en-US", opts)} — ${e.toLocaleDateString("en-US", opts)}`;
                })();
                const statusStyle =
                  spotlightTrip.status === "Published"  ? "bg-brand text-[#050505]"
                  : spotlightTrip.status === "In Progress" ? "bg-white/15 text-white backdrop-blur border border-brand/40"
                  : "bg-white/15 text-white/80 backdrop-blur border border-white/15";

                return (
                  <div className="bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent shadow-sm dark:shadow-none rounded-3xl overflow-hidden">
                    {/* Full-bleed hero */}
                    <div data-compact-spotlight-hero className="relative h-[200px]">
                      <img src={spotlightTrip.image} alt={spotlightTrip.name} className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/90" />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />

                      {/* Status + eyebrow */}
                      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                        <span className="text-[9px] font-bold tracking-[0.22em] text-brand uppercase">
                          Dalefy · Spotlight
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
                    <div data-compact-stat-grid className="grid grid-cols-2 gap-2 px-3 sm:px-5 pt-4 pb-4">
                      {[
                        { icon: LucideCalendar, label: "Duration", value: `${days} day${days === 1 ? "" : "s"}` },
                        { icon: Users,          label: "Pax",      value: pax },
                      ].map(({ icon: Icon, label, value }) => (
                        <div
                          key={label}
                          className="rounded-2xl bg-slate-50 dark:bg-[#0a0a0a] border border-transparent dark:border-transparent px-3 py-2.5"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon className="h-3 w-3 text-brand" weight="regular" />
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
                        className="w-full h-11 rounded-2xl bg-brand hover:opacity-90 text-[#050505] font-bold text-xs uppercase tracking-[0.12em] transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20 hover:shadow-brand/30"
                      >
                        Open Itinerary <ArrowUpRight className="h-3.5 w-3.5" weight="bold" />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Travel Calendar */}
              {(() => {
                const tripRanges = trips.map(t => ({
                  from: new Date(t.start + "T00:00:00"),
                  to: new Date(t.end + "T00:00:00"),
                }));
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const activeDays: Date[] = [];
                const tripDayMap = new Map<string, { tripId: string; tripName: string }>();
                trips.forEach(t => {
                  const s = new Date(t.start + "T00:00:00");
                  const e = new Date(t.end + "T00:00:00");
                  const isActive = s <= now && e >= now;
                  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
                    const key = d.toISOString().split("T")[0];
                    tripDayMap.set(key, { tripId: t.id, tripName: t.name });
                    if (isActive) activeDays.push(new Date(d));
                  }
                });

                const handleDayClick = (day: Date) => {
                  const key = day.toISOString().split("T")[0];
                  const trip = tripDayMap.get(key);
                  if (trip) navigate(`/trip/${trip.tripId}`);
                };

                const modifiers = {
                  tripDay: tripRanges.flatMap(r => {
                    const days: Date[] = [];
                    for (let d = new Date(r.from); d <= r.to; d.setDate(d.getDate() + 1)) days.push(new Date(d));
                    return days;
                  }),
                  activeDay: activeDays,
                };

                return (
                  <div className="bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent shadow-sm dark:shadow-none rounded-3xl overflow-hidden flex-1 flex flex-col">
                    <div className="px-4 pt-4 pb-1 flex items-center justify-between">
                      <p className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-none">Calendar</p>
                      <button
                        onClick={() => setCalMonth(new Date())}
                        className="text-[8px] font-bold uppercase tracking-wider text-brand hover:text-brand/80 transition-colors"
                      >
                        Today
                      </button>
                    </div>
                    <div className="flex-1 flex flex-col justify-center px-1 pb-2 daf-sidebar-cal">
                      <DayPicker
                        mode="single"
                        month={calMonth}
                        onMonthChange={setCalMonth}
                        showOutsideDays
                        modifiers={modifiers}
                        modifiersClassNames={{
                          tripDay: "!bg-brand/10 !text-brand !font-bold",
                          activeDay: "!bg-brand !text-white !font-black",
                        }}
                        onDayClick={handleDayClick}
                        components={{
                          DayContent: ({ date }) => {
                            const key = date.toISOString().split("T")[0];
                            const trip = tripDayMap.get(key);
                            if (trip) {
                              return (
                                <Tooltip>
                                  <TooltipTrigger className="w-full h-full flex items-center justify-center">
                                    {date.getDate()}
                                  </TooltipTrigger>
                                  <TooltipContent side="top">{trip.tripName}</TooltipContent>
                                </Tooltip>
                              );
                            }
                            return <>{date.getDate()}</>;
                          },
                          IconLeft: () => <CaretRight className="h-3 w-3 rotate-180" />,
                          IconRight: () => <CaretRight className="h-3 w-3" />,
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

            </div>{/* end right col */}
          </div>{/* end 2-col grid */}

          {/* ── All Trips — full width ── */}
          <section className="space-y-4">
            <div data-compact-section-head className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">All Trips</h3>
                <span className="text-[10px] font-bold text-brand bg-brand/10 px-3 py-1.5 rounded-full">{filteredTrips.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="md:hidden relative">
                  <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 dark:text-slate-400" />
                  <input aria-label="Search trips" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="pl-8 h-9 bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent shadow-sm dark:shadow-none rounded-full text-xs font-medium w-28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 text-slate-900 dark:text-white" />
                </div>
<div className="flex gap-1 bg-white dark:bg-[#111111] p-1 rounded-2xl border border-black/[0.06] dark:border-transparent shadow-sm dark:shadow-none">
                  <button aria-label="Grid view" onClick={() => setDisplayMode("grid")} className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${displayMode === "grid" ? "bg-brand text-[#050505] shadow-md" : "text-slate-500 dark:text-[#888888] hover:text-slate-700 dark:hover:text-white"}`}><GridFour className="h-4 w-4" /></button>
                  <button aria-label="List view" onClick={() => setDisplayMode("list")} className={`h-9 w-9 rounded-xl flex items-center justify-center transition-[background-color,color] ${displayMode === "list" ? "bg-brand text-[#050505] shadow-md" : "text-slate-500 dark:text-[#888888] hover:text-slate-700 dark:hover:text-white"}`}><List className="h-4 w-4" /></button>
                </div>
              </div>
            </div>

            {displayMode === "grid" ? (
              <div data-compact-trip-grid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTrips.map((trip) => {
                  const startDate = parseTripDate(trip.start);
                  const endDate = parseTripDate(trip.end);
                  const dateStr = `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                  const daysLeft = daysUntil(trip.start);
                  const isActive = trip.status === "In Progress";
                  const isUpcoming = daysLeft > 0;
                  return (
                    <div key={trip.id} data-compact-trip-card className="group isolate relative rounded-[2rem] overflow-hidden flex flex-col min-h-[340px] cursor-pointer ring-1 ring-slate-200 dark:ring-[#1f1f1f] hover:ring-brand/40 hover:shadow-xl hover:shadow-brand/[0.08] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5" style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }} onClick={() => handleOpenTrip(trip)}>
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
                      <div data-compact-card-bottom className="relative z-10 mt-auto p-5">
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
                        <div className="absolute -top-14 right-4 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="h-8 w-8 rounded-xl bg-black/60 backdrop-blur text-white/70 hover:text-white transition-colors flex items-center justify-center cursor-pointer">
                              <DotsThreeVertical className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent text-slate-900 dark:text-white rounded-xl shadow-2xl p-1" align="end">
                              <DropdownMenuItem onClick={() => { if (!demoGate()) handleDuplicateTrip(trip); }} className="gap-2 p-2 rounded-lg font-bold text-xs hover:bg-brand/10 text-slate-700 dark:text-[#ccc]"><Copy className="h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { if (!demoGate()) handleSaveAsTemplate(trip); }} className="gap-2 p-2 rounded-lg font-bold text-xs hover:bg-brand/10 text-slate-700 dark:text-[#ccc]"><FloppyDisk className="h-3.5 w-3.5" /> Save as Template</DropdownMenuItem>
                              {(!isOrgMember || canDeleteTrip) && (
                                <DropdownMenuItem onClick={() => { if (!demoGate()) setDeletingTripId(trip.id); }} className="gap-2 p-2 rounded-lg font-bold text-xs text-destructive hover:bg-destructive/10"><Trash className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => { if (!demoGate()) setIsNewTripOpen(true); }} aria-label="Create new trip" className="group bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-[#111111] dark:via-[#111111] dark:to-[#0a0a0a] rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-[#222] flex flex-col items-center justify-center py-12 text-slate-400 dark:text-[#666] hover:border-brand hover:text-brand transition-[border-color,color] cursor-pointer min-h-[340px]">
                  <div className="h-16 w-16 rounded-2xl bg-brand/[0.06] dark:bg-brand/[0.08] border border-brand/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-brand/15 transition-all duration-300"><Plus className="h-6 w-6" /></div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em]">New Trip</p>
                  <p className="text-[10px] font-medium text-slate-400 dark:text-[#555] mt-1">Plan your next adventure</p>
                </button>
              </div>
            ) : (
              <div data-compact-list className="flex flex-col gap-3">
                {filteredTrips.length === 0 && (
                  <div className="bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent rounded-2xl flex flex-col items-center justify-center py-20">
                    <div className="h-14 w-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-3">
                      <AirplaneTilt className="h-6 w-6 text-brand opacity-60" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#555]">No trips yet</p>
                    <button onClick={() => { if (!demoGate()) setIsNewTripOpen(true); }} className="text-[11px] font-bold text-brand hover:underline mt-2">Create your first trip →</button>
                  </div>
                )}
                {filteredTrips.map(trip => {
                  const tStart = parseTripDate(trip.start);
                  const tEnd = parseTripDate(trip.end);
                  const tDateStr = `${tStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${tEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                  const dLeft = daysUntil(trip.start);
                  const isActive = trip.status === "In Progress";
                  return (
                    <div
                      key={trip.id}
                      data-compact-table-row
                      onClick={() => handleOpenTrip(trip)}
                      className="group bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-[#1f1f1f] shadow-sm dark:shadow-none rounded-2xl overflow-hidden flex items-stretch cursor-pointer hover:border-brand/40 hover:shadow-md transition-[border-color,box-shadow] duration-200"
                    >
                      {/* Image */}
                      <div data-compact-thumb className="w-28 sm:w-36 shrink-0 relative overflow-hidden">
                        <img src={trip.image} alt={trip.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/10" />
                      </div>

                      {/* Content */}
                      <div data-compact-table-content className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col justify-center gap-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-none truncate group-hover:text-brand transition-colors">
                            {trip.name}
                          </p>
                          <span className={`inline-flex items-center gap-1 shrink-0 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                            isActive
                              ? "bg-brand/10 text-brand"
                              : trip.status === "Published"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-[#666]"
                          }`}>
                            <span className={`h-1 w-1 rounded-full ${
                              isActive ? "bg-brand animate-pulse"
                              : trip.status === "Published" ? "bg-emerald-500 dark:bg-emerald-400"
                              : "bg-slate-400 dark:bg-slate-500"
                            }`} />
                            {isActive ? "Active" : trip.status}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">
                          {trip.destination && (
                            <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5 text-brand" />{trip.destination}</span>
                          )}
                          <span className="flex items-center gap-1"><LucideCalendar className="h-2.5 w-2.5 text-brand" />{tDateStr}</span>
                          <span className="flex items-center gap-1"><Users className="h-2.5 w-2.5" />{trip.paxCount || trip.attendees.split(",").length}</span>
                          <span className="flex items-center gap-1"><Compass className="h-2.5 w-2.5" />{trip.events.length} events</span>
                        </div>
                      </div>

                      {/* Right: countdown + actions */}
                      <div className="shrink-0 flex items-center gap-2 px-3 sm:px-4">
                        {dLeft > 0 && parseTripDate(trip.end) >= new Date() && (
                          <span className="text-[10px] font-black bg-brand/10 text-brand px-2.5 py-1 rounded-full leading-none tracking-wide whitespace-nowrap">
                            {dLeft === 0 ? "Today" : `${dLeft}d`}
                          </span>
                        )}
                        <div onClick={e => e.stopPropagation()} className="flex items-center gap-1.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger className="h-8 w-8 rounded-lg text-slate-400 dark:text-[#555] hover:text-brand hover:bg-slate-50 dark:hover:bg-[#050505] transition-colors flex items-center justify-center cursor-pointer">
                              <DotsThreeVertical className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent text-slate-900 dark:text-white rounded-xl shadow-2xl p-1" align="end">
                              <DropdownMenuItem onClick={() => { if (!demoGate()) handleDuplicateTrip(trip); }} className="gap-2 p-2 rounded-lg font-bold text-xs hover:bg-brand/10 text-slate-700 dark:text-[#ccc]"><Copy className="h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { if (!demoGate()) handleSaveAsTemplate(trip); }} className="gap-2 p-2 rounded-lg font-bold text-xs hover:bg-brand/10 text-slate-700 dark:text-[#ccc]"><FloppyDisk className="h-3.5 w-3.5" /> Save as Template</DropdownMenuItem>
                              {(!isOrgMember || canDeleteTrip) && (
                                <DropdownMenuItem onClick={() => { if (!demoGate()) setDeletingTripId(trip.id); }} className="gap-2 p-2 rounded-lg font-bold text-xs text-destructive hover:bg-destructive/10"><Trash className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 dark:text-[#555] group-hover:text-brand transition-colors" />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredTrips.length > 0 && (
                  <button
                    onClick={() => { if (!demoGate()) setIsNewTripOpen(true); }}
                    className="group bg-white dark:bg-[#111111] border border-dashed border-slate-200 dark:border-[#222] rounded-2xl flex items-center gap-3 px-4 py-3.5 text-slate-400 dark:text-[#666] hover:border-brand hover:text-brand transition-[border-color,color] cursor-pointer"
                  >
                    <div className="h-9 w-9 rounded-xl bg-brand/[0.06] dark:bg-brand/[0.08] border border-brand/10 flex items-center justify-center shrink-0 group-hover:bg-brand/15 transition-colors">
                      <Plus className="h-4 w-4" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.15em]">New Trip</span>
                  </button>
                )}
              </div>
            )}

            {/* ── Templates ── */}
            {templates.length > 0 && (
              <div className="mt-6">
                <div data-compact-section-head className="flex items-center gap-3 mb-3">
                  <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">Templates</h3>
                  <span className="text-[10px] font-bold text-brand bg-brand/10 px-2.5 py-1 rounded-full">{templates.length}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {templates.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => handleCreateFromTemplate(tpl)}
                      className="group bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent shadow-sm dark:shadow-none rounded-2xl p-3 flex items-center gap-3 text-left hover:border-brand/50 hover:shadow-md transition-[border-color,box-shadow] duration-200 cursor-pointer"
                    >
                      <img src={tpl.image} alt="" className="h-12 w-12 rounded-xl object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-none truncate">{tpl.name}</p>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">
                          {tpl.destination && <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{tpl.destination}</span>}
                          <span className="flex items-center gap-1"><Stack className="h-2.5 w-2.5" />{tpl.events.length} events</span>
                        </div>
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 dark:text-[#555] group-hover:text-brand transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
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
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[2rem] bg-white dark:bg-[#111111] border-t border-transparent dark:border-transparent max-h-[90vh] focus:outline-none">
            <div className="mx-auto w-12 h-1 rounded-full bg-slate-200 dark:bg-[#2a2a2a] mt-4 shrink-0" />
            <div className="flex-1 overflow-y-auto px-6 sm:px-10 pb-10">
              <div className="pt-6 pb-6 flex items-start justify-between">
                <div>
                  <Drawer.Title className="text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white">New Trip</Drawer.Title>
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#555] mt-1">Build your next adventure</p>
                </div>
                <button onClick={() => setIsNewTripOpen(false)} className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-[#1a1a1a] border border-transparent dark:border-transparent flex items-center justify-center text-slate-400 dark:text-[#555] hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Import-from-file shortcut */}
              <button
                type="button"
                onClick={() => { setIsNewTripOpen(false); setImportOpen(true); }}
                className="w-full mb-8 flex items-center gap-3 px-4 py-3 rounded-2xl border border-dashed border-black/[0.06] dark:border-transparent bg-slate-50 dark:bg-[#0a0a0a] hover:border-brand/60 hover:bg-brand/5 transition-colors group text-left"
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
                    className="w-full h-14 px-0 bg-transparent border-0 border-b border-black/[0.08] dark:border-transparent text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight focus:outline-none focus:border-brand placeholder:text-slate-300 dark:placeholder:text-[#333] transition-colors" />
                </div>

                {/* Trip Type */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666]">Trip Type</label>
                  <div className="flex flex-wrap gap-2">
                    {["Leisure", "FAM Trip", "Honeymoon", "Corporate", "Adventure", "Group", "Cruise"].map(t => (
                      <button key={t} type="button" onClick={() => setNewTripData({ ...newTripData, tripType: newTripData.tripType === t ? "" : t })}
                        className={`px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all border ${newTripData.tripType === t ? "bg-brand text-black border-brand shadow-lg shadow-brand/20" : "bg-slate-50 dark:bg-[#0a0a0a] border-black/[0.06] dark:border-transparent text-slate-500 dark:text-[#888] hover:border-brand/40"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Destination + Pax */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><MapPin className="h-3 w-3" /> Destination</label>
                    <input name="destination" autoComplete="off" value={newTripData.destination} onChange={e => setNewTripData({ ...newTripData, destination: e.target.value })} placeholder="e.g., Kenya, East Africa"
                      className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-transparent dark:border-transparent rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-brand/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><Users className="h-3 w-3" /> No. of Travelers</label>
                    <input type="number" min="1" name="pax-count" autoComplete="off" value={newTripData.paxCount} onChange={e => setNewTripData({ ...newTripData, paxCount: e.target.value })} placeholder="e.g., 12"
                      className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-transparent dark:border-transparent rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-brand/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all" />
                  </div>
                </div>

                {/* Group */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><Briefcase className="h-3 w-3" /> Group / Client</label>
                  <input required name="attendees" autoComplete="organization" value={newTripData.attendees} onChange={e => setNewTripData({ ...newTripData, attendees: e.target.value })} placeholder="e.g., Senior Agents"
                    className="w-full h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-transparent dark:border-transparent rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-brand/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all" />
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
                  <div className="rounded-2xl border border-transparent dark:border-transparent bg-slate-50 dark:bg-[#0a0a0a] w-full">
                    <Calendar mode="range" defaultMonth={newTripData.dateRange?.from ?? new Date()} selected={newTripData.dateRange} onSelect={range => setNewTripData({ ...newTripData, dateRange: range })} numberOfMonths={1} className="w-full" />
                  </div>
                </div>

                {/* Budget + Currency */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-[#666] flex items-center gap-2"><CurrencyDollar className="h-3 w-3" /> Total Budget (Optional)</label>
                  <div className="flex gap-2">
                    <input
                      name="budget"
                      autoComplete="off"
                      inputMode="numeric"
                      value={newTripData.budget}
                      onChange={e => setNewTripData({ ...newTripData, budget: e.target.value.replace(/[^0-9]/g, "") })}
                      placeholder="e.g. 45000"
                      className="flex-1 h-12 px-4 bg-slate-50 dark:bg-[#0a0a0a] border border-transparent dark:border-transparent rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:outline-none focus:border-brand/50 placeholder:text-slate-400 dark:placeholder:text-[#555] transition-all"
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
                              : "bg-slate-50 dark:bg-[#0a0a0a] border-black/[0.06] dark:border-transparent text-slate-500 dark:text-[#555] hover:text-slate-800 dark:hover:text-white hover:border-black/[0.12] dark:hover:border-white/[0.12]"
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
                      <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-[#555] pointer-events-none" />
                      <input
                        value={coverSearch}
                        onChange={e => setCoverSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); runCoverSearch(coverSearch); } }}
                        placeholder="Search destinations…"
                        className="w-full h-10 pl-9 pr-3 bg-slate-50 dark:bg-[#0a0a0a] border border-transparent dark:border-transparent rounded-2xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus:outline-none focus:border-brand/50 transition-colors"
                      />
                    </div>
                    <button type="button" onClick={() => runCoverSearch(coverSearch)}
                      className="h-10 px-4 rounded-2xl bg-brand text-black text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center gap-1.5 shrink-0">
                      {isCoverSearching ? <SpinnerGap className="h-3 w-3 animate-spin" /> : <MagnifyingGlass className="h-3 w-3" />}
                    </button>
                    {coverResults.length > 0 && (
                      <>
                        <button type="button" aria-label="Refresh" onClick={() => runCoverSearch(coverLastQuery || coverSearch, coverPage)} disabled={isCoverSearching}
                          className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-[#1a1a1a] border border-transparent dark:border-transparent flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-brand transition-colors shrink-0 disabled:opacity-40">
                          <ArrowClockwise className={`h-3.5 w-3.5 ${isCoverSearching ? "animate-spin" : ""}`} />
                        </button>
                        <button type="button" aria-label="Next page" onClick={() => runCoverSearch(coverLastQuery || coverSearch, coverPage + 1)} disabled={isCoverSearching}
                          className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-[#1a1a1a] border border-transparent dark:border-transparent flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-brand transition-colors shrink-0 disabled:opacity-40">
                          <CaretRight className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => { setCoverResults([]); setCoverSearch(""); setCoverPage(1); setCoverLastQuery(""); }}
                          className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-[#1a1a1a] border border-transparent dark:border-transparent flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-colors shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                  {/* Thumbnail grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {isCoverSearching ? (
                      <div className="col-span-2 sm:col-span-4 flex items-center justify-center h-20 gap-2 text-slate-500 dark:text-[#888]">
                        <SpinnerGap className="h-4 w-4 animate-spin text-brand" />
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
                      COVER_IMAGES.map(({ url, label }) => (
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
                    className="flex-1 h-12 rounded-2xl bg-slate-50 dark:bg-[#0a0a0a] border border-transparent dark:border-transparent text-slate-500 dark:text-[#666] text-xs font-black uppercase tracking-wider hover:text-slate-900 dark:hover:text-white hover:border-black/[0.1] dark:hover:border-white/[0.1] transition-all">
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
      <DemoUpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}
