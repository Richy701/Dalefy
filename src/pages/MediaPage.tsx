import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  Trash2,
  ZoomIn,
  Play,
  Images,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Image as ImageIcon,
  Film,
  ArrowUpRight,
  Download,
} from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { toast } from "sonner";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseStorage } from "@/services/firebase";
import { useTrips } from "@/context/TripsContext";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { BrandIllustration } from "@/components/shared/BrandIllustration";
import type { TripMedia } from "@/types";

type FilteredItem = TripMedia & { tripId: string; tripName: string; tripImage: string };
type MediaFilter = "all" | "image" | "video";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function MediaPage() {
  const { trips, updateTrip } = useTrips();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTripFilter, setActiveTripFilter] = useState<string>("all");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTripId, setUploadTripId] = useState<string>(() => trips[0]?.id ?? "");
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Aggregate all media across trips
  const allItems = useMemo<FilteredItem[]>(() =>
    trips.flatMap((t) =>
      (t.media ?? []).map((m) => ({
        ...m,
        tripId: t.id,
        tripName: t.name,
        tripImage: t.image,
      }))
    ),
    [trips]
  );

  const filtered = useMemo(() => {
    let items = activeTripFilter === "all"
      ? allItems
      : allItems.filter((m) => m.tripId === activeTripFilter);
    if (mediaFilter !== "all") {
      items = items.filter((m) => m.type === mediaFilter);
    }
    return items;
  }, [allItems, activeTripFilter, mediaFilter]);

  // Group filtered items by trip
  const groupedByTrip = useMemo(() => {
    const map = new Map<string, { tripId: string; tripName: string; tripImage: string; items: FilteredItem[] }>();
    for (const item of filtered) {
      const existing = map.get(item.tripId);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(item.tripId, { tripId: item.tripId, tripName: item.tripName, tripImage: item.tripImage, items: [item] });
      }
    }
    return Array.from(map.values());
  }, [filtered]);

  const lightboxSlides = useMemo(() =>
    filtered
      .filter((m) => m.type === "image")
      .map((m) => ({ src: m.url, title: `${m.name} · ${m.tripName}` })),
    [filtered]
  );

  const totalPhotos = allItems.filter((m) => m.type === "image").length;
  const totalVideos = allItems.filter((m) => m.type === "video").length;

  const selectedTrip = trips.find((t) => t.id === uploadTripId);

  const processFiles = useCallback(
    async (files: File[]) => {
      if (!uploadTripId) {
        toast.error("Select a trip first");
        return;
      }
      const valid = files.filter(
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
      );
      if (!valid.length) {
        toast.error("Only image and video files are supported");
        return;
      }
      if (valid.some((f) => f.size > 50 * 1024 * 1024)) {
        toast.error("Files must be under 50 MB");
        return;
      }

      setUploading(true);
      setUploadProgress(0);

      const interval = setInterval(() => {
        setUploadProgress((p) => {
          if (p >= 90) { clearInterval(interval); return p; }
          return p + Math.random() * 12;
        });
      }, 120);

      try {
        const uploaded: TripMedia[] = await Promise.all(
          valid.map(async (file) => {
            const id = `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const ext = file.name.split(".").pop() || "jpg";
            const storagePath = `trips/${uploadTripId}/media/${id}.${ext}`;
            const storageRef = ref(firebaseStorage(), storagePath);
            await uploadBytes(storageRef, file, { contentType: file.type });
            const url = await getDownloadURL(storageRef);
            return {
              id,
              type: (file.type.startsWith("video/") ? "video" : "image") as "image" | "video",
              name: file.name,
              url,
              size: file.size,
              uploadedAt: new Date().toISOString(),
              uploadedBy: user?.name || undefined,
            };
          }),
        );

        clearInterval(interval);
        setUploadProgress(100);
        const trip = trips.find((t) => t.id === uploadTripId);
        if (!trip) return;
        setTimeout(() => {
          updateTrip(uploadTripId, { media: [...(trip.media ?? []), ...uploaded] });
          setUploading(false);
          setUploadProgress(0);
          toast.success(`${uploaded.length} file${uploaded.length > 1 ? "s" : ""} uploaded to ${trip.name}`);
        }, 350);
      } catch (err) {
        clearInterval(interval);
        setUploading(false);
        setUploadProgress(0);
        toast.error("Upload failed — check your connection");
        console.error("[MediaPage] Upload error:", err);
      }
    },
    [uploadTripId, trips, updateTrip]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(Array.from(e.dataTransfer.files));
    },
    [processFiles]
  );

  const handleDelete = (item: FilteredItem) => {
    const trip = trips.find((t) => t.id === item.tripId);
    if (!trip) return;
    updateTrip(item.tripId, { media: (trip.media ?? []).filter((m) => m.id !== item.id) });
    toast.success("Removed");
  };

  const getLightboxIndex = (item: FilteredItem) => {
    if (item.type !== "image") return -1;
    return lightboxSlides.findIndex((s) => s.src === item.url);
  };

  const tripsWithMedia = trips.filter((t) => (t.media?.length ?? 0) > 0);

  // Banner image & context: switches based on active trip filter
  const bannerTrip = activeTripFilter !== "all"
    ? trips.find((t) => t.id === activeTripFilter) ?? null
    : null;

  // For "all" mode — rotating carousel through all trips with images
  const carouselTrips = useMemo(() =>
    trips.filter((t) => !!t.image),
    [trips]
  );
  const [carouselIdx, setCarouselIdx] = useState(0);

  // Auto-rotate every 5s when on "All" view
  useEffect(() => {
    if (bannerTrip || carouselTrips.length <= 1) return;
    const timer = setInterval(() => {
      setCarouselIdx((i) => (i + 1) % carouselTrips.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [bannerTrip, carouselTrips.length]);

  // Reset carousel index when trips change
  useEffect(() => {
    if (carouselIdx >= carouselTrips.length) setCarouselIdx(0);
  }, [carouselTrips.length, carouselIdx]);

  const currentCarouselTrip = carouselTrips[carouselIdx] ?? null;

  const bannerPhotos = bannerTrip
    ? filtered.filter((m) => m.type === "image").length
    : totalPhotos;
  const bannerVideos = bannerTrip
    ? filtered.filter((m) => m.type === "video").length
    : totalVideos;

  const chipScrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#050505]">
      <PageHeader
        left={
          <h1 className="text-sm font-black uppercase tracking-[0.25em] text-slate-900 dark:text-white">
            Media Library
          </h1>
        }
      />

      <div className="flex-1 overflow-y-auto min-h-0">

        {trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-full gap-3 px-4 py-16">
            <BrandIllustration src="/illustrations/illus-wavy.svg" className="w-72 h-72 object-contain" draggable={false} />
            <div className="text-center space-y-1.5">
              <p className="text-base font-black uppercase tracking-widest text-slate-800 dark:text-white">No media yet</p>
              <p className="text-xs font-medium text-slate-400 dark:text-[#666]">Create a trip first, then upload your photos and videos</p>
            </div>
            <button
              onClick={() => navigate("/dashboard")}
              className="h-10 px-6 rounded-full bg-brand text-[#050505] text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
            >
              Create a Trip
            </button>
          </div>
        ) : (<>

        {/* Hero Banner — rotating carousel (All) or trip-specific cover */}
        <div className="px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6">
          <div className="relative overflow-hidden rounded-2xl sm:rounded-[2rem] min-h-[220px] sm:min-h-[260px] bg-[#0e0e0e]">
            {/* Background image layer */}
            {bannerTrip ? (
              /* ── Trip-specific: full cover image ── */
              <img
                key={bannerTrip.id}
                src={bannerTrip.image}
                alt=""
                className="absolute inset-0 w-full h-full object-cover animate-fadeIn"
                draggable={false}
              />
            ) : (
              /* ── All trips: rotating carousel with crossfade ── */
              carouselTrips.map((t, i) => (
                <img
                  key={t.id}
                  src={t.image}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
                  style={{ opacity: i === carouselIdx ? 1 : 0 }}
                  draggable={false}
                />
              ))
            )}

            {/* Overlay gradients */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-black/30" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

            <div className="relative px-4 sm:px-8 py-8 sm:py-10 flex flex-col justify-between min-h-[220px] sm:min-h-[260px]">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.55em] text-brand mb-3">
                  {bannerTrip ? bannerTrip.destination : "Your Gallery"}
                </p>
                <h2 className="text-[2.5rem] font-black uppercase leading-none tracking-tight text-white">
                  {bannerTrip ? (
                    <>{bannerTrip.name}</>
                  ) : (
                    <>Photos &amp;<br />Videos</>
                  )}
                </h2>
                {bannerTrip && (
                  <p className="text-[11px] font-bold text-white/50 mt-2 uppercase tracking-wider">
                    {new Date(bannerTrip.start).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – {new Date(bannerTrip.end).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>

              <div className="flex items-end justify-between gap-6 mt-8">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-3xl font-black leading-none text-white">{bannerPhotos}</p>
                    <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/60 mt-1.5">Photos</p>
                  </div>
                  <div className="h-10 w-px bg-white/15" />
                  <div>
                    <p className="text-3xl font-black leading-none text-white">{bannerVideos}</p>
                    <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/60 mt-1.5">Videos</p>
                  </div>
                  {!bannerTrip && (
                    <>
                      <div className="h-10 w-px bg-white/15" />
                      <div>
                        <p className="text-3xl font-black leading-none text-white">{trips.length}</p>
                        <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/60 mt-1.5">Trips</p>
                      </div>
                    </>
                  )}
                </div>

                {bannerTrip ? (
                  <button
                    onClick={() => navigate(`/trip/${bannerTrip.id}`)}
                    className="hidden sm:flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-white/80 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-4 py-2 hover:bg-white/20 transition-colors"
                  >
                    Open Trip
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                ) : currentCarouselTrip ? (
                  <div className="hidden sm:flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-white/70 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-3 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                    {currentCarouselTrip.name}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Carousel controls — bottom center of banner */}
            {!bannerTrip && carouselTrips.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
                <button
                  onClick={() => setCarouselIdx((i) => (i - 1 + carouselTrips.length) % carouselTrips.length)}
                  className="h-7 w-7 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:bg-black/60 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-center gap-1.5 px-1">
                  {carouselTrips.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCarouselIdx(i)}
                      className={`rounded-full transition-all duration-300 ${
                        i === carouselIdx
                          ? "h-2 w-5 bg-brand"
                          : "h-2 w-2 bg-white/30 hover:bg-white/50"
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setCarouselIdx((i) => (i + 1) % carouselTrips.length)}
                  className="h-7 w-7 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:bg-black/60 transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* Hidden file input — always rendered so empty-state button works */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => { processFiles(Array.from(e.target.files || [])); e.target.value = ""; }}
        />

        {/* ── Compact Upload Bar (only when media exists) ── */}
        {allItems.length > 0 && <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 rounded-2xl border transition-all ${
            isDragging
              ? "border-brand bg-brand/5 shadow-lg shadow-brand/10"
              : "border-black/[0.06] dark:border-[#1f1f1f] bg-white dark:bg-[#111111] shadow-sm dark:shadow-none"
          }`}
        >
          {/* Trip picker + upload button row */}
          <div className="flex items-center gap-2.5 sm:contents">
          <div className="relative shrink-0 flex-1 sm:flex-none" ref={pickerRef}>
            <button
              onClick={() => setTripPickerOpen((o) => !o)}
              className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-[#0a0a0a] hover:bg-slate-100 dark:hover:bg-[#1a1a1a] transition-colors text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-white"
            >
              {selectedTrip ? (
                <>
                  <div className="h-5 w-6 rounded overflow-hidden shrink-0">
                    <img src={selectedTrip.image} alt="" className="h-full w-full object-cover" />
                  </div>
                  <span className="truncate max-w-[120px]">{selectedTrip.name}</span>
                </>
              ) : (
                <span className="text-slate-400 dark:text-[#666]">Select trip</span>
              )}
              <ChevronDown className="h-3 w-3 text-slate-400 dark:text-[#666] shrink-0" />
            </button>

            {tripPickerOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-64 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
                {trips.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setUploadTripId(t.id); setTripPickerOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-[#050505] transition-colors text-left ${t.id === uploadTripId ? "text-brand" : "text-slate-700 dark:text-[#ccc]"}`}
                  >
                    <div className="h-6 w-8 rounded overflow-hidden shrink-0">
                      <img src={t.image} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-tight truncate">{t.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-[#888888]">{t.media?.length ?? 0} files</p>
                    </div>
                    {t.id === uploadTripId && <div className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Upload button (mobile: beside trip picker) */}
          <button
            onClick={() => !uploading && fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-brand text-black text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 transition-opacity shrink-0 disabled:opacity-40 sm:hidden"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </button>
          </div>{/* end mobile trip picker + upload row */}

          {/* Upload progress — mobile */}
          {uploading && (
            <div className="sm:hidden flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-slate-100 dark:bg-[#1f1f1f] rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand shrink-0">Uploading…</span>
            </div>
          )}

          {/* Drag hint / progress — desktop */}
          <div className="flex-1 min-w-0 hidden sm:block">
            {uploading ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-[#1f1f1f] rounded-full overflow-hidden">
                  <div className="h-full bg-brand rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand shrink-0">Uploading…</span>
              </div>
            ) : (
              <p className="text-[11px] font-bold text-slate-400 dark:text-[#666] truncate">
                {isDragging ? "Drop files here…" : "Drag & drop or click upload"}
              </p>
            )}
          </div>

          {/* Upload button (desktop: right side) */}
          <button
            onClick={() => !uploading && fileInputRef.current?.click()}
            disabled={uploading}
            className="hidden sm:flex items-center gap-1.5 h-9 px-4 rounded-xl bg-brand text-black text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 transition-opacity shrink-0 disabled:opacity-40"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </button>
        </div>}

        {/* ── Filters: scrollable trip chips + type toggle ── */}
        {allItems.length > 0 && <div className="flex items-center justify-between gap-4">
          {/* Trip chips — horizontally scrollable with fade edges */}
          <div className="relative flex-1 min-w-0">
            {/* Left fade */}
            <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-slate-50 dark:from-[#050505] to-transparent z-10 pointer-events-none" />
            {/* Right fade */}
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-50 dark:from-[#050505] to-transparent z-10 pointer-events-none" />

            <div
              ref={chipScrollRef}
              className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-1 py-1 -mx-1"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <button
                onClick={() => setActiveTripFilter("all")}
                className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all border shrink-0 ${
                  activeTripFilter === "all"
                    ? "bg-brand text-black border-transparent shadow-md shadow-brand/20"
                    : "bg-white dark:bg-[#111111] border-black/[0.06] dark:border-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:border-brand/40 shadow-sm dark:shadow-none"
                }`}
              >
                All · {allItems.length}
              </button>
              {tripsWithMedia.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTripFilter(t.id)}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all border flex items-center gap-1.5 shrink-0 ${
                    activeTripFilter === t.id
                      ? "bg-brand text-black border-transparent shadow-md shadow-brand/20"
                      : "bg-white dark:bg-[#111111] border-black/[0.06] dark:border-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:border-brand/40 shadow-sm dark:shadow-none"
                  }`}
                >
                  {t.name} · {t.media!.length}
                  {activeTripFilter === t.id && (
                    <X className="h-2.5 w-2.5" onClick={(e) => { e.stopPropagation(); setActiveTripFilter("all"); }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Type toggle */}
          <div className="flex items-center gap-1 bg-white dark:bg-[#111111] p-1 rounded-xl border border-black/[0.06] dark:border-[#1f1f1f] shadow-sm dark:shadow-none shrink-0">
            {([
              { key: "all" as MediaFilter, label: "All", icon: <Images className="h-3.5 w-3.5" /> },
              { key: "image" as MediaFilter, label: "Photos", icon: <ImageIcon className="h-3.5 w-3.5" /> },
              { key: "video" as MediaFilter, label: "Videos", icon: <Film className="h-3.5 w-3.5" /> },
            ]).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setMediaFilter(opt.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-[0.15em] transition-all ${
                  mediaFilter === opt.key
                    ? "bg-brand text-black shadow-sm"
                    : "text-slate-500 dark:text-[#888] hover:text-slate-700 dark:hover:text-white"
                }`}
              >
                {opt.icon}
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>}

        {/* ── Gallery grouped by trip ── */}
        {filtered.length > 0 ? (
          activeTripFilter !== "all" ? (
            /* Single trip — flat grid, no header needed */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((item) => {
                const lbIdx = getLightboxIndex(item);
                return (
                  <MediaCard key={`${item.tripId}-${item.id}`} item={item} lbIdx={lbIdx} onZoom={setLightboxIndex} onDelete={handleDelete} />
                );
              })}
            </div>
          ) : (
            /* All trips — grouped with section headers */
            <div className="space-y-10">
              {groupedByTrip.map((group) => (
                <section key={group.tripId}>
                  {/* Trip section header */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="h-10 w-14 rounded-xl overflow-hidden shrink-0">
                      <img src={group.tripImage} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white truncate">{group.tripName}</h3>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-[#666] uppercase tracking-[0.2em] mt-0.5">
                        {group.items.filter(i => i.type === "image").length} photos · {group.items.filter(i => i.type === "video").length} videos
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/trip/${group.tripId}`)}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.2em] text-brand hover:opacity-70 transition-opacity shrink-0"
                    >
                      View Trip
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {group.items.map((item) => {
                      const lbIdx = getLightboxIndex(item);
                      return (
                        <MediaCard key={`${item.tripId}-${item.id}`} item={item} lbIdx={lbIdx} onZoom={setLightboxIndex} onDelete={handleDelete} />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => { if (!uploading && allItems.length === 0) fileInputRef.current?.click(); }}
            className={`flex flex-col items-center justify-center py-20 mx-auto max-w-lg w-full rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
              isDragging
                ? "border-brand bg-brand/5 shadow-lg shadow-brand/10"
                : "border-black/[0.08] dark:border-[#222] bg-white/[0.02] dark:bg-white/[0.02] hover:border-brand/30 hover:bg-brand/[0.02]"
            }`}
          >
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
              isDragging ? "bg-brand/15" : "bg-white/[0.04] dark:bg-white/[0.04] border border-black/[0.06] dark:border-[#1f1f1f]"
            }`}>
              <Upload className={`h-6 w-6 ${isDragging ? "text-brand" : "text-slate-300 dark:text-[#444]"}`} />
            </div>
            <p className={`text-sm font-black uppercase tracking-[0.2em] ${isDragging ? "text-brand" : "text-slate-700 dark:text-[#ccc]"}`}>
              {isDragging ? "Drop files here" : "Drop photos here"}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-[#666] mt-1.5">
              or click to browse
            </p>

            {/* Trip picker + upload button */}
            <div className="flex items-center gap-2 mt-6" onClick={(e) => e.stopPropagation()}>
              <div className="relative" ref={pickerRef}>
                <button
                  onClick={() => setTripPickerOpen((o) => !o)}
                  className="flex items-center gap-2 pl-2 pr-2.5 py-2 rounded-xl bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-[#1f1f1f] hover:border-brand/40 transition-colors text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-white"
                >
                  {selectedTrip ? (
                    <>
                      <div className="h-5 w-6 rounded overflow-hidden shrink-0">
                        <img src={selectedTrip.image} alt="" className="h-full w-full object-cover" />
                      </div>
                      <span className="truncate max-w-[120px]">{selectedTrip.name}</span>
                    </>
                  ) : (
                    <span className="text-slate-400 dark:text-[#666]">Select trip</span>
                  )}
                  <ChevronDown className="h-3 w-3 text-slate-400 dark:text-[#666] shrink-0" />
                </button>
                {tripPickerOpen && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
                    {trips.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setUploadTripId(t.id); setTripPickerOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-[#050505] transition-colors text-left ${t.id === uploadTripId ? "text-brand" : "text-slate-700 dark:text-[#ccc]"}`}
                      >
                        <div className="h-6 w-8 rounded overflow-hidden shrink-0">
                          <img src={t.image} alt="" className="h-full w-full object-cover" />
                        </div>
                        <span className="text-[11px] font-bold truncate">{t.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => !uploading && fileInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-brand text-black text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 transition-opacity"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload
              </button>
            </div>
          </div>
        )}
        </div>
        </>)}
      </div>

      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        index={lightboxIndex}
        slides={lightboxSlides}
      />
    </div>
  );
}

/* ── Media Card Component ── */
function MediaCard({ item, lbIdx, onZoom, onDelete }: {
  item: FilteredItem;
  lbIdx: number;
  onZoom: (idx: number) => void;
  onDelete: (item: FilteredItem) => void;
}) {
  return (
    <div className="group relative rounded-2xl overflow-hidden bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-[#1f1f1f] shadow-sm dark:shadow-none hover:shadow-xl hover:border-brand/30 transition-all duration-300">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-[#0a0a0a]">
        {item.type === "image" ? (
          <img
            src={item.url}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer"
            onClick={() => onZoom(lbIdx)}
          />
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            <video src={item.url} className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="h-11 w-11 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                <Play className="h-4.5 w-4.5 text-white ml-0.5" fill="white" />
              </div>
            </div>
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-[9px] font-black uppercase tracking-[0.15em] text-white/90 flex items-center gap-1">
          {item.type === "image" ? <ImageIcon className="h-2.5 w-2.5" /> : <Film className="h-2.5 w-2.5" />}
          {item.type === "image" ? "Photo" : "Video"}
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none group-hover:pointer-events-auto">
          {item.type === "image" && (
            <button
              onClick={() => onZoom(lbIdx)}
              className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm hover:bg-white/30 flex items-center justify-center text-white transition-colors"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          )}
          <a
            href={item.url}
            download={item.name}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            onClick={() => onDelete(item)}
            className="h-9 w-9 rounded-xl bg-red-500/80 backdrop-blur-sm hover:bg-red-500 flex items-center justify-center text-white transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Footer with metadata */}
      <div className="px-2.5 py-2">
        <p className="text-[10px] font-bold text-slate-900 dark:text-white truncate leading-tight">{item.name}</p>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[9px] font-bold text-brand truncate uppercase tracking-tight">{item.tripName}</p>
          <div className="flex items-center gap-2 shrink-0">
            {item.uploadedBy && <span className="text-[9px] font-bold text-slate-400 dark:text-[#666]">by {item.uploadedBy}</span>}
            {item.uploadedAt && <span className="text-[9px] font-bold text-slate-400 dark:text-[#666]">{formatDate(item.uploadedAt)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
