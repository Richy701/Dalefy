import { useState, useMemo, memo, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus, Search, Compass, Globe, Zap, Plane, Calendar as LucideCalendar, Trash2, ArrowUpRight,
  MoreVertical, LayoutGrid, List, ExternalLink, Users, Activity, CheckCircle2, Sun, Moon,
  MapPin, DollarSign, Briefcase, Expand
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
import { useNotifications } from "@/context/NotificationContext";
import { useTripStats } from "@/hooks/useTripStats";
import { NotificationPanel } from "@/components/shared/NotificationPanel";
import { ImportItineraryDialog } from "@/components/shared/ImportItineraryDialog";
import { InviteTeamDialog } from "@/components/shared/InviteTeamDialog";
import { MobileSidebar } from "@/components/sidebar/MobileSidebar";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

const StatCard = memo(function StatCard({ label, value, sub, icon, accent }: { label: string; value: number; sub: string; icon: ReactNode; accent?: boolean }) {
  return (
    <div className={`relative rounded-3xl flex flex-col justify-between p-6 lg:p-8 h-52 group hover:-translate-y-1 transition-all duration-500 ${
      accent
        ? "bg-[#0bd2b5] shadow-2xl shadow-[#0bd2b5]/25"
        : "bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] shadow-xl hover:border-[#0bd2b5]/30 hover:shadow-2xl"
    }`}>
      {/* Label + icon */}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-[0.3em] ${accent ? "text-[#050505]/60" : "text-slate-400 dark:text-[#666]"}`}>{label}</span>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300 ${
          accent ? "bg-[#050505]/10 text-[#050505]" : "bg-[#0bd2b5]/10 text-[#0bd2b5]"
        }`}>
          {icon}
        </div>
      </div>

      {/* Number + sub */}
      <div>
        <NumberFlow value={value} className={`text-6xl font-black italic tracking-tighter leading-none ${accent ? "text-[#050505]" : "text-slate-900 dark:text-white"}`} />
        <p className={`text-[10px] font-bold uppercase tracking-[0.3em] mt-3 ${accent ? "text-[#050505]/50" : "text-slate-400 dark:text-[#555]"}`}>{sub}</p>
      </div>
    </div>
  );
});

export function DashboardPage() {
  const { trips, addTrip, deleteTrip } = useTrips();
  const { theme, toggleTheme } = useTheme();
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
  const [newTripData, setNewTripData] = useState<{
    name: string; attendees: string; dateRange: DateRange | undefined; image: string;
    destination: string; paxCount: string; tripType: string; budget: string; currency: string;
  }>({ name: "", attendees: "", dateRange: undefined, image: "", destination: "", paxCount: "", tripType: "", budget: "", currency: "USD" });

  const filteredTrips = useMemo(() => {
    return trips.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.attendees.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [trips, searchQuery]);

  const lightboxSlides = useMemo(() =>
    filteredTrips.map(t => ({ src: t.image, title: t.name, description: t.destination })),
    [filteredTrips]
  );

  const openLightbox = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

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
    showToast("Trip removed");
    toast.success("Trip removed");
  };

  const handleOpenTrip = (trip: Trip) => navigate(`/trip/${trip.id}`);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#050505] relative">
      {/* Header */}
      <header className="h-20 shrink-0 border-b border-slate-200 dark:border-[#1f1f1f] px-4 lg:px-10 flex items-center justify-between sticky top-0 z-40 bg-slate-50/80 dark:bg-[#050505]/80 backdrop-blur-md">
        <div className="flex-1 flex items-center gap-4 lg:gap-8">
          <MobileSidebar />
          <div className="max-w-md w-full relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888] group-focus-within:text-[#0bd2b5] transition-colors" />
            <label htmlFor="search-trips" className="sr-only">Search trips</label>
            <input id="search-trips" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="SEARCH TRIPS..." className="pl-12 h-12 bg-white dark:bg-[#111111] border-none rounded-full text-slate-900 dark:text-white placeholder:text-slate-500/40 dark:placeholder:text-[#888888]/40 focus:outline-none focus:ring-2 focus:ring-[#0bd2b5]/20 w-full text-xs font-bold tracking-widest uppercase shadow-inner" />
          </div>
        </div>
        <div className="flex items-center gap-3 lg:gap-6">
          <button aria-label="Toggle theme" onClick={toggleTheme} className="h-10 w-10 rounded-full bg-white dark:bg-[#111111] hover:bg-slate-100 dark:hover:bg-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:text-[#0bd2b5] transition-all border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center cursor-pointer shadow-sm">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <NotificationPanel />
          <div className="h-8 w-px bg-slate-200 dark:bg-[#1f1f1f] hidden lg:block" />
          <Button onClick={() => setIsNewTripOpen(true)} className="rounded-full bg-[#0bd2b5] hover:opacity-90 text-slate-900 dark:text-black font-bold h-10 px-4 lg:px-8 transition-all gap-2 text-xs uppercase tracking-wider">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">NEW TRIP</span>
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="w-full space-y-16 px-4 lg:px-10 py-10">
          {/* Stats */}
          <div className="space-y-8">
            <h2 className="text-3xl lg:text-5xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white animate-fade-up">Trip Manager</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              <div className="animate-fade-up stagger-1"><StatCard label="TRIPS" value={trips.length} sub="ALL TIME" icon={<Compass className="h-5 w-5" />} accent /></div>
              <div className="animate-fade-up stagger-2"><StatCard label="DESTINATIONS" value={stats.destinationCount} sub="WORLDWIDE" icon={<Globe className="h-5 w-5" />} /></div>
              <div className="animate-fade-up stagger-3"><StatCard label="DRAFTS" value={trips.filter(t => t.status === "Draft").length} sub="NOT YET LIVE" icon={<Zap className="h-5 w-5" />} /></div>
              <div className="animate-fade-up stagger-4"><StatCard label="UPCOMING" value={stats.upcoming} sub="NEXT 7 DAYS" icon={<Plane className="h-5 w-5" />} /></div>
            </div>
          </div>

          {/* Quick Actions — unified horizontal strip */}
          <div className="space-y-5">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400 dark:text-[#888]">QUICK ACTIONS</span>
            <div className="flex flex-col sm:flex-row rounded-3xl overflow-hidden border border-slate-200 dark:border-[#1f1f1f] shadow-lg">
              {/* Create Trip */}
              <button onClick={() => setIsNewTripOpen(true)} className="group relative flex-[1.3] overflow-hidden bg-[#0bd2b5] flex items-center gap-5 px-8 py-7 sm:py-0 sm:h-24 hover:brightness-105 transition-all cursor-pointer text-left">
                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[90px] font-black italic text-[#050505]/[0.07] leading-none select-none pointer-events-none">+</div>
                <div className="h-11 w-11 rounded-xl bg-[#050505]/[0.12] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                  <Plus className="h-5 w-5 text-[#050505]" strokeWidth={2.5} />
                </div>
                <div className="relative z-10">
                  <p className="text-lg font-black uppercase tracking-tight text-[#050505] leading-none">New Trip</p>
                  <p className="text-[10px] font-bold text-[#050505]/50 mt-1 uppercase tracking-[0.2em]">Create itinerary</p>
                </div>
              </button>

              <div className="hidden sm:block w-px bg-slate-200 dark:bg-[#1f1f1f] shrink-0" />
              <div className="sm:hidden h-px bg-[#050505]/10" />

              {/* Import */}
              <button onClick={() => setImportOpen(true)} className="group flex-1 bg-white dark:bg-[#111111] flex items-center gap-4 px-8 py-6 sm:py-0 sm:h-24 hover:bg-slate-50 dark:hover:bg-[#0a0a0a] transition-colors cursor-pointer text-left">
                <div className="h-9 w-9 rounded-xl bg-[#0bd2b5]/10 border border-[#0bd2b5]/20 flex items-center justify-center shrink-0 group-hover:bg-[#0bd2b5]/20 transition-colors">
                  <ExternalLink className="h-4 w-4 text-[#0bd2b5]" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white leading-none">Import</p>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-[#666] mt-1 uppercase tracking-[0.2em]">PDF · Doc · Text</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-300 dark:text-[#444] group-hover:text-[#0bd2b5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
              </button>

              <div className="hidden sm:block w-px bg-slate-200 dark:bg-[#1f1f1f] shrink-0" />
              <div className="sm:hidden h-px bg-slate-100 dark:bg-[#1f1f1f]" />

              {/* Invite */}
              <button onClick={() => setInviteOpen(true)} className="group flex-1 bg-white dark:bg-[#111111] flex items-center gap-4 px-8 py-6 sm:py-0 sm:h-24 hover:bg-slate-50 dark:hover:bg-[#0a0a0a] transition-colors cursor-pointer text-left">
                <div className="h-9 w-9 rounded-xl bg-[#0bd2b5]/10 border border-[#0bd2b5]/20 flex items-center justify-center shrink-0 group-hover:bg-[#0bd2b5]/20 transition-colors">
                  <Users className="h-4 w-4 text-[#0bd2b5]" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white leading-none">Invite Team</p>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-[#666] mt-1 uppercase tracking-[0.2em]">Collaborators</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-300 dark:text-[#444] group-hover:text-[#0bd2b5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
              </button>
            </div>
          </div>

          {/* Upcoming + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* Upcoming */}
            <div className="lg:col-span-3 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-3xl overflow-hidden">
              <div className="flex items-center justify-between px-8 pt-7 pb-6 border-b border-slate-100 dark:border-[#1a1a1a]">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#0bd2b5]/10 text-[#0bd2b5] flex items-center justify-center shrink-0">
                    <LucideCalendar className="h-5 w-5" />
                  </div>
                  <span className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white">Upcoming</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#0bd2b5] bg-[#0bd2b5]/10 px-3 py-1.5 rounded-full">NEXT 30 DAYS</span>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-[#1a1a1a]">
                {trips.filter(t => t.status !== "Draft").sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4).map((trip, i) => {
                  const startDate = new Date(trip.start);
                  const today = new Date();
                  const daysUntil = Math.max(0, Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                  const isNext = i === 0;
                  return (
                    <button key={trip.id} onClick={() => handleOpenTrip(trip)} className="flex items-center gap-5 w-full text-left px-8 py-5 hover:bg-slate-50 dark:hover:bg-[#0a0a0a] transition-colors group cursor-pointer">
                      <div className="relative shrink-0">
                        <div className={`h-16 w-24 rounded-xl overflow-hidden border-2 transition-all duration-300 ${isNext ? "border-[#0bd2b5] shadow-lg shadow-[#0bd2b5]/15" : "border-slate-100 dark:border-[#222] group-hover:border-[#0bd2b5]/40"}`}>
                          <img src={trip.image} alt={trip.name} loading="lazy" className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        </div>
                        {isNext && <div className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 bg-[#0bd2b5] rounded-full ring-2 ring-white dark:ring-[#111111] shadow-sm" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-black uppercase tracking-tight text-slate-900 dark:text-white truncate group-hover:text-[#0bd2b5] transition-colors leading-none">{trip.name}</p>
                        <p className="text-xs text-slate-400 dark:text-[#666] mt-2 font-medium">{trip.attendees}</p>
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest mt-2 ${
                          trip.status === "Published" ? "bg-emerald-500/10 text-emerald-500" :
                          trip.status === "In Progress" ? "bg-[#0bd2b5]/10 text-[#0bd2b5]" :
                          "bg-slate-100 dark:bg-[#1a1a1a] text-slate-400"
                        }`}>{trip.status}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-4xl font-black italic tracking-tighter leading-none ${daysUntil <= 7 ? "text-[#0bd2b5]" : "text-slate-200 dark:text-[#333]"}`}>
                          <NumberFlow value={daysUntil} />
                        </p>
                        <p className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${daysUntil <= 7 ? "text-[#0bd2b5]/70" : "text-slate-400 dark:text-[#555]"}`}>
                          {daysUntil === 0 ? "TODAY" : daysUntil === 1 ? "DAY" : "DAYS"}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-[#555] mt-2 uppercase tracking-wider font-bold">{startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Activity */}
            <div className="lg:col-span-2 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-3xl overflow-hidden">
              <div className="flex items-center justify-between px-8 pt-7 pb-6 border-b border-slate-100 dark:border-[#1a1a1a]">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#0bd2b5]/10 text-[#0bd2b5] flex items-center justify-center shrink-0">
                    <Activity className="h-5 w-5" />
                  </div>
                  <span className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white">Activity</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#0bd2b5] animate-pulse " />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0bd2b5]">LIVE</span>
                </div>
              </div>
              <div className="px-8 py-3">
                {[
                  { action: "Trip created", detail: "Kenya Luxury Safari", time: "2h ago", icon: <Plus className="h-4 w-4" />, color: "bg-[#0bd2b5]/15 text-[#0bd2b5]" },
                  { action: "Published", detail: "Maldives Retreat", time: "5h ago", icon: <CheckCircle2 className="h-4 w-4" />, color: "bg-emerald-400/15 text-emerald-400" },
                  { action: "Event added", detail: "Flight QR28 to Doha", time: "1d ago", icon: <Plane className="h-4 w-4" />, color: "bg-blue-400/15 text-blue-400" },
                  { action: "Team invited", detail: "EU Sales Team", time: "2d ago", icon: <Users className="h-4 w-4" />, color: "bg-violet-400/15 text-violet-400" },
                  { action: "Trip created", detail: "Japan Discovery", time: "3d ago", icon: <Plus className="h-4 w-4" />, color: "bg-[#0bd2b5]/15 text-[#0bd2b5]" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4 py-5 relative">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>{item.icon}</div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white leading-none">{item.action}</p>
                      <p className="text-xs text-slate-400 dark:text-[#666] mt-1.5 truncate font-medium">{item.detail}</p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-300 dark:text-[#444] shrink-0 uppercase tracking-wider pt-0.5">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* All Trips */}
          <div className="space-y-10 pb-20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 lg:gap-5">
                <h3 className="text-4xl lg:text-5xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white">All Trips</h3>
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#0bd2b5] bg-[#0bd2b5]/10 px-3 py-1.5 rounded-full">{filteredTrips.length} Trips</span>
              </div>
              <div className="flex gap-1 bg-white dark:bg-[#111111] p-1 rounded-2xl border border-slate-200 dark:border-[#1f1f1f] shadow-sm">
                <button aria-label="Grid view" onClick={() => setDisplayMode("grid")} className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${displayMode === "grid" ? "bg-[#0bd2b5] text-[#050505] shadow-md" : "text-slate-400 dark:text-[#555] hover:text-slate-700 dark:hover:text-white"}`}><LayoutGrid className="h-4 w-4" /></button>
                <button aria-label="List view" onClick={() => setDisplayMode("list")} className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${displayMode === "list" ? "bg-[#0bd2b5] text-[#050505] shadow-md" : "text-slate-400 dark:text-[#555] hover:text-slate-700 dark:hover:text-white"}`}><List className="h-4 w-4" /></button>
              </div>
            </div>
            {displayMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 lg:gap-10">
                {filteredTrips.map((trip, tripIndex) => {
                  const startDate = new Date(trip.start);
                  const endDate = new Date(trip.end);
                  const dateStr = `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                  return (
                    <div key={trip.id} className="group relative rounded-[2rem] overflow-hidden border border-white/10 dark:border-white/5 flex flex-col min-h-[440px] cursor-pointer transition-transform duration-300 hover:-translate-y-1">
                      {/* Full-bleed image */}
                      <div className="absolute inset-0" onClick={() => handleOpenTrip(trip)}>
                        <img src={trip.image} alt={trip.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/95 via-[#050505]/25 to-[#050505]/5" />
                      </div>

                      {/* Top badges */}
                      <div className="relative z-10 flex items-start justify-between p-6">
                        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] border ${trip.status === "Published" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/20" : trip.status === "In Progress" ? "bg-[#0bd2b5]/20 text-[#0bd2b5] border-[#0bd2b5]/20" : "bg-[#050505]/50 text-white/60 border-white/10"}`}>
                          {trip.status === "Published" ? "✓ Published" : trip.status === "In Progress" ? "● Live" : "Draft"}
                        </span>
                        <div className="flex items-center gap-2">
                          {trip.events.length > 0 && (
                            <span className="bg-[#050505]/60 text-white/60 text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-white/10">
                              {trip.events.length} Events
                            </span>
                          )}
                          <button
                            onClick={(e) => openLightbox(tripIndex, e)}
                            aria-label="View full image"
                            className="h-7 w-7 rounded-full bg-[#050505]/60 text-white/60 hover:text-white hover:bg-[#0bd2b5]/80 flex items-center justify-center border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
                          >
                            <Expand className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Bottom content */}
                      <div className="relative z-10 mt-auto p-6" onClick={() => handleOpenTrip(trip)}>
                        {trip.destination && (
                          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#0bd2b5] mb-2">{trip.destination}</p>
                        )}
                        <h3 className="text-2xl font-black italic uppercase tracking-tight leading-tight text-white mb-4 line-clamp-2">{trip.name}</h3>

                        <div className="flex items-center gap-2 flex-wrap mb-5">
                          <div className="flex items-center gap-1.5 bg-[#050505]/50 border border-white/10 rounded-full px-2.5 py-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-white/70 max-w-[120px] truncate">{trip.attendees}</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-[#050505]/50 border border-white/10 rounded-full px-2.5 py-1">
                            <LucideCalendar className="h-2.5 w-2.5 text-[#0bd2b5] shrink-0" />
                            <span className="text-[9px] font-bold uppercase tracking-wider text-white/70">{dateStr}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-white/10" onClick={e => e.stopPropagation()}>
                          <button aria-label="Delete trip" onClick={() => handleDeleteTrip(trip.id)} className="h-8 w-8 rounded-xl bg-[#050505]/50 text-white/40 hover:bg-red-500/20 hover:text-red-400 transition-colors flex items-center justify-center border border-white/10">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleOpenTrip(trip)} className="flex items-center gap-2 h-8 px-4 rounded-xl bg-[#050505]/50 text-white/80 hover:bg-[#0bd2b5] hover:text-[#050505] text-[10px] font-bold uppercase tracking-wider transition-colors border border-white/10">
                            Open <ArrowUpRight className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => setIsNewTripOpen(true)} aria-label="Create new trip" className="group bg-white dark:bg-[#111111] rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] flex flex-col items-center justify-center py-20 text-slate-500 dark:text-[#888888] hover:border-[#0bd2b5] hover:text-[#0bd2b5] transition-all cursor-pointer shadow-none min-h-[440px]">
                  <div className="h-20 w-20 rounded-full bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm"><Plus className="h-10 w-10" /></div>
                  <p className="font-bold text-xs uppercase tracking-[0.3em]">CREATE NEW TRIP</p>
                </button>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] overflow-hidden shadow-2xl">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-[#050505]">
                    <TableRow className="hover:bg-transparent border-slate-200 dark:border-[#1f1f1f]">
                      <TableHead className="pl-8 py-6 text-[11px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em]">PREVIEW</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em]">DESTINATION</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em]">ATTENDEES</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em]">TIMELINE</TableHead>
                      <TableHead className="text-[11px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em]">EVENTS</TableHead>
                      <TableHead className="text-right pr-8 text-[11px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em]">ACTIONS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrips.map(trip => {
                      const tStart = new Date(trip.start);
                      const tEnd = new Date(trip.end);
                      const tDateStr = `${tStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${tEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                      return (
                        <TableRow key={trip.id} className="group hover:bg-slate-50 dark:hover:bg-[#050505] transition-colors cursor-pointer border-slate-200 dark:border-[#1f1f1f] h-24" onClick={() => handleOpenTrip(trip)}>
                          <TableCell className="pl-8 py-2">
                            <div className="h-16 w-20 rounded-xl overflow-hidden border border-slate-200 dark:border-[#1f1f1f]"><img src={trip.image} alt={trip.name} className="h-full w-full object-cover" /></div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-extrabold uppercase tracking-tight text-slate-900 dark:text-white text-lg group-hover:text-[#0bd2b5] transition-colors leading-none">{trip.name}</span>
                              <Badge className={`w-fit text-xs font-bold px-2 py-0.5 h-auto border-none mt-2 uppercase tracking-tighter text-slate-900 dark:text-black ${trip.status === "Published" ? "bg-emerald-400" : "bg-[#0bd2b5]"}`}>{trip.status}</Badge>
                            </div>
                          </TableCell>
                          <TableCell><span className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">{trip.attendees || "Team"}</span></TableCell>
                          <TableCell className="text-slate-500 dark:text-[#888888]"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest"><LucideCalendar className="h-3.5 w-3.5 text-[#0bd2b5]" />{tDateStr}</div></TableCell>
                          <TableCell><span className="text-xs font-black italic text-slate-900 dark:text-white tracking-tighter">{trip.events.length}</span></TableCell>
                          <TableCell className="text-right pr-8">
                            <div onClick={e => e.stopPropagation()} className="flex items-center justify-end gap-3">
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-slate-900 dark:hover:text-white transition-all shadow-sm" onClick={() => handleOpenTrip(trip)}><ExternalLink className="h-4 w-4" /></Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-[#0bd2b5] transition-all focus:outline-none flex items-center justify-center cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-[#1f1f1f] shadow-sm">
                                  <MoreVertical className="h-4 w-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white rounded-xl shadow-2xl p-1" align="end">
                                  <DropdownMenuItem onClick={() => handleDeleteTrip(trip.id)} className="gap-2 p-2 rounded-lg font-bold text-xs uppercase tracking-wider text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> DELETE</DropdownMenuItem>
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
          </div>
        </div>
      </div>

      {/* New Trip Modal */}
      <Dialog open={isNewTripOpen} onOpenChange={setIsNewTripOpen}>
        <DialogContent className="max-w-3xl w-[95vw] bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-0 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
          <div className="px-10 pt-10 pb-6 border-b border-slate-200 dark:border-[#1f1f1f] shrink-0">
            <h2 className="text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Create New Trip</h2>
            <p className="text-slate-500 dark:text-[#888888] font-medium uppercase text-xs tracking-[0.2em] mt-1">Set up the details for your team's upcoming travel experience.</p>
          </div>
          <form onSubmit={handleCreateTripSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-10 py-8 space-y-7">
              {/* Title */}
              <div className="space-y-3">
                <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">Itinerary Title</Label>
                <Input required value={newTripData.name} onChange={e => setNewTripData({ ...newTripData, name: e.target.value })} placeholder="e.g., Kenya Fam Trip" className="h-14 text-xl font-extrabold uppercase tracking-tight bg-transparent border-0 border-b border-slate-200 dark:border-[#1f1f1f] rounded-none focus-visible:ring-0 focus-visible:border-[#0bd2b5] px-1 transition-all placeholder:text-slate-500/20 dark:placeholder:text-[#888888]/20" />
              </div>

              {/* Trip Type */}
              <div className="space-y-3">
                <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">Trip Type</Label>
                <div className="flex flex-wrap gap-2">
                  {["Leisure", "FAM Trip", "Honeymoon", "Corporate", "Adventure", "Group", "Cruise"].map(t => (
                    <button key={t} type="button" onClick={() => setNewTripData({ ...newTripData, tripType: newTripData.tripType === t ? "" : t })}
                      className={`px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all border ${newTripData.tripType === t ? "bg-[#0bd2b5] text-black border-[#0bd2b5] shadow-lg shadow-[#0bd2b5]/20" : "bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888] hover:border-[#0bd2b5]/40"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Destination + Pax */}
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">Destination</Label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888]" />
                    <Input value={newTripData.destination} onChange={e => setNewTripData({ ...newTripData, destination: e.target.value })} placeholder="e.g., Kenya, East Africa" className="h-12 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-semibold text-slate-900 dark:text-white focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]" />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">No. of Travelers</Label>
                  <div className="relative">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888]" />
                    <Input type="number" min="1" value={newTripData.paxCount} onChange={e => setNewTripData({ ...newTripData, paxCount: e.target.value })} placeholder="e.g., 12" className="h-12 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-semibold text-slate-900 dark:text-white focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]" />
                  </div>
                </div>
              </div>

              {/* Attendee + Dates */}
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">Group / Client Name</Label>
                  <div className="relative">
                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888]" />
                    <Input required value={newTripData.attendees} onChange={e => setNewTripData({ ...newTripData, attendees: e.target.value })} placeholder="e.g., Senior Agents" className="h-12 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-semibold text-slate-900 dark:text-white focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]" />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">Travel Dates</Label>
                  <Popover>
                    <PopoverTrigger className={cn("w-full h-12 justify-start text-left font-semibold bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl hover:bg-white dark:hover:bg-[#111111] transition-all px-4 flex items-center gap-3", !newTripData.dateRange && "text-slate-500 dark:text-[#888888]")}>
                      <LucideCalendar className="h-4 w-4 text-[#0bd2b5] shrink-0" />
                      {newTripData.dateRange?.from ? (newTripData.dateRange.to ? <>{format(newTripData.dateRange.from, "MMM d")} – {format(newTripData.dateRange.to, "MMM d, yyyy")}</> : format(newTripData.dateRange.from, "MMM d, yyyy")) : <span className="opacity-50 text-sm">Select dates...</span>}
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border border-slate-200 dark:border-[#2a2a2a] shadow-2xl rounded-[1.5rem] bg-white dark:bg-[#1a1a1a]" align="start">
                      <Calendar initialFocus mode="range" defaultMonth={newTripData.dateRange?.from} selected={newTripData.dateRange} onSelect={range => setNewTripData({ ...newTripData, dateRange: range })} numberOfMonths={2} className="p-4" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Budget + Currency */}
              <div className="grid grid-cols-3 gap-5">
                <div className="col-span-2 space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">Total Budget (Optional)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888]" />
                    <Input value={newTripData.budget} onChange={e => setNewTripData({ ...newTripData, budget: e.target.value })} placeholder="e.g., 45,000" className="h-12 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-semibold text-slate-900 dark:text-white focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]" />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">Currency</Label>
                  <select value={newTripData.currency} onChange={e => setNewTripData({ ...newTripData, currency: e.target.value })} className="h-12 w-full px-4 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0bd2b5]/20 focus:border-[#0bd2b5] text-sm appearance-none cursor-pointer">
                    {["USD", "GBP", "EUR", "AUD", "JPY", "AED", "ZAR"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Cover Image */}
              <div className="space-y-3">
                <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">Cover Image URL (Optional)</Label>
                <div className="relative">
                  <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888]" />
                  <Input value={newTripData.image} onChange={e => setNewTripData({ ...newTripData, image: e.target.value })} placeholder="https://images.unsplash.com/..." className="h-12 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-medium text-slate-900 dark:text-white focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-10 py-6 border-t border-slate-200 dark:border-[#1f1f1f] flex items-center justify-between shrink-0 bg-white dark:bg-[#111111]">
              <button type="button" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-colors px-4 py-2" onClick={() => setIsNewTripOpen(false)}>Cancel</button>
              <Button type="submit" className="rounded-2xl h-12 px-10 font-bold bg-[#0bd2b5] hover:opacity-90 text-slate-900 dark:text-black shadow-xl shadow-[#0bd2b5]/20 transition-all uppercase tracking-wider text-xs">Create Itinerary</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
