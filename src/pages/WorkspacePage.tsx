import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import "leaflet/dist/leaflet.css";
import {
  ChevronLeft, Sun, Moon, Map as MapIcon, Loader2, Plus, Plane, Hotel, Compass, Utensils, Camera, CalendarDays, Users, MapPin, RefreshCcw, Sparkles, Search, X, Upload, Video, Image as ImageIcon2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { TravelEvent } from "@/types";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useNotifications } from "@/context/NotificationContext";
import { EventCard } from "@/components/workspace/EventCard";
import { SortableEventCard } from "@/components/workspace/SortableEventCard";
import { DaySection } from "@/components/workspace/DaySection";
import { DockBar } from "@/components/workspace/DockBar";
import { TripMap } from "@/components/workspace/TripMap";
import { TripMediaGallery } from "@/components/workspace/TripMediaGallery";
import { AiZapDialog } from "@/components/shared/AiZapDialog";
import { FlightSearch } from "@/components/workspace/FlightSearch";
import { HotelSearch } from "@/components/workspace/HotelSearch";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// ─── Auto-image generation ────────────────────────────────────────────────────
const IMG = (id: string) => `https://images.unsplash.com/photo-${id}?q=80&w=1200&auto=format&fit=crop`;

const IMAGE_BANK: Record<string, string[]> = {
  flight:   [IMG("1436491865332-7a61a109cc05"), IMG("1464037866556-6812c9d1c72e"), IMG("1559628377-4b107ed2bfbc"), IMG("1570710891163-6d3b5c47248b")],
  hotel:    [IMG("1551882547-ff40c63fe5fa"), IMG("1582719508461-905c673771fd"), IMG("1566073771259-6a8506099945"), IMG("1520250497591-112f2f40a3f4"), IMG("1542314831-068cd1dbfeeb")],
  safari:   [IMG("1516426122078-c23e76319801"), IMG("1547471080-7cc2caa01a7e"), IMG("1504701954957-2010ec3bcec1"), IMG("1534177616072-ef7dc120449d"), IMG("1523805009345-7448845a9e53")],
  beach:    [IMG("1512100356356-de1b84283e18"), IMG("1573843981267-be1999ff37cd"), IMG("1544551763-46a013bb70d5"), IMG("1507525428034-b723cf961d3e")],
  japan:    [IMG("1493976040374-85c8e12f0c0e"), IMG("1545569341-9eb8b30979d9"), IMG("1528360983277-13d401cdc186"), IMG("1540959733332-eab4deabeeaf")],
  dining:   [IMG("1414235077428-338989a2e8c0"), IMG("1555396273-367ea4eb4db5"), IMG("1559339352-11d035aa65de"), IMG("1504674900247-0877df9cc836")],
  activity: [IMG("1527631746610-bca00a040d60"), IMG("1551632811-561732d1e306"), IMG("1564760055775-d63b17a55c44"), IMG("1517649763962-0c623066013b")],
  mountain: [IMG("1531366936337-7c912a4589a7"), IMG("1506905925346-21bda4d32df4"), IMG("1464822759023-fed622ff2c3b")],
  city:     [IMG("1496442226666-8d4d0e62e6e9"), IMG("1477959858617-67f85cf4f1df"), IMG("1534430480872-3498386e7856")],
  italy:    [IMG("1534445538923-ab38e5b0c99b"), IMG("1516483638261-f4dbaf036963")],
  bali:     [IMG("1537996194471-e657df975ab4"), IMG("1518548419970-58e3b4079ab2")],
};

const KEYWORD_MAP: Array<[string, string]> = [
  ["kenya","safari"],["safari","safari"],["mara","safari"],["masai","safari"],["amboseli","safari"],
  ["elephant","safari"],["lion","safari"],["wildlife","safari"],["game drive","safari"],["bush","safari"],["angama","safari"],["hemingway","safari"],
  ["maldives","beach"],["bali","bali"],["beach","beach"],["ocean","beach"],["coral","beach"],["snorkel","beach"],["dive","beach"],
  ["japan","japan"],["tokyo","japan"],["kyoto","japan"],["osaka","japan"],["sushi","japan"],["omakase","japan"],["jiro","dining"],
  ["alps","mountain"],["mountain","mountain"],["ski","mountain"],["snow","mountain"],["switzerland","mountain"],["iceland","mountain"],["glacier","mountain"],
  ["amalfi","italy"],["italy","italy"],["florence","italy"],["rome","italy"],["venice","italy"],
  ["hotel","hotel"],["resort","hotel"],["lodge","hotel"],["villa","hotel"],["hyatt","hotel"],["marriott","hotel"],["hilton","hotel"],["camp","safari"],
  ["dinner","dining"],["lunch","dining"],["breakfast","dining"],["restaurant","dining"],["cuisine","dining"],["carnivore","dining"],["boma","dining"],
  ["flight","flight"],["airways","flight"],["airport","flight"],["charter","flight"],["airline","flight"],
  ["balloon","activity"],["tour","activity"],["cultural","activity"],["museum","activity"],["temple","activity"],["market","activity"],["walk","activity"],
  ["new york","city"],["london","city"],["paris","city"],["dubai","city"],
];

function getEventImageCategory(title: string, type: string): string {
  const lower = title.toLowerCase();
  for (const [kw, cat] of KEYWORD_MAP) {
    if (lower.includes(kw)) return cat;
  }
  if (type === "flight") return "flight";
  if (type === "hotel") return "hotel";
  if (type === "dining") return "dining";
  return "activity";
}

function generateEventImage(title: string, type: string, seed: number): string {
  const cat = getEventImageCategory(title, type);
  const bank = IMAGE_BANK[cat] ?? IMAGE_BANK.activity;
  return bank[((seed % bank.length) + bank.length) % bank.length];
}
// ─────────────────────────────────────────────────────────────────────────────

export function WorkspacePage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { trips, updateTrip, updateEvent, deleteEvent } = useTrips();
  const { theme, toggleTheme } = useTheme();
  const { showToast, addNotification } = useNotifications();

  const trip = useMemo(() => trips.find(t => t.id === tripId) || null, [trips, tripId]);
  const [showMap, setShowMap] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TravelEvent | null>(null);
  const [imageSeed, setImageSeed] = useState(0);
  const [imageIsAuto, setImageIsAuto] = useState(false);
  const [imageSearch, setImageSearch] = useState("");
  const [imageResults, setImageResults] = useState<string[]>([]);
  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const [imageSearchSource, setImageSearchSource] = useState<"google" | "unsplash" | "local" | null>(null);
  const [aiZapOpen, setAiZapOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"itinerary" | "media">("itinerary");
  const printRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !trip) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Find which day these events belong to
    const allEvents = [...trip.events];
    const activeEvent = allEvents.find(e => e.id === activeId);
    const overEvent = allEvents.find(e => e.id === overId);
    if (!activeEvent || !overEvent || activeEvent.date !== overEvent.date) return;

    // Get the events for this day and reorder them
    const dayDate = activeEvent.date;
    const dayEvents = allEvents.filter(e => e.date === dayDate);
    const otherEvents = allEvents.filter(e => e.date !== dayDate);

    const oldIndex = dayEvents.findIndex(e => e.id === activeId);
    const newIndex = dayEvents.findIndex(e => e.id === overId);
    const reorderedDayEvents = arrayMove(dayEvents, oldIndex, newIndex);

    updateTrip(trip.id, { events: [...otherEvents, ...reorderedDayEvents] });
    toast.success("Events reordered");
  }, [trip, updateTrip]);

  const runImageSearch = async (query: string) => {
    if (!query.trim()) return;
    setIsSearchingImages(true);
    try {
      const googleKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
      const googleCx = import.meta.env.VITE_GOOGLE_CSE_ID as string | undefined;
      const unsplashKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined;

      if (googleKey && googleCx) {
        try {
          const res = await fetch(
            `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${encodeURIComponent(query + " travel photo")}&searchType=image&num=9&imgSize=xlarge&safe=active`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.items?.length) {
              setImageResults(data.items.map((i: { link: string }) => i.link));
              setImageSearchSource("google");
              return;
            } else {
              console.warn("[ImageSearch] Google CSE returned no items:", data);
            }
          } else {
            const err = await res.json().catch(() => ({}));
            console.warn(`[ImageSearch] Google CSE failed (${res.status}):`, err);
          }
        } catch (e) {
          console.warn("[ImageSearch] Google CSE fetch error:", e);
        }
      }

      if (unsplashKey) {
        try {
          const res = await fetch(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=9&orientation=landscape&client_id=${unsplashKey}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.results?.length) {
              setImageResults(data.results.map((r: { urls: { regular: string } }) => r.urls.regular));
              setImageSearchSource("unsplash");
              return;
            } else {
              console.warn("[ImageSearch] Unsplash returned no results:", data);
            }
          } else {
            const err = await res.json().catch(() => ({}));
            console.warn(`[ImageSearch] Unsplash failed (${res.status}):`, err);
          }
        } catch (e) {
          console.warn("[ImageSearch] Unsplash fetch error:", e);
        }
      }

      // Local bank fallback
      const cat = getEventImageCategory(query, editingEvent?.type || "activity");
      const bank = IMAGE_BANK[cat] ?? IMAGE_BANK.activity;
      setImageResults([...bank, ...(IMAGE_BANK.activity)].slice(0, 9));
      setImageSearchSource("local");
    } catch (e) {
      console.error("[ImageSearch] Unexpected error:", e);
      const cat = getEventImageCategory(query, editingEvent?.type || "activity");
      setImageResults(IMAGE_BANK[cat] ?? IMAGE_BANK.activity);
    } finally {
      setIsSearchingImages(false);
    }
  };

  const groupedEvents = useMemo(() => {
    if (!trip) return [];
    const groups: Record<string, TravelEvent[]> = {};
    const sorted = [...trip.events].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
    sorted.forEach(e => { if (!groups[e.date]) groups[e.date] = []; groups[e.date].push(e); });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [trip?.events]);

  if (!trip) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-[#050505]">
        <div className="text-center space-y-4">
          <p className="text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Trip not found</p>
          <Button onClick={() => navigate("/")} className="bg-[#0bd2b5] text-black font-bold rounded-xl">Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const handlePublish = async () => {
    setPublishing(true);
    await new Promise(r => setTimeout(r, 1500));
    updateTrip(trip.id, { status: "Published" });
    setPublishing(false);
    showToast("Trip published successfully");
    toast.success("Trip published successfully");
    addNotification({ message: "Trip published", detail: trip.name, time: "Just now", type: "success" });
  };

  // Auto-search + generate image when title changes
  useEffect(() => {
    if (!editingEvent || !isEditPanelOpen) return;
    const { title, type } = editingEvent;
    if (title.length < 3) return;
    if (imageIsAuto) {
      const img = generateEventImage(title, type, imageSeed);
      setEditingEvent(prev => prev ? { ...prev, image: img } : null);
    }
    const t = setTimeout(() => runImageSearch(title), 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEvent?.title, editingEvent?.type, imageSeed, imageIsAuto, isEditPanelOpen]);

  const handleAddEvent = (type: TravelEvent["type"] = "activity") => {
    setImageSeed(0);
    setImageIsAuto(true);
    setImageSearch("");
    setImageResults([]);
    setEditingEvent({
      id: Date.now().toString(),
      type,
      date: trip.start || new Date().toISOString().split("T")[0],
      title: "",
      time: "12:00 PM",
      location: "",
      status: "Proposed",
    });
    setIsEditPanelOpen(true);
  };

  const handleEditEvent = (event: TravelEvent) => {
    setImageSeed(0);
    setImageIsAuto(!event.image);
    setImageSearch("");
    setImageResults([]);
    setEditingEvent({ ...event });
    setIsEditPanelOpen(true);
    if (event.title) setTimeout(() => runImageSearch(event.title), 100);
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;
    updateEvent(trip.id, editingEvent);
    setIsEditPanelOpen(false);
    setEditingEvent(null);
    showToast("Event saved");
    toast.success("Event saved");
  };

  const handleDeleteEvent = (eventId: string) => {
    deleteEvent(trip.id, eventId);
    showToast("Event deleted");
    toast.success("Event deleted");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingEvent) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setEditingEvent(prev => prev ? { ...prev, image: ev.target?.result as string } : null);
    };
    reader.readAsDataURL(file);
  };

  const mediaInputRef = useRef<HTMLInputElement>(null);

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !editingEvent) return;
    const readers = files.map(file => new Promise<{ type: "image" | "video"; url: string; name: string }>((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve({
        type: file.type.startsWith("video/") ? "video" : "image",
        url: ev.target?.result as string,
        name: file.name,
      });
      reader.readAsDataURL(file);
    }));
    Promise.all(readers).then(newMedia => {
      setEditingEvent(prev => prev ? { ...prev, media: [...(prev.media || []), ...newMedia] } : null);
    });
    // Reset input so same file can be re-added if needed
    e.target.value = "";
  };

  const handleRemoveMedia = (index: number) => {
    setEditingEvent(prev => prev ? { ...prev, media: (prev.media || []).filter((_, i) => i !== index) } : null);
  };

  const handleExportPdf = async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: theme === "dark" ? "#050505" : "#ffffff",
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = pdfWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;

      let heightLeft = scaledHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, scaledHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = position - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, scaledHeight);
        heightLeft -= pdfHeight;
      }

      const filename = `${trip.name.toLowerCase().replace(/\s+/g, "-")}-itinerary.pdf`;
      pdf.save(filename);
      showToast("PDF exported successfully");
      toast.success("PDF exported successfully");
    } catch {
      showToast("PDF export failed", "error");
      toast.error("PDF export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-[#050505] w-full relative overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-white dark:bg-[#111111] border-b border-slate-200 dark:border-[#1f1f1f] px-4 lg:px-6 flex items-center justify-between sticky top-0 z-50 shadow-xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" aria-label="Go back to dashboard" onClick={() => navigate("/")} className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-[#050505] hover:bg-slate-100 dark:hover:bg-[#1a1a1a] text-slate-900 dark:text-white border border-slate-200 dark:border-[#1f1f1f] transition-colors shadow-sm"><ChevronLeft className="h-5 w-5" /></Button>
          <div className="h-6 w-px bg-slate-200 dark:bg-[#1f1f1f] hidden sm:block" />
          <div className="flex flex-col">
            <h2 className="text-lg font-extrabold uppercase tracking-tight text-slate-900 dark:text-white leading-none max-w-[180px] sm:max-w-[300px] truncate">{trip.name}</h2>
            <div className="flex items-center gap-2 mt-1 leading-none">
              <Badge className="bg-[#0bd2b5]/10 text-[#0bd2b5] border border-[#0bd2b5]/20 font-bold px-2 py-0 h-4 rounded-full text-xs uppercase tracking-wider">EDITING</Badge>
              <span className="text-[11px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.2em] leading-none hidden sm:inline">ATTENDEES: {trip.attendees}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 lg:gap-4">
          <button aria-label="Toggle theme" onClick={toggleTheme} className="h-10 w-10 rounded-xl bg-white dark:bg-[#111111] hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-[#0bd2b5] transition-all border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center cursor-pointer shadow-sm">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Button variant="ghost" onClick={() => setShowMap(!showMap)} className={`font-bold text-xs uppercase tracking-widest rounded-xl h-10 px-4 gap-2 border transition-all hidden lg:flex ${showMap ? "bg-[#0bd2b5] text-slate-900 dark:text-black border-transparent shadow-lg shadow-[#0bd2b5]/20" : "bg-white dark:bg-[#111111] text-slate-500 dark:text-[#888888] hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-[#1f1f1f] shadow-sm"}`}>
            <MapIcon className="h-4 w-4" /> {showMap ? "HIDE MAP" : "SHOW MAP"}
          </Button>
          <Button onClick={handleExportPdf} disabled={exporting} variant="outline" className="font-bold text-xs uppercase tracking-widest rounded-xl h-10 px-4 border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:text-[#0bd2b5] hidden sm:flex">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : "EXPORT PDF"}
          </Button>
          <Button onClick={handlePublish} disabled={publishing} className="bg-[#0bd2b5] hover:opacity-90 text-slate-900 dark:text-black font-bold h-10 px-4 lg:px-6 rounded-xl shadow-lg shadow-[#0bd2b5]/20 transition-all text-xs uppercase tracking-widest min-w-[100px]">
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : "PUBLISH"}
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Day sidebar */}
        <aside className="w-64 border-r border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] flex flex-col hidden lg:flex shadow-sm relative z-30">
          <div className="p-5 border-b border-slate-200 dark:border-[#1f1f1f] flex items-center justify-between bg-slate-50/30 dark:bg-[#050505]/30">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#0bd2b5]">ITINERARY</span>
            <Button variant="outline" size="icon" aria-label="Add event" onClick={() => handleAddEvent()} className="h-8 w-8 rounded-md bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] hover:bg-[#0bd2b5] hover:text-slate-900 dark:hover:text-black text-[#0bd2b5] transition-colors shadow-sm"><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {groupedEvents.map(([date], i) => (
                <button key={date} className={`w-full text-left p-3 rounded-xl group relative transition-all duration-300 ${i === 0 ? "bg-[#0bd2b5]/10 text-[#0bd2b5]" : "hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-slate-900 dark:hover:text-white"}`}>
                  <div className="flex items-center gap-3 relative z-10 leading-none">
                    <div className={`h-10 w-10 rounded-lg flex flex-col items-center justify-center font-black italic text-[11px] uppercase tracking-tighter ${i === 0 ? "bg-[#0bd2b5] text-slate-900 dark:text-black shadow-lg shadow-[#0bd2b5]/20" : "bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] shadow-sm"}`}>
                      <span className="opacity-70">{new Date(date).toLocaleDateString("en-US", { month: "short" })}</span>
                      <span className="text-xs mt-0.5">{new Date(date).getDate()}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold opacity-60 uppercase tracking-wider">DAY {i + 1}</span>
                      <span className="text-xs font-bold truncate leading-none mt-1 uppercase tracking-tighter italic">Scheduled</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </aside>

        <div className="flex-1 flex flex-row overflow-hidden relative">
          <main ref={printRef} className={`flex-1 flex flex-col relative bg-slate-50 dark:bg-[#050505] overflow-y-auto transition-all duration-500 ${showMap ? "lg:w-[60%]" : "w-full"}`}>
            {/* Trip banner */}
            <section className="relative h-[340px] lg:h-[400px] w-full group overflow-hidden shrink-0">
              <img src={trip.image} className="h-full w-full object-cover transition-transform duration-[2s] group-hover:scale-105" alt={trip.name} />
              {/* Multi-layer gradient for depth */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

              {/* Top row: status + event count pill */}
              <div className="absolute top-6 left-6 lg:left-8 right-6 lg:right-8 z-20 flex items-center justify-between">
                <Badge className={`rounded-full px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] border-none shadow-lg backdrop-blur-sm ${trip.status === "Published" ? "bg-emerald-500 text-white" : trip.status === "In Progress" ? "bg-[#0bd2b5] text-black" : "bg-white/20 text-white"}`}>
                  {trip.status === "In Progress" ? "● ACTIVE" : trip.status === "Published" ? "✓ PUBLISHED" : "DRAFT"}
                </Badge>
                <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">{trip.events.length} events</span>
                  <span className="text-white/30">·</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">{groupedEvents.length} days</span>
                </div>
              </div>

              {/* Bottom: trip identity */}
              <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-8 z-20">
                <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#0bd2b5] mb-2">DAF Adventures · Itinerary</p>
                <h3 className="text-3xl lg:text-5xl font-extrabold uppercase tracking-tight leading-none text-white drop-shadow-2xl mb-5">{trip.name}</h3>

                {/* Stat chips */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
                    <Users className="h-3 w-3 text-[#0bd2b5]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">{trip.attendees}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
                    <CalendarDays className="h-3 w-3 text-[#0bd2b5]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">
                      {new Date(trip.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {new Date(trip.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  {trip.destination && (
                    <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
                      <MapPin className="h-3 w-3 text-[#0bd2b5]" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">{trip.destination}</span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 lg:px-10 pt-6 shrink-0">
              <button
                onClick={() => setActiveTab("itinerary")}
                className={`px-5 py-2 rounded-xl text-[11px] font-black italic uppercase tracking-[0.2em] transition-all ${
                  activeTab === "itinerary"
                    ? "bg-[#0bd2b5] text-black shadow-lg shadow-[#0bd2b5]/20"
                    : "bg-white dark:bg-[#111111] text-slate-500 dark:text-[#888888] border border-slate-200 dark:border-[#1f1f1f] hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                ITINERARY
              </button>
              <button
                onClick={() => setActiveTab("media")}
                className={`px-5 py-2 rounded-xl text-[11px] font-black italic uppercase tracking-[0.2em] transition-all flex items-center gap-2 ${
                  activeTab === "media"
                    ? "bg-[#0bd2b5] text-black shadow-lg shadow-[#0bd2b5]/20"
                    : "bg-white dark:bg-[#111111] text-slate-500 dark:text-[#888888] border border-slate-200 dark:border-[#1f1f1f] hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                MEDIA
                {(trip.media?.length ?? 0) > 0 && (
                  <span className={`text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none ${activeTab === "media" ? "bg-black/20 text-black" : "bg-[#0bd2b5]/15 text-[#0bd2b5]"}`}>
                    {trip.media!.length}
                  </span>
                )}
              </button>
            </div>

            {/* Itinerary tab */}
            {activeTab === "itinerary" && (
              <>
                <div className="px-4 lg:px-10 pt-10 pb-32 w-full relative">
                  <div className="space-y-16">
                    {groupedEvents.length > 0 ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      {groupedEvents.map(([date, events]) => (
                        <DaySection key={date} date={new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()} eventCount={events.length} onAddEvent={() => handleAddEvent()}>
                          <SortableContext items={events.map(e => e.id)} strategy={verticalListSortingStrategy}>
                            <div className="grid grid-cols-1 gap-6 pl-8">
                              {events.map(event => (
                                <SortableEventCard key={event.id} event={event} onClick={() => handleEditEvent(event)} onDelete={() => handleDeleteEvent(event.id)} />
                              ))}
                            </div>
                          </SortableContext>
                        </DaySection>
                      ))}
                    </DndContext>
                  ) : (
                      <div className="flex flex-col items-center justify-center py-32 bg-white dark:bg-[#111111] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] rounded-[2rem] text-slate-500 dark:text-[#888888] hover:border-[#0bd2b5] transition-colors cursor-pointer group" onClick={() => handleAddEvent()}>
                        <Plus className="h-12 w-12 mb-4 opacity-20 group-hover:scale-110 group-hover:text-[#0bd2b5] transition-all" />
                        <p className="font-bold text-xs uppercase tracking-[0.3em]">ADD YOUR FIRST EVENT</p>
                      </div>
                    )}
                  </div>
                </div>
                <DockBar onAddEvent={handleAddEvent} onAiZap={() => setAiZapOpen(true)} />
              </>
            )}

            {/* Media tab */}
            {activeTab === "media" && (
              <TripMediaGallery
                media={trip.media ?? []}
                onUpdate={(media) => updateTrip(trip.id, { media })}
              />
            )}
          </main>

          {showMap && (
            <aside className="w-[40%] h-full border-l border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] hidden lg:block animate-in slide-in-from-right duration-500 relative z-40 overflow-hidden shadow-2xl">
              <TripMap theme={theme} trip={trip} />
            </aside>
          )}
        </div>
      </div>

      {/* Event Edit Dialog — full screen */}
      <Dialog open={isEditPanelOpen} onOpenChange={setIsEditPanelOpen}>
        <DialogContent className="max-w-5xl w-[95vw] p-0 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] shadow-2xl rounded-[2rem] overflow-hidden flex flex-col max-h-[90vh]">
          <form onSubmit={handleSaveEvent} className="flex flex-col h-full min-h-0">
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-200 dark:border-[#1f1f1f] flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">
                  {editingEvent?.title ? "Edit Travel Event" : "Add Event to Itinerary"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#888888] mt-1">Fill in the travel details for this event.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(["Proposed", "Confirmed", "Cancelled"] as const).map(s => (
                  <button key={s} type="button"
                    onClick={() => setEditingEvent(prev => prev ? { ...prev, status: s } : null)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all ${
                      editingEvent?.status === s
                        ? s === "Confirmed" ? "bg-emerald-400 text-black shadow-lg shadow-emerald-400/20"
                          : s === "Cancelled" ? "bg-red-500 text-white shadow-lg shadow-red-500/20"
                          : "bg-[#0bd2b5] text-black shadow-lg shadow-[#0bd2b5]/20"
                        : "bg-slate-100 dark:bg-[#1f1f1f] text-slate-500 dark:text-[#888] hover:bg-slate-200 dark:hover:bg-[#2a2a2a]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Body — two columns */}
            <div className="flex-1 grid grid-cols-5 min-h-0 overflow-hidden">
              {/* Left: core event fields */}
              <div className="col-span-3 overflow-y-auto border-r border-slate-200 dark:border-[#1f1f1f]">
                {/* Category tabs */}
                <div className="grid grid-cols-4 border-b border-slate-200 dark:border-[#1f1f1f]">
                  {([
                    { id: "flight", label: "Flight", icon: Plane, color: "text-blue-400" },
                    { id: "hotel", label: "Hotel", icon: Hotel, color: "text-amber-400" },
                    { id: "activity", label: "Activity", icon: Compass, color: "text-[#0bd2b5]" },
                    { id: "dining", label: "Dining", icon: Utensils, color: "text-pink-400" },
                  ] as const).map(cat => (
                    <button key={cat.id} type="button" onClick={() => setEditingEvent(prev => prev ? { ...prev, type: cat.id } : null)}
                      className={`flex flex-col items-center justify-center py-4 gap-1.5 border-b-2 transition-all ${editingEvent?.type === cat.id ? `border-[#0bd2b5] bg-[#0bd2b5]/5 ${cat.color}` : "border-transparent text-slate-400 dark:text-[#555] hover:text-slate-600 dark:hover:text-[#888] hover:bg-slate-50 dark:hover:bg-[#0a0a0a]"}`}>
                      <cat.icon className="h-5 w-5" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">{cat.label}</span>
                    </button>
                  ))}
                </div>

                {/* Live search — flight */}
                {editingEvent?.type === "flight" && (
                  <FlightSearch
                    onSelect={(data) => setEditingEvent(prev => prev ? { ...prev, ...data } : null)}
                    defaultDate={editingEvent?.date}
                  />
                )}

                {/* Live search — hotel */}
                {editingEvent?.type === "hotel" && (
                  <HotelSearch
                    onSelect={(data) => setEditingEvent(prev => prev ? { ...prev, ...data } : null)}
                    defaultCheckin={trip.start}
                    defaultCheckout={trip.end}
                  />
                )}

                <div className="p-7 space-y-5">
                  {/* Title — large underline style */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#0bd2b5]">Event Title</label>
                    <input
                      value={editingEvent?.title || ""}
                      onChange={e => setEditingEvent(prev => prev ? { ...prev, title: e.target.value } : null)}
                      placeholder="e.g., Private Maasai Mara Flight"
                      className="w-full bg-transparent border-0 border-b-2 border-slate-200 dark:border-[#2a2a2a] focus:border-[#0bd2b5] focus:outline-none text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white pb-2 placeholder:text-slate-300 dark:placeholder:text-[#333] transition-colors"
                    />
                  </div>

                  {/* Date + Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">Date</label>
                      <Popover>
                        <PopoverTrigger className={cn(
                          "w-full h-10 flex items-center gap-2 px-3 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] hover:border-[#0bd2b5]/50 transition-colors text-left",
                          editingEvent?.date ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-[#555]"
                        )}>
                          <CalendarDays className="h-3.5 w-3.5 text-[#0bd2b5] shrink-0" />
                          <span className="text-sm">{editingEvent?.date ? format(parseISO(editingEvent.date), "MMM d, yyyy") : "Pick a date..."}</span>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border border-slate-200 dark:border-[#2a2a2a] shadow-2xl rounded-2xl bg-white dark:bg-[#1a1a1a]" align="start">
                          <Calendar mode="single" selected={editingEvent?.date ? parseISO(editingEvent.date) : undefined}
                            onSelect={(day) => day && setEditingEvent(prev => prev ? { ...prev, date: format(day, "yyyy-MM-dd") } : null)} initialFocus />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">Start Time</label>
                      <Input value={editingEvent?.time || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, time: e.target.value } : null)} placeholder="10:30 AM" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-[#0bd2b5]/50 focus-visible:border-[#0bd2b5] focus-visible:ring-0 transition-colors" />
                    </div>
                  </div>

                  {/* End Time + Duration for activity/dining */}
                  {(editingEvent?.type === "activity" || editingEvent?.type === "dining") && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">End Time</label>
                        <Input value={editingEvent?.endTime || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, endTime: e.target.value } : null)} placeholder="2:00 PM" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-[#0bd2b5]/50 focus-visible:border-[#0bd2b5] focus-visible:ring-0 transition-colors" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">Duration</label>
                        <Input value={editingEvent?.duration || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, duration: e.target.value } : null)} placeholder="e.g., 3h 30m" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-[#0bd2b5]/50 focus-visible:border-[#0bd2b5] focus-visible:ring-0 transition-colors" />
                      </div>
                    </div>
                  )}

                  {/* Location */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">Location / Address</label>
                    <Input value={editingEvent?.location || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, location: e.target.value } : null)} placeholder="Airport code or Street Address" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-[#0bd2b5]/50 focus-visible:border-[#0bd2b5] focus-visible:ring-0 transition-colors" />
                  </div>

                  {/* Supplier + Conf# */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">Supplier / Provider</label>
                      <Input value={editingEvent?.supplier || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, supplier: e.target.value } : null)} placeholder="e.g., Qatar Airways" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-[#0bd2b5]/50 focus-visible:border-[#0bd2b5] focus-visible:ring-0 transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">Confirmation #</label>
                      <Input value={editingEvent?.confNumber || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, confNumber: e.target.value } : null)} placeholder="e.g., ABC-12345" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-[#0bd2b5]/50 focus-visible:border-[#0bd2b5] focus-visible:ring-0 transition-colors" />
                    </div>
                  </div>

                  {/* Price */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">Price (Optional)</label>
                    <Input value={editingEvent?.price || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, price: e.target.value } : null)} placeholder="e.g., 1,200 per person" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-[#0bd2b5]/50 focus-visible:border-[#0bd2b5] focus-visible:ring-0 transition-colors" />
                  </div>

                  {/* Type-specific fields */}
                  {(editingEvent?.type === "flight" || editingEvent?.type === "hotel") && (
                    <div className="space-y-4 pt-1">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-slate-200 dark:bg-[#252525]" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#0bd2b5]">
                          {editingEvent.type === "flight" ? "Flight Details" : "Hotel Details"}
                        </span>
                        <div className="h-px flex-1 bg-slate-200 dark:bg-[#252525]" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {editingEvent.type === "flight" ? (
                          <>
                            {[
                              { key: "airline", label: "Airline" }, { key: "flightNum", label: "Flight No." },
                              { key: "terminal", label: "Dep Terminal" }, { key: "arrTerminal", label: "Arr Terminal" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">{f.label}</label>
                                <Input value={(editingEvent as Record<string, string>)[f.key] || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, [f.key]: e.target.value } : null)} className="h-9 text-sm bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg focus-visible:border-[#0bd2b5] focus-visible:ring-0" />
                              </div>
                            ))}
                            <div className="col-span-2 space-y-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">Seat / Ticket Details</label>
                              <Input value={editingEvent?.seatDetails || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, seatDetails: e.target.value } : null)} placeholder="e.g., 14A, 14B — Business Class" className="h-9 text-sm bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg focus-visible:border-[#0bd2b5] focus-visible:ring-0" />
                            </div>
                          </>
                        ) : (
                          <>
                            {[
                              { key: "checkin", label: "Check-in" }, { key: "checkout", label: "Check-out" },
                              { key: "roomType", label: "Room Type" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">{f.label}</label>
                                <Input value={(editingEvent as Record<string, string>)[f.key] || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, [f.key]: e.target.value } : null)} className="h-9 text-sm bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg focus-visible:border-[#0bd2b5] focus-visible:ring-0" />
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: image search panel */}
              <div className="col-span-2 flex flex-col min-h-0 overflow-hidden border-l border-slate-200 dark:border-[#1f1f1f] bg-slate-50/40 dark:bg-[#0a0a0a]">
                {/* Search bar */}
                <div className="p-4 border-b border-slate-200 dark:border-[#1f1f1f] shrink-0 bg-white dark:bg-[#111111]">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-[#555]" />
                      <input
                        value={imageSearch}
                        onChange={e => setImageSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); runImageSearch(imageSearch); } }}
                        placeholder="Search images..."
                        className="w-full h-9 pl-9 pr-3 bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] rounded-lg text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus:outline-none focus:border-[#0bd2b5] transition-colors"
                      />
                    </div>
                    <button type="button" onClick={() => runImageSearch(imageSearch)}
                      className="h-9 px-3 rounded-lg bg-[#0bd2b5] text-black text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity shrink-0 flex items-center gap-1">
                      {isSearchingImages ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    </button>
                    {imageSearch && (
                      <button type="button" onClick={() => { setImageSearch(""); setImageResults([]); setImageSearchSource(null); }}
                        className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#252525] flex items-center justify-center text-slate-400 dark:text-[#666] hover:text-slate-900 dark:hover:text-white transition-colors shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {imageIsAuto && (
                    <p className="text-[10px] text-slate-400 dark:text-[#555] mt-2 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-[#0bd2b5]" /> Auto-matching from title
                    </p>
                  )}
                </div>

                {/* Selected image preview */}
                <div className="relative h-44 shrink-0 bg-slate-200 dark:bg-[#111] overflow-hidden">
                  {editingEvent?.image ? (
                    <>
                      <img src={editingEvent.image} alt={editingEvent.title ? `Selected image for ${editingEvent.title}` : "Selected event image"} className="w-full h-full object-cover transition-all duration-500" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3">
                        {editingEvent.title && <p className="text-white font-extrabold uppercase text-base leading-tight drop-shadow-lg line-clamp-2">{editingEvent.title}</p>}
                      </div>
                      {imageIsAuto && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 bg-[#0bd2b5] text-black text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                          <Sparkles className="h-2.5 w-2.5" /> Auto
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                      <Camera className="h-7 w-7 text-slate-300 dark:text-[#333]" />
                      <p className="text-[10px] text-slate-400 dark:text-[#555] uppercase tracking-widest font-bold">No image selected</p>
                    </div>
                  )}
                </div>

                {/* Results grid */}
                <div className="flex-1 overflow-y-auto p-3">
                  {isSearchingImages ? (
                    <div className="flex items-center justify-center h-24 gap-2 text-slate-400 dark:text-[#555]">
                      <Loader2 className="h-4 w-4 animate-spin text-[#0bd2b5]" />
                      <span className="text-xs font-bold uppercase tracking-wider">Searching...</span>
                    </div>
                  ) : imageResults.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        {imageResults.map((url, i) => (
                          <button key={i} type="button"
                            onClick={() => { setEditingEvent(prev => prev ? { ...prev, image: url } : null); setImageIsAuto(false); }}
                            className={`relative h-[72px] rounded-lg overflow-hidden border-2 transition-all hover:scale-[1.02] ${editingEvent?.image === url ? "border-[#0bd2b5] shadow-lg shadow-[#0bd2b5]/30 scale-[1.02]" : "border-transparent hover:border-[#0bd2b5]/50"}`}>
                            <img src={url} alt={`Image option ${i + 1}${imageSearch ? ` for ${imageSearch}` : ""}`} className="w-full h-full object-cover" loading="lazy" />
                          </button>
                        ))}
                      </div>
                      {imageSearchSource === "local" && (
                        <p className="text-[9px] text-slate-400/60 dark:text-[#444] font-bold uppercase tracking-widest text-center pt-1">
                          Suggested images · APIs unavailable
                        </p>
                      )}
                      {imageSearchSource === "google" && (
                        <p className="text-[9px] text-[#0bd2b5]/60 font-bold uppercase tracking-widest text-center pt-1">
                          Google Image Search
                        </p>
                      )}
                      {imageSearchSource === "unsplash" && (
                        <p className="text-[9px] text-slate-400/60 dark:text-[#444] font-bold uppercase tracking-widest text-center pt-1">
                          Unsplash
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-20 gap-1.5 text-center">
                      <Search className="h-5 w-5 text-slate-300 dark:text-[#333]" />
                      <p className="text-[10px] text-slate-400 dark:text-[#555] font-bold uppercase tracking-widest">Type to search images</p>
                    </div>
                  )}
                </div>

                {/* Media Upload */}
                <div className="p-4 border-t border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] space-y-2.5 shrink-0">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">Photos & Videos</label>
                    <button type="button" onClick={() => mediaInputRef.current?.click()}
                      className="h-7 px-3 rounded-lg bg-[#0bd2b5]/10 border border-[#0bd2b5]/20 text-[#0bd2b5] text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-[#0bd2b5]/20 transition-colors flex items-center gap-1.5">
                      <Upload className="h-3 w-3" /> Upload
                    </button>
                    <input ref={mediaInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleMediaUpload} />
                  </div>
                  {(editingEvent?.media?.length ?? 0) > 0 ? (
                    <div className="grid grid-cols-4 gap-1.5">
                      {editingEvent!.media!.map((m, i) => (
                        <div key={i} className="relative group">
                          {m.type === "image" ? (
                            <img src={m.url} alt={m.name} className="h-14 w-full object-cover rounded-lg border border-slate-200 dark:border-[#252525]" />
                          ) : (
                            <div className="h-14 w-full bg-slate-100 dark:bg-[#1a1a1a] rounded-lg border border-slate-200 dark:border-[#252525] flex flex-col items-center justify-center gap-0.5 px-1">
                              <Video className="h-4 w-4 text-[#0bd2b5]" />
                              <span className="text-[8px] text-slate-400 dark:text-[#555] font-bold truncate w-full text-center leading-none">{m.name.replace(/\.[^.]+$/, "")}</span>
                            </div>
                          )}
                          <button type="button" onClick={() => handleRemoveMedia(i)}
                            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white hidden group-hover:flex items-center justify-center shadow-sm">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button type="button" onClick={() => mediaInputRef.current?.click()}
                      className="w-full h-14 rounded-lg border-2 border-dashed border-slate-200 dark:border-[#252525] flex items-center justify-center gap-2 text-slate-400 dark:text-[#555] hover:border-[#0bd2b5]/50 hover:text-[#0bd2b5] transition-colors group">
                      <ImageIcon2 className="h-4 w-4" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Add photos or videos</span>
                    </button>
                  )}
                </div>

                {/* Notes */}
                <div className="p-4 border-t border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] space-y-2 shrink-0">
                  <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-[#666]">Agent Notes (Internal)</label>
                  <Textarea value={editingEvent?.notes || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, notes: e.target.value } : null)} className="rounded-lg h-20 text-sm font-medium bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white resize-none focus-visible:border-[#0bd2b5] focus-visible:ring-0" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 bg-white dark:bg-[#111111] border-t border-slate-200 dark:border-[#1f1f1f] flex items-center justify-between shrink-0">
              <button type="button" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-colors px-4 py-2" onClick={() => setIsEditPanelOpen(false)}>Cancel</button>
              <Button type="submit" className="h-11 px-10 rounded-xl bg-[#0bd2b5] hover:opacity-90 text-slate-900 dark:text-black font-bold uppercase tracking-wider text-xs shadow-lg shadow-[#0bd2b5]/20">
                Save Event
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AiZapDialog open={aiZapOpen} onOpenChange={setAiZapOpen} />
    </div>
  );
}
