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
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import "leaflet/dist/leaflet.css";
import {
  ChevronLeft, Sun, Moon, Map as MapIcon, Loader2, Plus, Plane, Hotel, Compass, Utensils, Camera, CalendarDays, Users, MapPin, RefreshCcw, Wand2, Search, X, Upload, ChevronRight, Video, Image as ImageIcon2, Trash2, Pencil, Send, Share2, Link2, Check, FileText, Paperclip, Tag, Phone, Mail, Building2, ChevronDown, Eye, MailPlus, MoreVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { TravelEvent, Trip, TripOrganizer, User as UserType } from "@/types";
import { useTrips } from "@/context/TripsContext";
import { useTheme } from "@/context/ThemeContext";
import { useNotifications } from "@/context/NotificationContext";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { MOCK_USERS } from "@/data/mock-users";
import { EventCard } from "@/components/workspace/EventCard";
import { SortableEventCard } from "@/components/workspace/SortableEventCard";
import { DaySection } from "@/components/workspace/DaySection";
import { DockBar } from "@/components/workspace/DockBar";
import { TripMap } from "@/components/workspace/TripMap";
import { TripMediaGallery } from "@/components/workspace/TripMediaGallery";
import { AiZapDialog } from "@/components/shared/AiZapDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ShareTripDialog } from "@/components/shared/ShareTripDialog";
import { ItineraryPreviewDialog } from "@/components/shared/ItineraryPreviewDialog";
import { NotificationPanel } from "@/components/shared/NotificationPanel";
import { FlightSearch } from "@/components/workspace/FlightSearch";
import { HotelSearch } from "@/components/workspace/HotelSearch";
import { LocationAutocomplete } from "@/components/shared/LocationAutocomplete";
import { searchImages, searchImagesProgressive } from "@/services/imageSearch";
import { usePermissions } from "@/hooks/usePermissions";
import { buildImageQuery, buildImageQueryCandidates } from "@/services/imageQuery";
import { notifyTripUpdate } from "@/services/pushNotify";
import { ImportItineraryDialog } from "@/components/shared/ImportItineraryDialog";
import { BRAND } from "@/config/brand";
import { STORAGE } from "@/config/storageKeys";
import { IMAGE_BANK, COVER_IMAGES, KEYWORD_MAP, getEventImageCategory, generateEventImage } from "@/data/images";
// html2canvas and jsPDF are lazy-loaded in handleExportPdf to avoid ~100KB on the critical path

// ─────────────────────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 720;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const pm = m[3].toUpperCase() === "PM";
  if (pm && h < 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + min;
}

export function WorkspacePage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { trips, ready, updateTrip, updateEvent, deleteEvent, deleteTrip } = useTrips();
  const { theme, toggleTheme } = useTheme();
  const { showToast, addNotification } = useNotifications();
  const { canDeleteTrip, isOrgMember } = usePermissions();

  const trip = useMemo(() => trips.find(t => t.id === tripId) || null, [trips, tripId]);

  // Auto-open event from ?event= query param (e.g. from Dashboard event cards)
  useEffect(() => {
    const eventId = searchParams.get("event");
    if (!eventId || !trip) return;
    const ev = trip.events.find(e => e.id === eventId);
    if (ev) {
      setEditingEvent(ev);
      setIsEditPanelOpen(true);
      searchParams.delete("event");
      setSearchParams(searchParams, { replace: true });
    }
  }, [trip, searchParams, setSearchParams]);

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
  const [imageSearchSource, setImageSearchSource] = useState<"google" | "unsplash" | "pexels" | "local" | null>(null);
  const [imagePage, setImagePage] = useState(1);
  const [imageLastQuery, setImageLastQuery] = useState("");
  const [aiZapOpen, setAiZapOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"itinerary" | "media" | "people">("itinerary");
  const [customTravelers] = useLocalStorage<UserType[]>(STORAGE.CUSTOM_TRAVELERS, []);
  const allTravelers = useMemo(() => {
    const seen = new Set<string>();
    return [...MOCK_USERS, ...customTravelers].filter(u => {
      const key = u.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [customTravelers]);

  const tripTravelers = useMemo(() => {
    if (!trip) return [];
    // Resolve from allTravelers by ID
    const resolved = allTravelers.filter(u => trip.travelerIds?.includes(u.id));
    if (resolved.length > 0) return resolved;
    // Fallback: use trip.travelers denormalized array (covers timing gaps after re-import)
    if (trip.travelers?.length) {
      return trip.travelers.map(t => {
        const full = allTravelers.find(u => u.id === t.id);
        return full ?? { id: t.id, name: t.name, email: "", role: "Traveler" as const, avatar: "", initials: t.initials, status: "Active" as const } satisfies UserType;
      });
    }
    return [];
  }, [trip, allTravelers]);
  const availableTravelers = useMemo(() => {
    if (!trip) return allTravelers;
    const linkedIds = new Set(tripTravelers.map(t => t.id));
    return allTravelers.filter(u => !linkedIds.has(u.id));
  }, [trip, allTravelers, tripTravelers]);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [viewAsId, setViewAsId] = useState<string | null>(null);
  const viewAsTraveler = useMemo(() => viewAsId ? allTravelers.find(u => u.id === viewAsId) ?? null : null, [viewAsId, allTravelers]);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [rematching, setRematching] = useState({ active: false, done: 0, total: 0 });
  const printRef = useRef<HTMLDivElement>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editTripOpen, setEditTripOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Partial<Trip>>({});
  const [tripImageSearch, setTripImageSearch] = useState("");
  const [tripImageResults, setTripImageResults] = useState<string[]>([]);
  const [isTripImageSearching, setIsTripImageSearching] = useState(false);
  const [tripImagePage, setTripImagePage] = useState(1);
  const [tripImageLastQuery, setTripImageLastQuery] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [reimportOpen, setReimportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOrgOpen, setEditOrgOpen] = useState(false);
  const [editOrgData, setEditOrgData] = useState<Partial<NonNullable<Trip["organizer"]>>>({});
  const [editInfoOpen, setEditInfoOpen] = useState(false);
  const [editInfoData, setEditInfoData] = useState<NonNullable<Trip["info"]>>([]);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !trip) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const allEvents = [...trip.events];
    const activeEvent = allEvents.find(e => e.id === activeId);
    const overEvent = allEvents.find(e => e.id === overId);
    if (!activeEvent || !overEvent || activeEvent.date !== overEvent.date) return;

    const dayDate = activeEvent.date;
    const dayEvents = allEvents.filter(e => e.date === dayDate);
    const otherEvents = allEvents.filter(e => e.date !== dayDate);

    const oldIndex = dayEvents.findIndex(e => e.id === activeId);
    const newIndex = dayEvents.findIndex(e => e.id === overId);
    const reorderedDayEvents = arrayMove(dayEvents, oldIndex, newIndex);

    // Swap times so the time-based sort preserves the new order
    const sortedTimes = reorderedDayEvents
      .map(e => e.time)
      .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    const finalEvents = reorderedDayEvents.map((e, i) => ({ ...e, time: sortedTimes[i] }));

    updateTrip(trip.id, { events: [...otherEvents, ...finalEvents] });
    toast.success("Events reordered");
  }, [trip, updateTrip]);

  const runImageSearch = async (query: string, page = 1) => {
    if (!query.trim()) return;
    setIsSearchingImages(true);
    setImageLastQuery(query);
    setImagePage(page);
    try {
      const { urls, source } = await searchImages(query, page, 9);
      if (urls.length) {
        setImageResults(urls);
        setImageSearchSource(source as "unsplash" | "pexels");
        return;
      }
      const cat = getEventImageCategory(query, editingEvent?.type || "activity");
      const bank = IMAGE_BANK[cat] ?? IMAGE_BANK.activity;
      setImageResults([...bank, ...IMAGE_BANK.activity].slice(0, 9));
      setImageSearchSource("local");
    } finally {
      setIsSearchingImages(false);
    }
  };

  const groupedEvents = useMemo(() => {
    if (!trip) return [];
    let events = trip.events;
    // Filter by "View As" traveler
    if (viewAsId) {
      events = events.filter(
        e => !e.assignedTo || e.assignedTo.length === 0 || e.assignedTo.includes(viewAsId)
      );
    }
    const groups: Record<string, TravelEvent[]> = {};
    const sorted = [...events].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    });
    sorted.forEach(e => { if (!groups[e.date]) groups[e.date] = []; groups[e.date].push(e); });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [trip?.events, viewAsId]);

  // Auto-search + generate image when title changes (must run before any early return)
  useEffect(() => {
    if (!editingEvent || !isEditPanelOpen) return;
    const { title, type, location } = editingEvent;
    if (title.length < 3) return;
    if (imageIsAuto) {
      const img = generateEventImage(title, type, imageSeed);
      setEditingEvent(prev => prev ? { ...prev, image: img } : null);
    }
    const candidates = buildImageQueryCandidates({ title, location, type });
    const t = setTimeout(async () => {
      setIsSearchingImages(true);
      setImagePage(1);
      try {
        const { urls, source, matchedQuery } = await searchImagesProgressive(candidates, 9);
        if (urls.length) {
          setImageResults(urls);
          setImageSearchSource(source as "unsplash" | "pexels");
          setImageLastQuery(matchedQuery || candidates[0]);
          return;
        }
        const cat = getEventImageCategory(title, type);
        const bank = IMAGE_BANK[cat] ?? IMAGE_BANK.activity;
        setImageResults([...bank, ...IMAGE_BANK.activity].slice(0, 9));
        setImageSearchSource("local");
        setImageLastQuery(candidates[0]);
      } finally {
        setIsSearchingImages(false);
      }
    }, 900);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEvent?.title, editingEvent?.type, editingEvent?.location, imageSeed, imageIsAuto, isEditPanelOpen]);

  /** Build a Mapbox Static Images URL with route pins for the trip */
  const buildStaticMapUrl = useCallback(async (): Promise<string | null> => {
    const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
    if (!MAPBOX_TOKEN || !trip) return null;
    const { resolveCoords } = await import("@/data/coordinates");
    const { geocode } = await import("@/services/geocode");
    const resolve = async (loc: string): Promise<[number, number] | null> =>
      resolveCoords(loc) ?? (await geocode(loc));

    const coords: [number, number][] = [];
    for (const ev of trip.events.filter(e => e.type === "flight")) {
      const match = ev.location.match(/^(.+?)\s+to\s+(.+)$/);
      if (!match) continue;
      const from = await resolve(match[1].trim());
      const to = await resolve(match[2].trim());
      if (from) coords.push(from);
      if (to) coords.push(to);
    }
    if (coords.length === 0) return null;

    // Mapbox Static Images: pin markers + auto-fit
    const markers = coords
      .map(([lat, lng]) => `pin-s+0bd2b5(${lng},${lat})`)
      .join(",");
    const style = theme === "dark" ? "dark-v11" : "light-v11";
    return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${markers}/auto/800x300@2x?padding=60&access_token=${MAPBOX_TOKEN}`;
  }, [trip, theme]);

  if (!trip) {
    if (!ready) {
      return (
        <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-[#050505]">
          <div className="h-10 w-10 rounded-full border-2 border-slate-200 dark:border-[#1f1f1f] border-t-brand animate-spin" />
        </div>
      );
    }
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-[#050505]">
        <div className="text-center space-y-4">
          <p className="text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Trip not found</p>
          <Button onClick={() => navigate("/dashboard")} className="bg-brand text-black font-bold rounded-xl">Back to Dashboard</Button>
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
    notifyTripUpdate(trip.id, trip.name, "published");
    setShareOpen(true);
  };

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
    const existing = trip.events.find(ev => ev.id === editingEvent.id);
    const action = existing ? "updated" : "added";
    updateEvent(trip.id, editingEvent);
    setIsEditPanelOpen(false);
    setEditingEvent(null);
    showToast("Event saved");
    toast.success("Event saved");
    addNotification({
      message: `Event ${action}`,
      detail: `${editingEvent.title || "Untitled"} · ${trip.name}`,
      time: "Just now",
      type: "success",
    });
  };

  const handleDeleteEvent = (eventId: string) => {
    const removed = trip.events.find(ev => ev.id === eventId);
    deleteEvent(trip.id, eventId);
    showToast("Event deleted");
    toast.success("Event deleted");
    addNotification({
      message: "Event deleted",
      detail: `${removed?.title ?? "Event"} · ${trip.name}`,
      time: "Just now",
      type: "success",
    });
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

  const MAX_DOC_BYTES = 8 * 1024 * 1024; // 8MB per doc — keeps localStorage viable

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !editingEvent) return;
    const oversized = files.filter(f => f.size > MAX_DOC_BYTES);
    if (oversized.length) {
      toast.error(`${oversized.length} file(s) over 8MB were skipped`);
    }
    const accepted = files.filter(f => f.size <= MAX_DOC_BYTES);
    const readers = accepted.map(file => new Promise<{ id: string; name: string; mimeType: string; url: string; size: number; uploadedAt: string }>((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve({
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        url: ev.target?.result as string,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      });
      reader.readAsDataURL(file);
    }));
    Promise.all(readers).then(newDocs => {
      setEditingEvent(prev => prev ? { ...prev, documents: [...(prev.documents || []), ...newDocs] } : null);
    });
    e.target.value = "";
  };

  const handleRemoveDocument = (index: number) => {
    setEditingEvent(prev => prev ? { ...prev, documents: (prev.documents || []).filter((_, i) => i !== index) } : null);
  };

  const handleOpenDocument = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleExportPdf = async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      // Generate static map image for the PDF cover
      const staticMapUrl = await buildStaticMapUrl();

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
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

      // If we have a static map, add it as a header on the first page
      if (staticMapUrl) {
        try {
          const mapRes = await fetch(staticMapUrl);
          const mapBlob = await mapRes.blob();
          const mapDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(mapBlob);
          });
          // Map header: full width, 60mm tall
          pdf.addImage(mapDataUrl, "PNG", 0, 0, pdfWidth, 60);
          // Trip title overlay
          pdf.setFontSize(18);
          pdf.setTextColor(255, 255, 255);
          pdf.text(trip.name.toUpperCase(), 10, 50);
          pdf.setFontSize(8);
          pdf.text(`${trip.destination || ""} · ${trip.start} — ${trip.end}`, 10, 55);
          // Itinerary content starts below map
          const imgWidth = canvas.width;
          const ratio = pdfWidth / imgWidth;
          const scaledHeight = canvas.height * ratio;
          pdf.addImage(imgData, "PNG", 0, 62, pdfWidth, scaledHeight);
          let heightLeft = scaledHeight - (pdfHeight - 62);
          let position = -(pdfHeight - 62);
          while (heightLeft > 0) {
            pdf.addPage();
            pdf.addImage(imgData, "PNG", 0, position, pdfWidth, scaledHeight);
            heightLeft -= pdfHeight;
            position -= pdfHeight;
          }
        } catch {
          // Fallback: no map header, just the content
          const imgWidth = canvas.width;
          const ratio = pdfWidth / imgWidth;
          const scaledHeight = canvas.height * ratio;
          pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, scaledHeight);
          let heightLeft = scaledHeight - pdfHeight;
          let position = -pdfHeight;
          while (heightLeft > 0) {
            pdf.addPage();
            pdf.addImage(imgData, "PNG", 0, position, pdfWidth, scaledHeight);
            heightLeft -= pdfHeight;
            position -= pdfHeight;
          }
        }
      } else {
        const imgWidth = canvas.width;
        const ratio = pdfWidth / imgWidth;
        const scaledHeight = canvas.height * ratio;
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, scaledHeight);
        let heightLeft = scaledHeight - pdfHeight;
        let position = -pdfHeight;
        while (heightLeft > 0) {
          pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, position, pdfWidth, scaledHeight);
          heightLeft -= pdfHeight;
          position -= pdfHeight;
        }
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

  const handleRematchImages = async () => {
    if (!trip || rematching.active) return;
    const CACHE_KEY = STORAGE.EVENT_IMAGE_CACHE;
    let cache: Record<string, string> = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { /* ignore */ }

    const events = [...trip.events];
    setRematching({ active: true, done: 0, total: events.length });
    const CONCURRENCY = 3;
    for (let i = 0; i < events.length; i += CONCURRENCY) {
      const slice = events.slice(i, i + CONCURRENCY);
      const imgs = await Promise.all(slice.map(async ev => {
        const candidates = buildImageQueryCandidates({ title: ev.title, location: ev.location, type: ev.type });
        const cacheKey = candidates.join("|");
        if (cache[cacheKey]) return cache[cacheKey];
        const { urls } = await searchImagesProgressive(candidates, 1);
        const url = urls[0];
        if (url) cache[cacheKey] = url;
        return url;
      }));
      imgs.forEach((url, j) => { if (url) events[i + j] = { ...events[i + j], image: url }; });
      setRematching(r => ({ ...r, done: Math.min(i + CONCURRENCY, events.length) }));
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
    updateTrip(trip.id, { events });
    setRematching({ active: false, done: 0, total: 0 });
    toast.success("Event images re-matched");
  };

  const runTripImageSearch = async (query: string, page = 1) => {
    if (!query.trim()) { setTripImageResults([]); return; }
    setIsTripImageSearching(true);
    setTripImageLastQuery(query);
    setTripImagePage(page);
    try {
      const { urls } = await searchImages(query, page, 12);
      if (urls.length) { setTripImageResults(urls); return; }
      const shuffled = [...COVER_IMAGES].sort(() => Math.random() - 0.5);
      setTripImageResults(shuffled.map(i => i.url));
    } finally {
      setIsTripImageSearching(false);
    }
  };

  const handleOpenEditOrg = () => {
    setEditOrgData({ ...(trip.organizer ?? {}) });
    setEditOrgOpen(true);
  };
  const handleSaveOrg = (e: React.FormEvent) => {
    e.preventDefault();
    const org = editOrgData.name?.trim() ? editOrgData as Trip["organizer"] : undefined;
    updateTrip(trip.id, { organizer: org });
    setEditOrgOpen(false);
    toast.success(org ? "Organizer updated" : "Organizer removed");
  };

  const handleOpenEditInfo = () => {
    setEditInfoData(trip.info ? trip.info.map(i => ({ ...i })) : []);
    setEditInfoOpen(true);
  };
  const handleSaveInfo = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = editInfoData.filter(i => i.title.trim() || i.body.trim());
    updateTrip(trip.id, { info: cleaned.length > 0 ? cleaned : undefined });
    setEditInfoOpen(false);
    toast.success("Information updated");
  };

  const handleOpenEditTrip = () => {
    setEditingTrip({
      name: trip.name,
      destination: trip.destination ?? "",
      attendees: trip.attendees,
      start: trip.start,
      end: trip.end,
      status: trip.status,
      image: trip.image,
      currency: trip.currency ?? "USD",
      organizer: trip.organizer ?? undefined,
      info: trip.info ? trip.info.map(i => ({ ...i })) : [],
    });
    setTripImageSearch("");
    setTripImageResults([]);
    setEditTripOpen(true);
  };

  const handleSaveTrip = (e: React.FormEvent) => {
    e.preventDefault();
    // Clean up organizer: null out if name is empty
    const cleaned = { ...editingTrip };
    if (cleaned.organizer && !cleaned.organizer.name?.trim()) {
      cleaned.organizer = undefined;
    }
    // Filter out empty info entries
    if (cleaned.info) {
      cleaned.info = cleaned.info.filter(i => i.title.trim() || i.body.trim());
      if (cleaned.info.length === 0) cleaned.info = undefined;
    }
    updateTrip(trip.id, cleaned);
    setEditTripOpen(false);
    toast.success("Trip updated");
    addNotification({
      message: "Trip updated",
      detail: editingTrip.name ?? trip.name,
      time: "Just now",
      type: "success",
    });
  };

  const handleDeleteTrip = () => {
    deleteTrip(trip.id);
    navigate("/dashboard");
    toast.success("Trip deleted");
  };

  const handleShareTrip = () => setShareOpen(true);

  const handleSendEmail = () => {
    const nights = Math.max(1, Math.ceil(
      (new Date(trip.end).getTime() - new Date(trip.start).getTime()) / 86400000
    ));
    const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const shareUrl = `${window.location.origin}${window.location.pathname}#/shared/${trip.id}`;

    const eventsByDay: Record<string, typeof trip.events> = {};
    for (const ev of trip.events) {
      if (!eventsByDay[ev.date]) eventsByDay[ev.date] = [];
      eventsByDay[ev.date].push(ev);
    }
    const sortedDays = Object.entries(eventsByDay).sort(([a], [b]) => a.localeCompare(b));

    let itineraryText = "";
    sortedDays.forEach(([date, events], i) => {
      const d = new Date(date + "T12:00:00");
      itineraryText += `\nDAY ${i + 1} — ${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}\n`;
      events.forEach(ev => {
        const type = ev.type.charAt(0).toUpperCase() + ev.type.slice(1);
        itineraryText += `  ${ev.time || ""} ${type}: ${ev.title}`;
        if (ev.location) itineraryText += ` (${ev.location})`;
        itineraryText += "\n";
      });
    });

    const subject = `Your Itinerary: ${trip.name}`;
    const body = [
      `Hi,`,
      ``,
      `Your itinerary for ${trip.name} is ready!`,
      ``,
      `TRIP DETAILS`,
      `${trip.destination ? `Destination: ${trip.destination}` : ""}`,
      `Dates: ${fmt(trip.start)} — ${fmt(trip.end)} (${nights} night${nights !== 1 ? "s" : ""})`,
      trip.paxCount ? `Travelers: ${trip.paxCount}` : "",
      ``,
      `ITINERARY`,
      itineraryText,
      ``,
      `VIEW FULL ITINERARY`,
      shareUrl,
      trip.shortCode ? `\nTrip PIN: ${trip.shortCode}` : "",
      ``,
      `—`,
      `Sent via ${BRAND.name}`,
    ].filter(Boolean).join("\n");

    const a = document.createElement("a");
    a.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    a.click();
    toast.success("Email client opened");
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-[#050505] w-full relative overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-white dark:bg-[#111111] border-b border-slate-200 dark:border-[#1f1f1f] px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sticky top-0 z-50 shadow-xl">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <Button variant="ghost" size="icon" aria-label="Go back to dashboard" onClick={() => navigate("/dashboard")} className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-[#050505] hover:bg-slate-100 dark:hover:bg-[#1a1a1a] active:scale-95 text-slate-900 dark:text-white border border-slate-200 dark:border-[#1f1f1f] transition-[colors,transform] shadow-sm shrink-0"><ChevronLeft className="h-5 w-5" /></Button>
          <div className="h-6 w-px bg-slate-200 dark:bg-[#1f1f1f] hidden sm:block" />
          <div className="flex flex-col min-w-0 hidden sm:flex">
            <h2 className="text-base sm:text-lg font-extrabold uppercase tracking-tight text-slate-900 dark:text-white leading-none truncate">{trip.name}</h2>
            <div className="flex items-center gap-2 mt-1 leading-none">
              <Badge className="bg-brand/10 text-brand border border-brand/20 font-bold px-2 py-0 h-4 rounded-full text-xs uppercase tracking-wider">EDITING</Badge>
              <span className="text-[11px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.2em] leading-none hidden sm:inline truncate">
                {(() => {
                  const parsedPax = parseInt(trip.paxCount || "", 10);
                  if (!isNaN(parsedPax) && parsedPax > 0) return `${parsedPax} ATTENDEES`;
                  const moreMatch = trip.attendees?.match(/\+(\d+)\s+more/i);
                  const listed = (trip.attendees || "").replace(/\+\d+\s+more/i, "").split(",").filter(s => s.trim()).length;
                  const total = listed + (moreMatch ? parseInt(moreMatch[1], 10) : 0);
                  return total > 0 ? `${total} ATTENDEES` : trip.attendees;
                })()}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-4 shrink-0">
          {/* View As dropdown */}
          {tripTravelers.length > 0 && (
            <Popover>
              <PopoverTrigger className={`hidden sm:flex h-10 items-center gap-2 px-3 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-wider shadow-sm cursor-pointer ${
                viewAsId
                  ? "bg-brand/10 border-brand/30 text-brand"
                  : "bg-white dark:bg-[#111111] border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:text-brand"
              }`}>
                <Users className="h-3.5 w-3.5" />
                {viewAsTraveler ? `Viewing as ${viewAsTraveler.name.split(" ")[0]}` : "View As"}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] shadow-2xl rounded-xl">
                <button
                  onClick={() => setViewAsId(null)}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-xs font-bold transition-colors text-left ${
                    !viewAsId ? "bg-brand/10 text-brand" : "text-slate-600 dark:text-[#aaa] hover:bg-slate-50 dark:hover:bg-[#050505]"
                  }`}
                >
                  <div className="h-7 w-7 rounded-md bg-slate-100 dark:bg-[#1f1f1f] flex items-center justify-center text-[9px] font-black text-slate-500 dark:text-[#888]">ALL</div>
                  <span className="uppercase tracking-wider">Everyone</span>
                  {!viewAsId && <Check className="h-3 w-3 ml-auto" />}
                </button>
                <div className="h-px bg-slate-100 dark:bg-[#1f1f1f] my-1" />
                {tripTravelers.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setViewAsId(t.id)}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-xs font-bold transition-colors text-left ${
                      viewAsId === t.id ? "bg-brand/10 text-brand" : "text-slate-600 dark:text-[#aaa] hover:bg-slate-50 dark:hover:bg-[#050505]"
                    }`}
                  >
                    <div className="h-7 w-7 rounded-md bg-brand/10 flex items-center justify-center text-[9px] font-black text-brand uppercase">{t.initials}</div>
                    <span className="truncate">{t.name}</span>
                    {viewAsId === t.id && <Check className="h-3 w-3 ml-auto shrink-0" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          {/* Desktop toolbar buttons */}
          <button aria-label="Toggle theme" onClick={toggleTheme} className="hidden sm:flex h-10 w-10 rounded-xl bg-white dark:bg-[#111111] hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-brand transition-all border border-slate-200 dark:border-[#1f1f1f] items-center justify-center cursor-pointer shadow-sm">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <NotificationPanel />
          <button aria-label="Re-import itinerary" onClick={() => setReimportOpen(true)} className="hidden sm:flex h-10 w-10 rounded-xl bg-white dark:bg-[#111111] hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-brand transition-all border border-slate-200 dark:border-[#1f1f1f] items-center justify-center cursor-pointer shadow-sm" title="Re-import itinerary">
            <Upload className="h-4 w-4" />
          </button>
          <button aria-label="Edit trip details" onClick={handleOpenEditTrip} className="hidden sm:flex h-10 w-10 rounded-xl bg-white dark:bg-[#111111] hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-brand transition-all border border-slate-200 dark:border-[#1f1f1f] items-center justify-center cursor-pointer shadow-sm">
            <Pencil className="h-4 w-4" />
          </button>
          <button aria-label="Delete trip" onClick={() => setDeleteConfirmOpen(true)} className="hidden sm:flex h-10 w-10 rounded-xl bg-white dark:bg-[#111111] hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-500 dark:text-[#888888] hover:text-red-500 transition-all border border-slate-200 dark:border-[#1f1f1f] items-center justify-center cursor-pointer shadow-sm">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={() => setShowMap(!showMap)} className={`hidden sm:flex font-bold text-xs uppercase tracking-widest rounded-xl h-10 w-10 lg:w-auto px-0 lg:px-4 gap-2 border transition-all items-center justify-center cursor-pointer ${showMap ? "bg-brand text-slate-900 dark:text-black border-transparent shadow-lg shadow-brand/20 hover:opacity-90" : "bg-white dark:bg-[#111111] text-slate-500 dark:text-[#888888] hover:text-brand hover:bg-slate-50 dark:hover:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] shadow-sm"}`}>
            <MapIcon className="h-4 w-4" /> <span className="hidden lg:inline">{showMap ? "HIDE MAP" : "SHOW MAP"}</span>
          </button>
          <button
            aria-label="Share trip link"
            onClick={handleShareTrip}
            className="hidden sm:flex h-10 w-10 rounded-xl bg-white dark:bg-[#111111] hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-brand transition-all border border-slate-200 dark:border-[#1f1f1f] items-center justify-center cursor-pointer shadow-sm"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            aria-label="Preview itinerary"
            onClick={() => setPreviewOpen(true)}
            className="hidden sm:flex h-10 w-10 rounded-xl bg-white dark:bg-[#111111] hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-brand transition-all border border-slate-200 dark:border-[#1f1f1f] items-center justify-center cursor-pointer shadow-sm"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            aria-label="Send itinerary to client"
            onClick={handleSendEmail}
            className="hidden sm:flex h-10 w-10 rounded-xl bg-white dark:bg-[#111111] hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-brand transition-all border border-slate-200 dark:border-[#1f1f1f] items-center justify-center cursor-pointer shadow-sm"
          >
            <MailPlus className="h-4 w-4" />
          </button>
          <Button onClick={handleExportPdf} disabled={exporting} variant="outline" className="font-bold text-xs uppercase tracking-widest rounded-xl h-10 px-4 border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:text-brand hidden sm:flex">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : "EXPORT PDF"}
          </Button>

          {/* Mobile overflow menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="More actions" className="sm:hidden h-10 w-10 rounded-xl bg-white dark:bg-[#111111] hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-brand transition-all border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center cursor-pointer shadow-sm">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] shadow-2xl rounded-xl p-1">
              <DropdownMenuItem onClick={() => setShowMap(!showMap)} className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer">
                <MapIcon className="h-4 w-4 text-brand" /> {showMap ? "Hide Map" : "Show Map"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPreviewOpen(true)} className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer">
                <Eye className="h-4 w-4" /> Preview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenEditTrip} className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer">
                <Pencil className="h-4 w-4" /> Edit Trip
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setReimportOpen(true)} className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer">
                <Upload className="h-4 w-4" /> Re-import
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-100 dark:bg-[#1f1f1f]" />
              <DropdownMenuItem onClick={handleShareTrip} className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer">
                <Share2 className="h-4 w-4" /> Share Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSendEmail} className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer">
                <MailPlus className="h-4 w-4" /> Send to Client
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf} disabled={exporting} className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer">
                <FileText className="h-4 w-4" /> Export PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-100 dark:bg-[#1f1f1f]" />
              <DropdownMenuItem onClick={toggleTheme} className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </DropdownMenuItem>
              {(!isOrgMember || canDeleteTrip) && (
                <>
                  <DropdownMenuSeparator className="bg-slate-100 dark:bg-[#1f1f1f]" />
                  <DropdownMenuItem onClick={() => setDeleteConfirmOpen(true)} className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer text-red-500 focus:text-red-500">
                    <Trash2 className="h-4 w-4" /> Delete Trip
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={handlePublish} disabled={publishing} aria-label="Publish trip" className="bg-brand hover:bg-brand hover:opacity-90 text-slate-900 dark:text-black font-bold h-10 w-10 sm:w-auto px-0 sm:px-4 lg:px-6 rounded-xl shadow-lg shadow-brand/20 transition-all text-xs uppercase tracking-widest sm:min-w-[100px] shrink-0 flex items-center justify-center">
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Send className="h-4 w-4 sm:hidden" /><span className="hidden sm:inline">PUBLISH</span></>)}
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Day sidebar */}
        <aside className="w-64 border-r border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] flex flex-col hidden lg:flex shadow-sm relative z-30">
          <div className="p-5 border-b border-slate-200 dark:border-[#1f1f1f] flex items-center justify-between bg-slate-50/30 dark:bg-[#050505]/30">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-brand">ITINERARY</span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                aria-label="Re-match event images"
                title={rematching.active ? `Matching ${rematching.done}/${rematching.total}` : "Re-match event images"}
                onClick={handleRematchImages}
                disabled={rematching.active}
                className="h-8 w-8 rounded-md bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] hover:bg-brand hover:text-slate-900 dark:hover:text-black text-brand transition-colors shadow-sm disabled:opacity-60"
              >
                {rematching.active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="outline" size="icon" aria-label="Add event" onClick={() => handleAddEvent()} className="h-8 w-8 rounded-md bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] hover:bg-brand hover:text-slate-900 dark:hover:text-black text-brand transition-colors shadow-sm"><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          {rematching.active && (
            <div className="px-4 py-2 border-b border-slate-200 dark:border-[#1f1f1f] bg-brand/5">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand mb-1.5">Matching {rematching.done}/{rematching.total}</p>
              <div className="h-1 rounded-full bg-slate-200 dark:bg-[#1f1f1f] overflow-hidden">
                <div className="h-full bg-brand transition-all duration-300" style={{ width: `${rematching.total ? (rematching.done / rematching.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {groupedEvents.map(([date], i) => (
                <button
                  key={date}
                  onClick={() => {
                    setActiveDayIdx(i);
                    document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`w-full text-left p-3 rounded-xl group relative transition-all duration-300 ${i === activeDayIdx ? "bg-brand/10 text-brand" : "hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-slate-900 dark:hover:text-white"}`}
                >
                  <div className="flex items-center gap-3 relative z-10 leading-none">
                    <div className={`h-10 w-10 rounded-lg flex flex-col items-center justify-center font-black text-[11px] uppercase tracking-tighter ${i === activeDayIdx ? "bg-brand text-slate-900 dark:text-black shadow-lg shadow-brand/20" : "bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] shadow-sm"}`}>
                      <span className="opacity-70">{new Date(date).toLocaleDateString("en-US", { month: "short" })}</span>
                      <span className="text-xs mt-0.5">{new Date(date).getDate()}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold opacity-60 uppercase tracking-wider">DAY {i + 1}</span>
                      <span className="text-xs font-bold truncate leading-none mt-1 uppercase tracking-tighter ">Scheduled</span>
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
            <section className="relative h-auto min-h-[280px] sm:h-[340px] lg:h-[400px] w-full group overflow-hidden shrink-0">
              <img src={trip.image} className="h-full w-full object-cover transition-transform duration-[2s] group-hover:scale-105" alt={trip.name} />
              {/* Multi-layer gradient for depth */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

              {/* Top row: status + event count pill */}
              <div className="absolute top-4 sm:top-6 left-4 sm:left-6 lg:left-8 right-4 sm:right-6 lg:right-8 z-20 flex items-center justify-between">
                <Badge className={`rounded-full px-3 sm:px-3.5 py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] shadow-lg backdrop-blur-sm ${trip.status === "Published" ? "bg-brand text-black border-none" : trip.status === "In Progress" ? "bg-brand/15 text-brand border border-brand/40" : "bg-white/20 text-white border-none"}`}>
                  {trip.status === "In Progress" ? "● ACTIVE" : trip.status === "Published" ? "✓ PUBLISHED" : "DRAFT"}
                </Badge>
                <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5">
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">{trip.events.length} events</span>
                  <span className="text-white/30">·</span>
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">{groupedEvents.length} days</span>
                </div>
              </div>

              {/* Bottom: trip identity */}
              <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8 z-20">
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.35em] text-brand mb-1.5 sm:mb-2">{BRAND.name} · Itinerary</p>
                <h3 className="text-2xl sm:text-3xl lg:text-5xl font-extrabold uppercase tracking-tight leading-none text-white drop-shadow-2xl mb-3 sm:mb-5">{trip.name}</h3>

                {/* Stat chips */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5">
                    <Users className="h-3 w-3 text-brand" />
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-white/90">{trip.attendees}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5">
                    <CalendarDays className="h-3 w-3 text-brand" />
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-white/90">
                      {new Date(trip.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {new Date(trip.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  {trip.destination && (
                    <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5">
                      <MapPin className="h-3 w-3 text-brand" />
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-white/90">{trip.destination}</span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* View As banner */}
            {viewAsTraveler && (
              <div className="mx-3 sm:mx-4 lg:mx-10 mt-4 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-brand/10 border border-brand/20">
                <Users className="h-4 w-4 text-brand shrink-0" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand flex-1">
                  Viewing as {viewAsTraveler.name} — showing {groupedEvents.reduce((n, [, evs]) => n + evs.length, 0)} events
                </p>
                <button onClick={() => setViewAsId(null)} className="text-[10px] font-bold uppercase tracking-wider text-brand/70 hover:text-brand transition-colors flex items-center gap-1">
                  <X className="h-3 w-3" /> Clear
                </button>
              </div>
            )}

            {/* Tab bar */}
            <div className="px-3 sm:px-4 lg:px-10 pt-6 shrink-0">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "itinerary" | "media")}>
                <TabsList className="bg-transparent h-auto p-0 gap-1">
                  <TabsTrigger
                    value="itinerary"
                    className="flex-none h-auto px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] border transition-all data-active:bg-brand dark:data-active:bg-brand data-active:text-black dark:data-active:text-black data-active:border-transparent dark:data-active:border-transparent data-active:shadow-lg data-active:shadow-brand/20 bg-white dark:bg-[#111111] text-slate-500 dark:text-[#888888] border-slate-200 dark:border-[#1f1f1f] hover:text-slate-900 dark:hover:text-white"
                  >
                    ITINERARY
                  </TabsTrigger>
                  <TabsTrigger
                    value="media"
                    className="flex-none h-auto px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] border transition-all flex items-center gap-2 data-active:bg-brand dark:data-active:bg-brand data-active:text-black dark:data-active:text-black data-active:border-transparent dark:data-active:border-transparent data-active:shadow-lg data-active:shadow-brand/20 bg-white dark:bg-[#111111] text-slate-500 dark:text-[#888888] border-slate-200 dark:border-[#1f1f1f] hover:text-slate-900 dark:hover:text-white"
                  >
                    MEDIA
                    {(trip.media?.length ?? 0) > 0 && (
                      <span className={`text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none ${activeTab === "media" ? "bg-black/20 text-black" : "bg-brand/15 text-brand"}`}>
                        {trip.media!.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="people"
                    className="flex-none h-auto px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] border transition-all flex items-center gap-2 data-active:bg-brand dark:data-active:bg-brand data-active:text-black dark:data-active:text-black data-active:border-transparent dark:data-active:border-transparent data-active:shadow-lg data-active:shadow-brand/20 bg-white dark:bg-[#111111] text-slate-500 dark:text-[#888888] border-slate-200 dark:border-[#1f1f1f] hover:text-slate-900 dark:hover:text-white"
                  >
                    PEOPLE
                    {(trip.travelerIds?.length ?? 0) > 0 && (
                      <span className={`text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none ${activeTab === "people" ? "bg-black/20 text-black" : "bg-brand/15 text-brand"}`}>
                        {trip.travelerIds!.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Itinerary tab */}
            {activeTab === "itinerary" && (
              <>
                <div className="px-3 sm:px-4 lg:px-10 pt-6 sm:pt-10 pb-32 w-full relative">

                  {/* ── Organizer & Info strip (Travefy-inspired) ── */}
                  {(trip.organizer?.name || (trip.info && trip.info.length > 0)) && (
                    <div className="mb-8 space-y-3">
                      {/* Organizer contact card */}
                      {trip.organizer?.name && (
                        <div className="group/org rounded-2xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] overflow-hidden hover:border-brand/30 transition-colors">
                          <div className="flex items-center gap-4 p-5">
                            {/* Avatar */}
                            <div className="shrink-0 w-14 h-14 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center">
                              <span className="text-lg font-black text-brand uppercase tracking-tight">
                                {trip.organizer.name.split(" ").slice(0, 2).map(w => w[0]).join("")}
                              </span>
                            </div>
                            {/* Name + meta */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand mb-1">Your Organizer</p>
                              <p className="text-base font-extrabold text-slate-900 dark:text-white truncate">{trip.organizer.name}</p>
                              {(trip.organizer.role || trip.organizer.company) && (
                                <p className="text-xs text-slate-500 dark:text-[#888] font-medium truncate mt-0.5">
                                  {[trip.organizer.role, trip.organizer.company].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </div>
                            {/* Action buttons */}
                            <div className="flex items-center gap-2 shrink-0">
                              {trip.organizer.email && (
                                <a href={`mailto:${trip.organizer.email}`} className="h-10 px-4 rounded-xl bg-brand/10 border border-brand/20 flex items-center gap-2 text-brand hover:bg-brand/20 transition-colors">
                                  <Mail className="h-3.5 w-3.5" />
                                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Email</span>
                                </a>
                              )}
                              {trip.organizer.phone && (
                                <a href={`tel:${trip.organizer.phone}`} className="h-10 px-4 rounded-xl bg-brand/10 border border-brand/20 flex items-center gap-2 text-brand hover:bg-brand/20 transition-colors">
                                  <Phone className="h-3.5 w-3.5" />
                                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Call</span>
                                </a>
                              )}
                              <button onClick={handleOpenEditOrg} className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#252525] flex items-center justify-center text-slate-400 dark:text-[#555] hover:text-brand hover:border-brand/30 opacity-0 group-hover/org:opacity-100 transition-all">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Information & Documents card */}
                      {trip.info && trip.info.length > 0 && (
                        <div className="group/info rounded-2xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] overflow-hidden hover:border-brand/30 transition-colors">
                          <div className="p-5">
                            <div className="flex items-center gap-2 mb-4">
                              <FileText className="h-3.5 w-3.5 text-brand" />
                              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-brand">Information & Documents</span>
                              <span className="text-[9px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full">{trip.info.length}</span>
                              <button onClick={handleOpenEditInfo} className="ml-auto h-8 px-3 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#252525] flex items-center gap-1.5 text-slate-400 dark:text-[#555] hover:text-brand hover:border-brand/30 opacity-0 group-hover/info:opacity-100 transition-all">
                                <Pencil className="h-3 w-3" />
                                <span className="text-[9px] font-bold uppercase tracking-wider">Edit</span>
                              </button>
                            </div>
                            <div className="space-y-2">
                              {trip.info.map(item => (
                                <button key={item.id} type="button" onClick={handleOpenEditInfo} className="w-full text-left rounded-xl bg-slate-50 dark:bg-[#0a0a0a] border border-slate-100 dark:border-[#1a1a1a] overflow-hidden hover:border-brand/30 transition-colors cursor-pointer">
                                  <div className="flex items-start gap-3 p-3.5">
                                    <div className="shrink-0 w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center mt-0.5">
                                      <FileText className="h-3.5 w-3.5 text-brand" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-bold text-slate-900 dark:text-white">{item.title || "Untitled"}</p>
                                      {item.body && (
                                        <p className="text-xs text-slate-500 dark:text-[#888] font-medium line-clamp-2 mt-1 leading-relaxed">{item.body}</p>
                                      )}
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-slate-300 dark:text-[#333] shrink-0 mt-1" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-10 sm:space-y-16">
                    {groupedEvents.length > 0 ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      {groupedEvents.map(([date, events], dayIdx) => (
                        <div key={date} id={`day-${date}`} className="scroll-mt-6">
                          <DaySection dayNumber={dayIdx + 1} date={new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()} onAddEvent={() => handleAddEvent()}>
                            <SortableContext items={events.map(e => e.id)} strategy={verticalListSortingStrategy}>
                              <div className="grid grid-cols-1 gap-4 sm:gap-6 pl-0 sm:pl-8">
                                {events.map(event => (
                                  <SortableEventCard
                                    key={event.id}
                                    event={event}
                                    onClick={() => handleEditEvent(event)}
                                    onDelete={() => handleDeleteEvent(event.id)}
                                    assignedPeople={
                                      event.assignedTo?.length
                                        ? event.assignedTo.map(id => {
                                            const t = allTravelers.find(u => u.id === id);
                                            return t ? { initials: t.initials, name: t.name } : { initials: "?", name: "Unknown" };
                                          })
                                        : undefined
                                    }
                                  />
                                ))}
                              </div>
                            </SortableContext>
                          </DaySection>
                        </div>
                      ))}
                    </DndContext>
                  ) : (
                      <div className="flex flex-col items-center justify-center py-32 bg-white dark:bg-[#111111] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] rounded-[2rem] text-slate-500 dark:text-[#888888] hover:border-brand transition-colors cursor-pointer group" onClick={() => handleAddEvent()}>
                        <Plus className="h-12 w-12 mb-4 opacity-20 group-hover:scale-110 group-hover:text-brand transition-all" />
                        <p className="font-bold text-xs uppercase tracking-[0.3em]">ADD YOUR FIRST EVENT</p>
                      </div>
                    )}
                  </div>
                </div>
                {/* Hide DockBar on mobile when map is fullscreen */}
                <div className={showMap ? "hidden lg:block" : ""}>
                  <DockBar onAddEvent={handleAddEvent} onAiZap={() => setAiZapOpen(true)} />
                </div>
              </>
            )}

            {/* Media tab */}
            {activeTab === "media" && (
              <TripMediaGallery
                media={trip.media ?? []}
                onUpdate={(media) => updateTrip(trip.id, { media })}
              />
            )}

            {activeTab === "people" && (
              <div className="px-3 sm:px-4 lg:px-10 pt-6 sm:pt-10 pb-32 w-full">
                <div className="max-w-2xl mx-auto space-y-8">
                  {/* Trip Travelers */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-brand">Trip Travelers</h3>
                      <span className="text-[10px] font-bold text-slate-500 dark:text-[#888] uppercase tracking-wider">{tripTravelers.length} assigned</span>
                    </div>
                    {tripTravelers.length > 0 ? (
                      <div className="space-y-2">
                        {tripTravelers.map(t => {
                          const eventCount = trip.events.filter(e => e.assignedTo?.includes(t.id)).length;
                          const allEventsCount = trip.events.filter(e => !e.assignedTo || e.assignedTo.length === 0).length;
                          return (
                            <div key={t.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] group hover:border-brand/30 transition-colors">
                              <div className="h-10 w-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand text-xs font-black uppercase shrink-0">{t.initials}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{t.name}</p>
                                <p className="text-[10px] text-slate-500 dark:text-[#888] font-medium truncate">{t.email}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {eventCount > 0 && (
                                  <span className="text-[10px] font-bold text-brand/60 uppercase tracking-wider hidden sm:inline">
                                    {eventCount} tagged
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newIds = (trip.travelerIds || []).filter(id => id !== t.id);
                                    const newTravelers = (trip.travelers || []).filter(tr => tr.id !== t.id);
                                    updateTrip(trip.id, { travelerIds: newIds, travelers: newTravelers });
                                    // Also remove from any event assignedTo
                                    trip.events.forEach(ev => {
                                      if (ev.assignedTo?.includes(t.id)) {
                                        updateEvent(trip.id, { ...ev, assignedTo: ev.assignedTo.filter(id => id !== t.id) });
                                      }
                                    });
                                    toast.success(`Removed ${t.name} from trip`);
                                  }}
                                  className="h-8 w-8 rounded-lg text-slate-400 dark:text-[#555] hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-[#111111] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] rounded-2xl text-slate-500 dark:text-[#888]">
                        <Users className="h-10 w-10 mb-3 opacity-20" />
                        <p className="text-xs font-bold uppercase tracking-[0.2em]">No travelers assigned yet</p>
                        <p className="text-[10px] text-slate-400 dark:text-[#666] mt-1">Add travelers below to tag them on specific events</p>
                      </div>
                    )}
                  </div>

                  {/* Add Travelers */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-[#888]">Add Travelers</h3>
                    </div>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-[#555]" />
                      <input
                        value={peopleSearch}
                        onChange={e => setPeopleSearch(e.target.value)}
                        placeholder="Search travelers..."
                        className="w-full h-10 pl-9 pr-3 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus:outline-none focus:border-brand transition-colors"
                      />
                    </div>
                    {(() => {
                      const filtered = availableTravelers.filter(t =>
                        !peopleSearch || t.name.toLowerCase().includes(peopleSearch.toLowerCase()) || t.email.toLowerCase().includes(peopleSearch.toLowerCase())
                      );
                      return filtered.length > 0 ? (
                        <div className="space-y-1.5">
                          {filtered.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                const newIds = [...(trip.travelerIds || []), t.id];
                                const newTravelers = [...(trip.travelers || []), { id: t.id, name: t.name, initials: t.initials }];
                                updateTrip(trip.id, { travelerIds: newIds, travelers: newTravelers });
                                toast.success(`Added ${t.name} to trip`);
                              }}
                              className="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-[#0a0a0a] border border-slate-100 dark:border-[#1a1a1a] hover:border-brand/30 hover:bg-brand/5 transition-all group text-left"
                            >
                              <div className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-[#1f1f1f] flex items-center justify-center text-slate-500 dark:text-[#888] text-[10px] font-black uppercase shrink-0 group-hover:bg-brand/10 group-hover:text-brand transition-colors">{t.initials}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-700 dark:text-[#ccc] truncate group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t.name}</p>
                                <p className="text-[10px] text-slate-400 dark:text-[#666] truncate">{t.email}</p>
                              </div>
                              <Plus className="h-4 w-4 text-slate-300 dark:text-[#555] group-hover:text-brand transition-colors shrink-0" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-400 dark:text-[#666]">
                          <p className="text-xs font-bold uppercase tracking-wider">{allTravelers.length === 0 ? "No travelers created yet" : "All travelers are assigned"}</p>
                          <p className="text-[10px] mt-1">Add travelers on the Travelers page first</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </main>

          {showMap && (
            <aside className="absolute inset-0 lg:relative lg:inset-auto w-full lg:w-[40%] h-full border-l-0 lg:border-l border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] animate-in slide-in-from-right duration-500 z-40 overflow-hidden shadow-2xl flex flex-col">
              {/* Mobile header bar */}
              <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-[#1f1f1f] bg-white/95 dark:bg-[#111111]/95 backdrop-blur-sm shrink-0 z-50">
                <div className="flex items-center gap-2.5">
                  <MapIcon className="h-4 w-4 text-brand" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">Route Map</span>
                </div>
                <button
                  onClick={() => setShowMap(false)}
                  className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center active:scale-95 transition-transform"
                  aria-label="Close map"
                >
                  <X className="h-3.5 w-3.5 text-slate-600 dark:text-[#aaa]" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <TripMap theme={theme} trip={trip} />
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Event Edit Dialog — full screen */}
      <Dialog open={isEditPanelOpen} onOpenChange={setIsEditPanelOpen}>
        <DialogContent className="max-w-5xl w-[95vw] p-0 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] shadow-2xl rounded-2xl sm:rounded-[2rem] overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
          <form onSubmit={handleSaveEvent} className="flex flex-col h-full min-h-0">
            {/* Header */}
            <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-slate-200 dark:border-[#1f1f1f] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">
                  {editingEvent?.title ? "Edit Travel Event" : "Add Event to Itinerary"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#888888] mt-1">Fill in the travel details for this event.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
                {(["Proposed", "Confirmed", "Cancelled"] as const).map(s => (
                  <button key={s} type="button"
                    onClick={() => setEditingEvent(prev => prev ? { ...prev, status: s } : null)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all ${
                      editingEvent?.status === s
                        ? s === "Confirmed" ? "bg-emerald-400 text-black shadow-lg shadow-emerald-400/20"
                          : s === "Cancelled" ? "bg-red-500 text-white shadow-lg shadow-red-500/20"
                          : "bg-brand text-black shadow-lg shadow-brand/20"
                        : "bg-slate-100 dark:bg-[#1f1f1f] text-slate-500 dark:text-[#888] hover:bg-slate-200 dark:hover:bg-[#2a2a2a]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Body — two columns on desktop, stacked on mobile */}
            <div className="flex-1 flex flex-col md:grid md:grid-cols-5 min-h-0 overflow-y-auto md:overflow-hidden">
              {/* Left: core event fields */}
              <div className="md:col-span-3 md:overflow-y-auto border-b md:border-b-0 md:border-r border-slate-200 dark:border-[#1f1f1f]">
                {/* Category tabs */}
                <div className="grid grid-cols-4 border-b border-slate-200 dark:border-[#1f1f1f]">
                  {([
                    { id: "flight", label: "Flight", icon: Plane, color: "text-blue-400" },
                    { id: "hotel", label: "Hotel", icon: Hotel, color: "text-amber-400" },
                    { id: "activity", label: "Activity", icon: Compass, color: "text-brand" },
                    { id: "dining", label: "Dining", icon: Utensils, color: "text-pink-400" },
                  ] as const).map(cat => (
                    <button key={cat.id} type="button" onClick={() => setEditingEvent(prev => prev ? { ...prev, type: cat.id } : null)}
                      className={`flex flex-col items-center justify-center py-4 gap-1.5 border-b-2 transition-all ${editingEvent?.type === cat.id ? `border-brand bg-brand/5 ${cat.color}` : "border-transparent text-slate-500 dark:text-[#888888] hover:text-slate-600 dark:hover:text-[#888] hover:bg-slate-50 dark:hover:bg-[#0a0a0a]"}`}>
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

                <div className="p-4 sm:p-7 space-y-5">
                  {/* Title — large underline style */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand">Event Title</label>
                    <input
                      value={editingEvent?.title || ""}
                      onChange={e => setEditingEvent(prev => prev ? { ...prev, title: e.target.value } : null)}
                      placeholder="e.g., Private Maasai Mara Flight"
                      className="w-full bg-transparent border-0 border-b-2 border-slate-200 dark:border-[#2a2a2a] focus:border-brand focus:outline-none text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white pb-2 placeholder:text-slate-300 dark:placeholder:text-[#555] transition-colors"
                    />
                  </div>

                  {/* Date + Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Date</label>
                      <Popover>
                        <PopoverTrigger className={cn(
                          "w-full h-10 flex items-center gap-2 px-3 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] hover:border-brand/50 transition-colors text-left",
                          editingEvent?.date ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-[#888888]"
                        )}>
                          <CalendarDays className="h-3.5 w-3.5 text-brand shrink-0" />
                          <span className="text-sm">{editingEvent?.date ? format(parseISO(editingEvent.date), "MMM d, yyyy") : "Pick a date..."}</span>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border border-slate-200 dark:border-[#2a2a2a] shadow-2xl rounded-2xl bg-white dark:bg-[#1a1a1a]" align="start">
                          <Calendar mode="single" selected={editingEvent?.date ? parseISO(editingEvent.date) : undefined}
                            onSelect={(day) => day && setEditingEvent(prev => prev ? { ...prev, date: format(day, "yyyy-MM-dd") } : null)} initialFocus />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Start Time</label>
                      <Input value={editingEvent?.time || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, time: e.target.value } : null)} placeholder="10:30 AM" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                    </div>
                  </div>

                  {/* End Time + Duration for activity/dining */}
                  {(editingEvent?.type === "activity" || editingEvent?.type === "dining") && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">End Time</label>
                        <Input value={editingEvent?.endTime || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, endTime: e.target.value } : null)} placeholder="2:00 PM" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Duration</label>
                        <Input value={editingEvent?.duration || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, duration: e.target.value } : null)} placeholder="e.g., 3h 30m" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                      </div>
                    </div>
                  )}

                  {/* Location — with Mapbox autocomplete */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Location / Address</label>
                    <LocationAutocomplete
                      value={editingEvent?.location || ""}
                      onChange={val => setEditingEvent(prev => prev ? { ...prev, location: val } : null)}
                      placeholder="Search for a place..."
                      className="h-10 w-full text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 focus-visible:outline-none transition-colors"
                    />
                  </div>

                  {/* Supplier + Conf# */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Supplier / Provider</label>
                      <Input value={editingEvent?.supplier || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, supplier: e.target.value } : null)} placeholder="e.g., Qatar Airways" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Confirmation #</label>
                      <Input value={editingEvent?.confNumber || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, confNumber: e.target.value } : null)} placeholder="e.g., ABC-12345" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                    </div>
                  </div>

                  {/* Price */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Price (Optional)</label>
                    <Input value={editingEvent?.price || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, price: e.target.value } : null)} placeholder="e.g., 1,200 per person" className="h-10 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                  </div>

                  {/* Type-specific fields */}
                  {(editingEvent?.type === "flight" || editingEvent?.type === "hotel") && (
                    <div className="space-y-4 pt-1">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-slate-200 dark:bg-[#252525]" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand">
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
                              { key: "gate", label: "Gate" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">{f.label}</label>
                                <Input value={(editingEvent as Record<string, string>)[f.key] || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, [f.key]: e.target.value } : null)} className="h-9 text-sm bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg focus-visible:border-brand focus-visible:ring-0" />
                              </div>
                            ))}
                            <div className="col-span-2 space-y-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Seat / Ticket Details</label>
                              <Input value={editingEvent?.seatDetails || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, seatDetails: e.target.value } : null)} placeholder="e.g., 14A, 14B — Business Class" className="h-9 text-sm bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg focus-visible:border-brand focus-visible:ring-0" />
                            </div>
                          </>
                        ) : (
                          <>
                            {[
                              { key: "checkin", label: "Check-in" }, { key: "checkout", label: "Check-out" },
                              { key: "roomType", label: "Room Type" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">{f.label}</label>
                                <Input value={(editingEvent as Record<string, string>)[f.key] || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, [f.key]: e.target.value } : null)} className="h-9 text-sm bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-lg focus-visible:border-brand focus-visible:ring-0" />
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
              <div className="md:col-span-2 flex flex-col min-h-0 overflow-y-auto md:overflow-hidden md:border-l border-slate-200 dark:border-[#1f1f1f] bg-slate-50/40 dark:bg-[#0a0a0a]">
                {/* Search bar */}
                <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-[#1f1f1f] shrink-0 bg-white dark:bg-[#111111]">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 dark:text-[#888888]" />
                      <input
                        value={imageSearch}
                        onChange={e => setImageSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); runImageSearch(imageSearch); } }}
                        placeholder="Search images..."
                        className="w-full h-9 pl-9 pr-3 bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] rounded-lg text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-[#555] focus:outline-none focus:border-brand transition-colors"
                      />
                    </div>
                    <button type="button" onClick={() => runImageSearch(imageSearch)}
                      className="h-9 px-3 rounded-lg bg-brand text-black text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity shrink-0 flex items-center gap-1">
                      {isSearchingImages ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    </button>
                    {imageSearch && (
                      <button type="button" onClick={() => { setImageSearch(""); setImageResults([]); setImageSearchSource(null); }}
                        className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#252525] flex items-center justify-center text-slate-500 dark:text-[#888888] hover:text-slate-900 dark:hover:text-white transition-colors shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {imageIsAuto && (
                    <p className="text-[10px] text-slate-500 dark:text-[#888888] mt-2 flex items-center gap-1">
                      <Wand2 className="h-3 w-3 text-brand" /> Auto-matching from title
                    </p>
                  )}
                </div>

                {/* Selected image preview */}
                <div className="relative h-28 sm:h-44 shrink-0 bg-slate-200 dark:bg-[#111] overflow-hidden">
                  {editingEvent?.image ? (
                    <>
                      <img src={editingEvent.image} alt={editingEvent.title ? `Selected image for ${editingEvent.title}` : "Selected event image"} className="w-full h-full object-cover transition-all duration-500" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      <div className="absolute bottom-2 sm:bottom-3 left-3 right-3">
                        {editingEvent.title && <p className="text-white font-extrabold uppercase text-xs sm:text-base leading-tight drop-shadow-lg line-clamp-1 sm:line-clamp-2">{editingEvent.title}</p>}
                      </div>
                      {imageIsAuto && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 bg-brand text-black text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                          <Wand2 className="h-2.5 w-2.5" /> Auto
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                      <Camera className="h-7 w-7 text-slate-300 dark:text-[#333]" />
                      <p className="text-[10px] text-slate-500 dark:text-[#888888] uppercase tracking-widest font-bold">No image selected</p>
                    </div>
                  )}
                </div>

                {/* Scrollable area: results + media + docs + people + notes */}
                <div className="flex-1 overflow-y-auto min-h-0">
                {/* Results grid */}
                <div className="p-3">
                  {isSearchingImages ? (
                    <div className="flex items-center justify-center h-24 gap-2 text-slate-500 dark:text-[#888888]">
                      <Loader2 className="h-4 w-4 animate-spin text-brand" />
                      <span className="text-xs font-bold uppercase tracking-wider">Searching...</span>
                    </div>
                  ) : imageResults.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        {imageResults.map((url, i) => (
                          <button key={i} type="button"
                            onClick={() => { setEditingEvent(prev => prev ? { ...prev, image: url } : null); setImageIsAuto(false); }}
                            className={`relative h-[72px] rounded-lg overflow-hidden border-2 transition-all hover:scale-[1.02] ${editingEvent?.image === url ? "border-brand shadow-lg shadow-brand/30 scale-[1.02]" : "border-transparent hover:border-brand/50"}`}>
                            <img src={url} alt={`Image option ${i + 1}${imageSearch ? ` for ${imageSearch}` : ""}`} className="w-full h-full object-cover" loading="lazy" />
                          </button>
                        ))}
                      </div>
                      {(imageSearchSource === "unsplash" || imageSearchSource === "pexels") && imageLastQuery && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <button type="button" onClick={() => runImageSearch(imageLastQuery, imagePage)}
                            className="flex-1 h-7 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#252525] text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-[#aaa] hover:text-brand hover:border-brand/40 transition-colors flex items-center justify-center gap-1">
                            <RefreshCcw className="h-3 w-3" /> Refresh
                          </button>
                          <button type="button" onClick={() => runImageSearch(imageLastQuery, imagePage + 1)}
                            className="flex-1 h-7 rounded-lg bg-brand/10 border border-brand/40 text-[10px] font-bold uppercase tracking-wider text-brand hover:bg-brand/20 transition-colors flex items-center justify-center gap-1">
                            Next <ChevronRight className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      {imageSearchSource === "local" && (
                        <p className="text-[9px] text-slate-500/60 dark:text-[#444] font-bold uppercase tracking-widest text-center pt-1">
                          Suggested images · APIs unavailable
                        </p>
                      )}
                      {imageSearchSource === "google" && (
                        <p className="text-[9px] text-brand/60 font-bold uppercase tracking-widest text-center pt-1">
                          Google Image Search
                        </p>
                      )}
                      {imageSearchSource === "unsplash" && (
                        <p className="text-[9px] text-slate-500/60 dark:text-[#444] font-bold uppercase tracking-widest text-center pt-1">
                          Unsplash
                        </p>
                      )}
                      {imageSearchSource === "pexels" && (
                        <p className="text-[9px] text-slate-500/60 dark:text-[#444] font-bold uppercase tracking-widest text-center pt-1">
                          Pexels
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-20 gap-1.5 text-center">
                      <Search className="h-5 w-5 text-slate-300 dark:text-[#333]" />
                      <p className="text-[10px] text-slate-500 dark:text-[#888888] font-bold uppercase tracking-widest">Type to search images</p>
                    </div>
                  )}
                </div>

                {/* Media Upload */}
                <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] space-y-2 sm:space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Photos & Videos</label>
                    <button type="button" onClick={() => mediaInputRef.current?.click()}
                      className="h-7 px-3 rounded-lg bg-brand/10 border border-brand/20 text-brand text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-brand/20 transition-colors flex items-center gap-1.5">
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
                              <Video className="h-4 w-4 text-brand" />
                              <span className="text-[8px] text-slate-500 dark:text-[#888888] font-bold truncate w-full text-center leading-none">{m.name.replace(/\.[^.]+$/, "")}</span>
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
                      className="w-full h-10 sm:h-14 rounded-lg border-2 border-dashed border-slate-200 dark:border-[#252525] flex items-center justify-center gap-2 text-slate-500 dark:text-[#888888] hover:border-brand/50 hover:text-brand transition-colors group">
                      <ImageIcon2 className="h-4 w-4" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Add photos or videos</span>
                    </button>
                  )}
                </div>

                {/* Documents / Vouchers */}
                <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] space-y-2 sm:space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Documents / Vouchers</label>
                    <button type="button" onClick={() => documentInputRef.current?.click()}
                      className="h-7 px-3 rounded-lg bg-brand/10 border border-brand/20 text-brand text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-brand/20 transition-colors flex items-center gap-1.5">
                      <Paperclip className="h-3 w-3" /> Attach
                    </button>
                    <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf,image/*" multiple className="hidden" onChange={handleDocumentUpload} />
                  </div>
                  {(editingEvent?.documents?.length ?? 0) > 0 ? (
                    <div className="space-y-1.5">
                      {editingEvent!.documents!.map((doc, i) => (
                        <div key={doc.id} className="group flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] hover:border-brand/40 transition-colors">
                          <div className="h-8 w-8 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
                            <FileText className="h-3.5 w-3.5 text-brand" />
                          </div>
                          <button type="button" onClick={() => handleOpenDocument(doc.url)} className="flex-1 min-w-0 text-left">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{doc.name}</p>
                            <p className="text-[10px] font-medium text-slate-500 dark:text-[#888888] uppercase tracking-wider">{formatFileSize(doc.size)}</p>
                          </button>
                          <button type="button" onClick={() => handleRemoveDocument(i)}
                            className="h-6 w-6 rounded-md text-slate-400 dark:text-[#666] hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button type="button" onClick={() => documentInputRef.current?.click()}
                      className="w-full h-10 sm:h-14 rounded-lg border-2 border-dashed border-slate-200 dark:border-[#252525] flex items-center justify-center gap-2 text-slate-500 dark:text-[#888888] hover:border-brand/50 hover:text-brand transition-colors">
                      <Paperclip className="h-4 w-4" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Attach PDF, voucher, or booking confirmation</span>
                    </button>
                  )}
                </div>

                {/* People Assignment */}
                <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">People</label>
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#1a1a1a] rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => setEditingEvent(prev => prev ? { ...prev, assignedTo: undefined } : null)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                          !editingEvent?.assignedTo || editingEvent.assignedTo.length === 0
                            ? "bg-brand text-black shadow-sm"
                            : "text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Everyone
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingEvent(prev => prev ? { ...prev, assignedTo: prev.assignedTo?.length ? prev.assignedTo : [] } : null)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                          editingEvent?.assignedTo && editingEvent.assignedTo.length >= 0 && editingEvent.assignedTo !== undefined
                            ? "bg-brand text-black shadow-sm"
                            : "text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Specific
                      </button>
                    </div>
                  </div>
                  {editingEvent?.assignedTo !== undefined && (
                    <div className="space-y-1.5">
                      {tripTravelers.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {tripTravelers.map(t => {
                            const isAssigned = editingEvent.assignedTo?.includes(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  setEditingEvent(prev => {
                                    if (!prev) return null;
                                    const current = prev.assignedTo || [];
                                    const next = isAssigned
                                      ? current.filter(id => id !== t.id)
                                      : [...current, t.id];
                                    return { ...prev, assignedTo: next };
                                  });
                                }}
                                className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                  isAssigned
                                    ? "bg-brand/10 border-brand/30 text-brand"
                                    : "bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-500 dark:text-[#888] hover:border-brand/30"
                                }`}
                              >
                                <span className="h-5 w-5 rounded-md bg-slate-200 dark:bg-[#1f1f1f] flex items-center justify-center text-[8px] font-black shrink-0">{t.initials}</span>
                                {t.name.split(" ")[0]}
                                {isAssigned && <Check className="h-3 w-3" />}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 dark:text-[#666] font-medium">
                          Add travelers in the People tab first to assign them to events.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Description (visible to travelers) */}
                <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Description (Visible to Travelers)</label>
                  <Textarea value={editingEvent?.description || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, description: e.target.value } : null)} placeholder="Public-facing description travelers will see..." className="rounded-lg h-14 sm:h-20 text-sm font-medium bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white resize-none focus-visible:border-brand focus-visible:ring-0" />
                </div>

                {/* Notes */}
                <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Agent Notes (Internal)</label>
                  <Textarea value={editingEvent?.notes || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, notes: e.target.value } : null)} className="rounded-lg h-14 sm:h-20 text-sm font-medium bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white resize-none focus-visible:border-brand focus-visible:ring-0" />
                </div>
                </div>{/* end scrollable area */}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-8 py-4 sm:py-5 bg-white dark:bg-[#111111] border-t border-slate-200 dark:border-[#1f1f1f] flex items-center justify-between gap-3 shrink-0">
              <button type="button" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-colors px-4 py-2" onClick={() => setIsEditPanelOpen(false)}>Cancel</button>
              <Button type="submit" className="h-10 sm:h-11 px-6 sm:px-10 rounded-xl bg-brand hover:opacity-90 text-slate-900 dark:text-black font-bold uppercase tracking-wider text-xs shadow-lg shadow-brand/20">
                Save Event
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AiZapDialog open={aiZapOpen} onOpenChange={setAiZapOpen} />

      <ImportItineraryDialog
        open={reimportOpen}
        onOpenChange={setReimportOpen}
        existingTripId={trip?.id}
      />

      <ShareTripDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        tripId={trip.id}
        tripName={trip.name}
      />

      <ItineraryPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        trip={trip}
      />

      {/* Edit Trip Dialog */}
      <Dialog open={editTripOpen} onOpenChange={setEditTripOpen}>
        <DialogContent className="max-w-2xl bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] shadow-2xl overflow-hidden p-0">
          <form onSubmit={handleSaveTrip}>
            <DialogHeader className="px-8 pt-8 pb-5 border-b border-slate-200 dark:border-[#1f1f1f]">
              <DialogTitle className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Edit Trip</DialogTitle>
              <p className="text-xs text-slate-500 dark:text-[#666] font-medium mt-1">Configure trip details, organizer, and traveler information</p>
            </DialogHeader>
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">

              {/* ── Section: Cover Image ── */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <ImageIcon2 className="h-3.5 w-3.5 text-brand" />
                  <label className="text-[10px] font-black uppercase tracking-[0.25em] text-brand">Cover Image</label>
                </div>
                {editingTrip.image && (
                  <div className="h-36 rounded-2xl overflow-hidden relative">
                    <img src={editingTrip.image} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  </div>
                )}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-[#555] pointer-events-none" />
                    <input
                      value={tripImageSearch}
                      onChange={e => setTripImageSearch(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); runTripImageSearch(tripImageSearch); } }}
                      placeholder="Search destinations…"
                      className="w-full h-9 pl-9 pr-3 bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus:outline-none focus:border-brand transition-colors"
                    />
                  </div>
                  <button type="button" onClick={() => runTripImageSearch(tripImageSearch)}
                    className="h-9 px-3 rounded-xl bg-brand text-black text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center gap-1 shrink-0">
                    {isTripImageSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  </button>
                  {tripImageResults.length > 0 && (
                    <>
                      <button type="button" aria-label="Refresh" onClick={() => runTripImageSearch(tripImageLastQuery || tripImageSearch, tripImagePage)} disabled={isTripImageSearching}
                        className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#252525] flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-brand transition-colors shrink-0 disabled:opacity-40">
                        <RefreshCcw className={`h-3.5 w-3.5 ${isTripImageSearching ? "animate-spin" : ""}`} />
                      </button>
                      <button type="button" aria-label="Next page" onClick={() => runTripImageSearch(tripImageLastQuery || tripImageSearch, tripImagePage + 1)} disabled={isTripImageSearching}
                        className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#252525] flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-brand transition-colors shrink-0 disabled:opacity-40">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => { setTripImageResults([]); setTripImageSearch(""); setTripImagePage(1); setTripImageLastQuery(""); }}
                        className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#252525] flex items-center justify-center text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-colors shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {isTripImageSearching ? (
                    <div className="col-span-5 flex items-center justify-center h-20 gap-2 text-slate-500 dark:text-[#888]">
                      <Loader2 className="h-4 w-4 animate-spin text-brand" />
                      <span className="text-xs font-bold uppercase tracking-wider">Searching…</span>
                    </div>
                  ) : tripImageResults.length > 0 ? (
                    tripImageResults.map((url, i) => (
                      <button key={i} type="button" onClick={() => setEditingTrip(prev => ({ ...prev, image: url }))}
                        className={`relative h-16 rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.03] ${editingTrip.image === url ? "border-brand shadow-lg shadow-brand/30 scale-[1.03]" : "border-transparent hover:border-brand/50"}`}>
                        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))
                  ) : (
                    COVER_IMAGES.map(({ url, label }) => (
                      <button key={url} type="button" onClick={() => setEditingTrip(prev => ({ ...prev, image: url }))}
                        className={`relative h-16 rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.03] ${editingTrip.image === url ? "border-brand shadow-lg shadow-brand/30 scale-[1.03]" : "border-transparent hover:border-brand/50"}`}>
                        <img src={url} alt={label} className="w-full h-full object-cover" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/10" />
                        <span className="absolute bottom-1 left-0 right-0 text-center text-[8px] font-black uppercase tracking-wider text-white">{label}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* ── Section: Trip Details ── */}
              <div className="pt-5 border-t border-slate-200 dark:border-[#1f1f1f]">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="h-3.5 w-3.5 text-brand" />
                  <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-brand">Trip Details</h4>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Trip Name</label>
                    <Input value={editingTrip.name ?? ""} onChange={e => setEditingTrip(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Kenya Safari 2025" className="h-10 text-sm bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-xl focus-visible:border-brand focus-visible:ring-0" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Destination</label>
                      <Input value={editingTrip.destination ?? ""} onChange={e => setEditingTrip(prev => ({ ...prev, destination: e.target.value }))} placeholder="e.g., Nairobi, Kenya" className="h-10 text-sm bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-xl focus-visible:border-brand focus-visible:ring-0" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Attendees</label>
                      <Input value={editingTrip.attendees ?? ""} onChange={e => setEditingTrip(prev => ({ ...prev, attendees: e.target.value }))} placeholder="e.g., 4 Travelers" className="h-10 text-sm bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-xl focus-visible:border-brand focus-visible:ring-0" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Start Date</label>
                      <Popover>
                        <PopoverTrigger className="w-full h-10 px-3 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-xl focus:outline-none focus:border-brand transition-colors flex items-center justify-between gap-2 text-left">
                          <span className={editingTrip.start ? "" : "text-slate-400 dark:text-[#555]"}>
                            {editingTrip.start ? format(parseISO(editingTrip.start), "d MMM yyyy") : "Select date"}
                          </span>
                          <CalendarDays className="h-3.5 w-3.5 text-slate-400 dark:text-[#666] shrink-0" />
                        </PopoverTrigger>
                        <PopoverContent align="start" className="p-0 w-auto">
                          <Calendar mode="single" selected={editingTrip.start ? parseISO(editingTrip.start) : undefined} onSelect={d => d && setEditingTrip(prev => ({ ...prev, start: format(d, "yyyy-MM-dd") }))} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">End Date</label>
                      <Popover>
                        <PopoverTrigger className="w-full h-10 px-3 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-xl focus:outline-none focus:border-brand transition-colors flex items-center justify-between gap-2 text-left">
                          <span className={editingTrip.end ? "" : "text-slate-400 dark:text-[#555]"}>
                            {editingTrip.end ? format(parseISO(editingTrip.end), "d MMM yyyy") : "Select date"}
                          </span>
                          <CalendarDays className="h-3.5 w-3.5 text-slate-400 dark:text-[#666] shrink-0" />
                        </PopoverTrigger>
                        <PopoverContent align="start" className="p-0 w-auto">
                          <Calendar mode="single" selected={editingTrip.end ? parseISO(editingTrip.end) : undefined} onSelect={d => d && setEditingTrip(prev => ({ ...prev, end: format(d, "yyyy-MM-dd") }))} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">Currency</label>
                      <select
                        value={editingTrip.currency ?? "USD"}
                        onChange={e => setEditingTrip(prev => ({ ...prev, currency: e.target.value }))}
                        className="w-full h-10 px-3 text-sm font-semibold bg-slate-50 dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-xl focus:outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                      >
                        {[
                          ["USD", "USD — US Dollar"],
                          ["EUR", "EUR — Euro"],
                          ["GBP", "GBP — British Pound"],
                          ["AED", "AED — UAE Dirham"],
                          ["AUD", "AUD — Australian Dollar"],
                          ["CAD", "CAD — Canadian Dollar"],
                          ["CHF", "CHF — Swiss Franc"],
                          ["CNY", "CNY — Chinese Yuan"],
                          ["INR", "INR — Indian Rupee"],
                          ["JPY", "JPY — Japanese Yen"],
                          ["KES", "KES — Kenyan Shilling"],
                          ["MXN", "MXN — Mexican Peso"],
                          ["NGN", "NGN — Nigerian Naira"],
                          ["SGD", "SGD — Singapore Dollar"],
                          ["THB", "THB — Thai Baht"],
                          ["ZAR", "ZAR — South African Rand"],
                        ].map(([code, label]) => (
                          <option key={code} value={code}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Section: Organizer / Agent ── */}
              <div className="pt-5 border-t border-slate-200 dark:border-[#1f1f1f]">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-3.5 w-3.5 text-brand" />
                  <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-brand">Organizer / Agent</h4>
                </div>
                <div className="flex gap-5">
                  {/* Avatar preview */}
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center">
                      {editingTrip.organizer?.name ? (
                        <span className="text-lg font-black text-brand uppercase">
                          {editingTrip.organizer.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("")}
                        </span>
                      ) : (
                        <Users className="h-6 w-6 text-brand/40" />
                      )}
                    </div>
                    <span className="text-[8px] font-bold text-slate-400 dark:text-[#555] uppercase tracking-wider">Preview</span>
                  </div>
                  {/* Fields */}
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    {([
                      { key: "name" as const, label: "Full Name", placeholder: "e.g., Jane Smith", span: 2 },
                      { key: "role" as const, label: "Role", placeholder: "e.g., Travel Consultant" },
                      { key: "company" as const, label: "Company", placeholder: "e.g., Acme Travel" },
                      { key: "email" as const, label: "Email", placeholder: "e.g., jane@acme.com" },
                      { key: "phone" as const, label: "Phone", placeholder: "e.g., +1 555 0123" },
                    ] satisfies { key: keyof TripOrganizer; label: string; placeholder: string; span?: number }[]).map(f => (
                      <div key={f.key} className={`space-y-1 ${f.span === 2 ? "col-span-2" : ""}`}>
                        <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888888]">{f.label}</label>
                        <Input
                          value={editingTrip.organizer?.[f.key] ?? ""}
                          onChange={e => setEditingTrip(prev => ({ ...prev, organizer: { ...(prev.organizer ?? { name: "" }), [f.key]: e.target.value } }))}
                          placeholder={f.placeholder}
                          className="h-9 text-sm bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-xl focus-visible:border-brand focus-visible:ring-0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Section: Information & Documents ── */}
              <div className="pt-5 border-t border-slate-200 dark:border-[#1f1f1f]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-brand" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-brand">Information & Documents</h4>
                    {(editingTrip.info?.length ?? 0) > 0 && (
                      <span className="text-[9px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full">{editingTrip.info!.length}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingTrip(prev => ({
                      ...prev,
                      info: [...(prev.info ?? []), { id: Date.now().toString(), title: "", body: "" }],
                    }))}
                    className="h-7 px-3 rounded-lg bg-brand/10 hover:bg-brand/20 text-[10px] font-bold uppercase tracking-wider text-brand transition-colors flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add Page
                  </button>
                </div>
                {(editingTrip.info ?? []).length === 0 && (
                  <div className="text-center py-8 rounded-2xl border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] bg-slate-50/50 dark:bg-[#080808]">
                    <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto mb-3">
                      <FileText className="h-5 w-5 text-brand/50" />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-[#666] font-bold">No information pages yet</p>
                    <p className="text-[10px] text-slate-400 dark:text-[#444] mt-1 max-w-[200px] mx-auto">Add travel tips, visa info, packing lists, and more for your travelers</p>
                  </div>
                )}
                {(editingTrip.info ?? []).map((item, idx) => (
                  <div key={item.id} className="mb-3 group rounded-2xl bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    {/* Card header with number badge + title + delete */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="shrink-0 w-7 h-7 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
                        <span className="text-[11px] font-black text-brand">{idx + 1}</span>
                      </div>
                      <Input
                        value={item.title}
                        onChange={e => {
                          const updated = [...(editingTrip.info ?? [])];
                          updated[idx] = { ...updated[idx], title: e.target.value };
                          setEditingTrip(prev => ({ ...prev, info: updated }));
                        }}
                        placeholder="Page title — e.g., Visa Requirements"
                        className="h-8 text-sm font-bold bg-transparent border-0 text-slate-900 dark:text-white focus-visible:ring-0 p-0 flex-1 placeholder:text-slate-300 dark:placeholder:text-[#333]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (editingTrip.info ?? []).filter((_, i) => i !== idx);
                          setEditingTrip(prev => ({ ...prev, info: updated }));
                        }}
                        className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-slate-300 dark:text-[#333] hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Body textarea */}
                    <div className="px-4 pb-4">
                      <Textarea
                        value={item.body}
                        onChange={e => {
                          const updated = [...(editingTrip.info ?? [])];
                          updated[idx] = { ...updated[idx], body: e.target.value };
                          setEditingTrip(prev => ({ ...prev, info: updated }));
                        }}
                        placeholder="Write content that travelers will see..."
                        className="min-h-[100px] text-sm bg-slate-50 dark:bg-[#080808] border border-slate-200 dark:border-[#1a1a1a] text-slate-900 dark:text-white resize-none rounded-xl focus-visible:border-brand focus-visible:ring-0 px-3 py-2.5 leading-relaxed placeholder:text-slate-300 dark:placeholder:text-[#333]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Section: Status ── */}
              <div className="pt-5 border-t border-slate-200 dark:border-[#1f1f1f]">
                <div className="flex items-center gap-2 mb-4">
                  <Tag className="h-3.5 w-3.5 text-brand" />
                  <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-brand">Status</h4>
                </div>
                <div className="flex gap-2">
                  {(["Draft", "In Progress", "Published"] as const).map(s => (
                    <button key={s} type="button" onClick={() => setEditingTrip(prev => ({ ...prev, status: s }))}
                      className={`flex-1 h-11 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
                        editingTrip.status === s
                          ? s === "Published" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                            : s === "In Progress" ? "bg-brand text-black shadow-lg shadow-brand/20"
                            : "bg-slate-800 dark:bg-white text-white dark:text-black shadow-lg"
                          : "bg-slate-100 dark:bg-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:bg-slate-200 dark:hover:bg-[#2a2a2a]"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="px-8 py-5 border-t border-slate-200 dark:border-[#1f1f1f] flex items-center justify-between">
              <button type="button" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-colors px-4 py-2" onClick={() => setEditTripOpen(false)}>Cancel</button>
              <Button type="submit" className="h-11 px-10 rounded-xl bg-brand hover:opacity-90 text-slate-900 dark:text-black font-bold uppercase tracking-wider text-xs shadow-lg shadow-brand/20">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Organizer mini-dialog ── */}
      <Dialog open={editOrgOpen} onOpenChange={setEditOrgOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-[#111111] rounded-2xl border border-slate-200 dark:border-[#1f1f1f] shadow-2xl overflow-hidden p-0">
          <form onSubmit={handleSaveOrg}>
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-[#1f1f1f]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center">
                  <Users className="h-4 w-4 text-brand" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Organizer</DialogTitle>
                  <p className="text-[10px] text-slate-500 dark:text-[#666] font-medium mt-0.5">Trip contact person visible to travelers</p>
                </div>
              </div>
            </DialogHeader>
            <div className="p-6 space-y-3">
              {([
                { key: "name" as const, label: "Full Name", placeholder: "e.g., Jane Smith" },
                { key: "role" as const, label: "Role", placeholder: "e.g., Travel Consultant" },
                { key: "company" as const, label: "Company", placeholder: "e.g., Acme Travel" },
                { key: "email" as const, label: "Email", placeholder: "e.g., jane@acme.com" },
                { key: "phone" as const, label: "Phone", placeholder: "e.g., +1 555 0123" },
              ] satisfies { key: keyof TripOrganizer; label: string; placeholder: string }[]).map(f => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-[#888]">{f.label}</label>
                  <Input
                    value={editOrgData[f.key] ?? ""}
                    onChange={e => setEditOrgData(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="h-10 text-sm bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white rounded-xl focus-visible:border-brand focus-visible:ring-0"
                  />
                </div>
              ))}
            </div>
            <DialogFooter className="px-6 py-4 border-t border-slate-200 dark:border-[#1f1f1f] flex items-center justify-between">
              <button type="button" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-colors px-4 py-2" onClick={() => setEditOrgOpen(false)}>Cancel</button>
              <Button type="submit" className="h-10 px-8 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider text-xs shadow-lg shadow-brand/20">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Information mini-dialog ── */}
      <Dialog open={editInfoOpen} onOpenChange={setEditInfoOpen}>
        <DialogContent className="max-w-lg bg-white dark:bg-[#111111] rounded-2xl border border-slate-200 dark:border-[#1f1f1f] shadow-2xl overflow-hidden p-0">
          <form onSubmit={handleSaveInfo}>
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-[#1f1f1f]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-brand" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Information</DialogTitle>
                    <p className="text-[10px] text-slate-500 dark:text-[#666] font-medium mt-0.5">Pages visible to travelers</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditInfoData(prev => [...prev, { id: Date.now().toString(), title: "", body: "" }])}
                  className="h-9 px-3 rounded-xl bg-brand/10 hover:bg-brand/20 text-[10px] font-bold uppercase tracking-wider text-brand transition-colors flex items-center gap-1.5"
                >
                  <Plus className="h-3 w-3" /> Add Page
                </button>
              </div>
            </DialogHeader>
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
              {editInfoData.length === 0 && (
                <div className="text-center py-10 rounded-2xl border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] bg-slate-50/50 dark:bg-[#080808]">
                  <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto mb-3">
                    <FileText className="h-5 w-5 text-brand/50" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-[#666] font-bold">No pages yet</p>
                  <p className="text-[10px] text-slate-400 dark:text-[#444] mt-1">Add travel tips, visa info, packing lists</p>
                </div>
              )}
              {editInfoData.map((item, idx) => (
                <div key={item.id} className="group rounded-2xl bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="shrink-0 w-7 h-7 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
                      <span className="text-[11px] font-black text-brand">{idx + 1}</span>
                    </div>
                    <Input
                      value={item.title}
                      onChange={e => {
                        const updated = [...editInfoData];
                        updated[idx] = { ...updated[idx], title: e.target.value };
                        setEditInfoData(updated);
                      }}
                      placeholder="Page title — e.g., Visa Requirements"
                      className="h-8 text-sm font-bold bg-transparent border-0 text-slate-900 dark:text-white focus-visible:ring-0 p-0 flex-1 placeholder:text-slate-300 dark:placeholder:text-[#333]"
                    />
                    <button
                      type="button"
                      onClick={() => setEditInfoData(prev => prev.filter((_, i) => i !== idx))}
                      className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-slate-300 dark:text-[#333] hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="px-4 pb-4">
                    <Textarea
                      value={item.body}
                      onChange={e => {
                        const updated = [...editInfoData];
                        updated[idx] = { ...updated[idx], body: e.target.value };
                        setEditInfoData(updated);
                      }}
                      placeholder="Write content that travelers will see..."
                      className="min-h-[100px] text-sm bg-slate-50 dark:bg-[#080808] border border-slate-200 dark:border-[#1a1a1a] text-slate-900 dark:text-white resize-none rounded-xl focus-visible:border-brand focus-visible:ring-0 px-3 py-2.5 leading-relaxed placeholder:text-slate-300 dark:placeholder:text-[#333]"
                    />
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter className="px-6 py-4 border-t border-slate-200 dark:border-[#1f1f1f] flex items-center justify-between">
              <button type="button" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white transition-colors px-4 py-2" onClick={() => setEditInfoOpen(false)}>Cancel</button>
              <Button type="submit" className="h-10 px-8 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider text-xs shadow-lg shadow-brand/20">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Trip"
        description={`Are you sure you want to delete "${trip.name}"? This cannot be undone.`}
        confirmLabel="Delete Trip"
        onConfirm={handleDeleteTrip}
        destructive
      />
    </div>
  );
}
