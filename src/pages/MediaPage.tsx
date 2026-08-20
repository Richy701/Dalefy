import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { parseTripDate } from "@/lib/dates";
import {
  Upload,
  Trash,
  MagnifyingGlassPlus,
  Play,
  Images,
  CaretDown,
  CaretLeft,
  CaretRight,
  X,
  Image as ImageIcon,
  FilmStrip,
  ArrowUpRight,
  Download,
  CheckSquare,
  Square,
  MinusSquare,
  Check,
} from "@phosphor-icons/react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { toast } from "sonner";
import JSZip from "jszip";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { firebaseStorage, firebaseAuth } from "@/services/firebase";
import { useTrips } from "@/context/TripsContext";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { BrandIllustration } from "@/components/shared/BrandIllustration";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { TripMedia } from "@/types";

type FilteredItem = TripMedia & { tripId: string; tripName: string; tripImage: string };
type MediaFilter = "all" | "image" | "video";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

async function downloadFile(url: string, name: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    toast.error(`Failed to download ${name}`);
  }
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
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
      // Storage rules cap trip media at 25 MB per file; skip oversize files instead of rejecting the batch
      const MAX = 25 * 1024 * 1024;
      const oversize = valid.filter((f) => f.size > MAX);
      const toUpload = valid.filter((f) => f.size <= MAX);
      if (oversize.length) toast.error(`${oversize.length} file${oversize.length > 1 ? "s are" : " is"} over 25 MB and will be skipped`);
      if (!toUpload.length) return;

      const trip = trips.find((t) => t.id === uploadTripId);
      if (!trip) { toast.error("Select a trip first"); return; }

      setUploading(true);
      setUploadProgress(0);

      // Real progress: sum of bytes transferred across all files
      const totalBytes = toUpload.reduce((s, f) => s + f.size, 0);
      const transferred = new Array<number>(toUpload.length).fill(0);
      const reportProgress = () => {
        const done = transferred.reduce((a, b) => a + b, 0);
        setUploadProgress(totalBytes ? Math.round((done / totalBytes) * 100) : 100);
      };

      const uid = firebaseAuth().currentUser?.uid ?? "anon";
      const results = await Promise.allSettled(
        toUpload.map((file, i) => new Promise<TripMedia>((resolve, reject) => {
          const id = `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const ext = file.name.split(".").pop() || "jpg";
          const storageRef = ref(firebaseStorage(), `trips/${uploadTripId}/media/${uid}/${id}.${ext}`);
          const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
          task.on(
            "state_changed",
            (snap) => { transferred[i] = snap.bytesTransferred; reportProgress(); },
            reject,
            async () => {
              try {
                const url = await getDownloadURL(storageRef);
                resolve({
                  id,
                  type: (file.type.startsWith("video/") ? "video" : "image") as "image" | "video",
                  name: file.name,
                  url,
                  size: file.size,
                  uploadedAt: new Date().toISOString(),
                  uploadedBy: user?.name || undefined,
                });
              } catch (e) { reject(e); }
            },
          );
        })),
      );

      const uploaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const failed = results.length - uploaded.length;

      if (uploaded.length) {
        updateTrip(uploadTripId, { media: [...(trip.media ?? []), ...uploaded] });
      }
      setUploading(false);
      setUploadProgress(0);

      if (failed && uploaded.length) toast.warning(`${uploaded.length} uploaded, ${failed} failed. Check your connection and retry the rest.`);
      else if (failed) toast.error(failed === 1 ? "Upload failed. Check your connection and try again." : `${failed} uploads failed. Check your connection and try again.`);
      else toast.success(`${uploaded.length} file${uploaded.length > 1 ? "s" : ""} uploaded to ${trip.name}`);
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

  const [pendingDelete, setPendingDelete] = useState<{ items: FilteredItem[] } | null>(null);

  /** Best-effort removal of the stored object; ignore failures (e.g. uploaded by someone else). */
  const removeFromStorage = async (url: string) => {
    try { await deleteObject(ref(firebaseStorage(), url)); } catch { /* not ours or already gone */ }
  };

  const deleteItems = async (items: FilteredItem[]) => {
    const byTrip = new Map<string, Set<string>>();
    for (const item of items) {
      const set = byTrip.get(item.tripId) ?? new Set();
      set.add(item.id);
      byTrip.set(item.tripId, set);
    }
    for (const [tripId, ids] of byTrip) {
      const trip = trips.find((t) => t.id === tripId);
      if (!trip) continue;
      updateTrip(tripId, { media: (trip.media ?? []).filter((m) => !ids.has(m.id)) });
    }
    await Promise.all(items.map((i) => removeFromStorage(i.url)));
    toast.success(items.length === 1 ? "File deleted" : `Deleted ${items.length} files`);
  };

  const handleDelete = (item: FilteredItem) => setPendingDelete({ items: [item] });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(filtered.map((m) => m.id)));
  };

  const selectTrip = (tripId: string) => {
    const ids = filtered.filter((m) => m.tripId === tripId).map((m) => m.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) { ids.forEach((id) => next.delete(id)); } else { ids.forEach((id) => next.add(id)); }
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    setPendingDelete({ items: filtered.filter((m) => selected.has(m.id)) });
  };

  const handleBulkDownload = async () => {
    if (selected.size === 0) return;
    const items = filtered.filter((m) => selected.has(m.id));

    if (items.length === 1) {
      await downloadFile(items[0].url, items[0].name);
      return;
    }

    const toastId = toast.loading(`Preparing zip - 0/${items.length} files...`);
    const zip = new JSZip();
    const nameCounts = new Map<string, number>();
    let fetched = 0;

    const withTimeout = <T,>(p: Promise<T>, ms: number) => new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
    const results = await Promise.allSettled(
      items.map(async (item) => {
        const res = await withTimeout(fetch(item.url), 60_000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await withTimeout(res.blob(), 120_000);
        fetched++;
        toast.loading(`Preparing zip - ${fetched}/${items.length} files...`, { id: toastId });
        return { name: item.name, blob };
      })
    );

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      let name = r.value.name;
      const count = nameCounts.get(name) ?? 0;
      if (count > 0) {
        const dot = name.lastIndexOf(".");
        name = dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`;
      }
      nameCounts.set(r.value.name, count + 1);
      zip.file(name, r.value.blob);
    }

    const added = results.filter((r) => r.status === "fulfilled").length;
    if (added === 0) {
      toast.error("Failed to download files", { id: toastId });
      return;
    }

    let zipBlob: Blob;
    try {
      zipBlob = await zip.generateAsync({ type: "blob" });
    } catch {
      toast.error("Couldn't build the zip file. Try fewer files at once.", { id: toastId });
      return;
    }
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    const tripNames = [...new Set(items.map((i) => i.tripName))];
    const slug = tripNames.length === 1
      ? tripNames[0].replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "")
      : tripNames.slice(0, 3).map((n) => n.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "")).join("_");
    a.download = `${slug}-media.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const failed = items.length - added;
    toast.success(
      failed > 0
        ? `Downloaded ${added} files as zip (${failed} failed)`
        : `Downloaded ${added} files as zip`,
      { id: toastId }
    );
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

  // For "all" mode - rotating carousel through all trips with images
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

  // Click-outside to close trip picker
  useEffect(() => {
    if (!tripPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setTripPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTripPickerOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", onKey); };
  }, [tripPickerOpen]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-background">
      <PageHeader
        left={
          <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
            Media Library
          </h1>
        }
      />

      <div className="flex-1 overflow-y-auto min-h-0">

        {trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-full gap-3 px-4 py-16">
            <BrandIllustration src="/illustrations/illus-wavy.svg" className="w-72 h-72 object-contain" draggable={false} />
            <div className="text-center space-y-1.5">
              <p className="text-base font-bold tracking-tight text-slate-800 dark:text-white">No media yet</p>
              <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">Create a trip first, then upload your photos and videos</p>
            </div>
            <button
              onClick={() => navigate("/dashboard")}
              className="h-10 px-6 rounded-lg bg-brand text-[#050505] text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
            >
              Create a Trip
            </button>
          </div>
        ) : (<>

        {/* Hero Banner - rotating carousel (All) or trip-specific cover */}
        <div className="px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6">
          <div className="relative overflow-hidden rounded-xl min-h-[220px] sm:min-h-[260px] bg-[#0e0e0e]">
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
            <div className="absolute inset-0 bg-linear-to-r from-black/95 via-black/70 to-black/30" />
            <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />

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
                    {parseTripDate(bannerTrip.start).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – {parseTripDate(bannerTrip.end).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
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
                    className="hidden sm:flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-white/80 bg-white/10 backdrop-blur-sm border border-white/15 rounded-lg px-4 py-2 hover:bg-white/20 transition-colors"
                  >
                    Open Trip
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                ) : currentCarouselTrip ? (
                  <div className="hidden sm:flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-white/70 bg-white/10 backdrop-blur-sm border border-white/15 rounded-lg px-3 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                    {currentCarouselTrip.name}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Carousel controls - bottom center of banner */}
            {!bannerTrip && carouselTrips.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
                <button
                  onClick={() => setCarouselIdx((i) => (i - 1 + carouselTrips.length) % carouselTrips.length)}
                  className="h-7 w-7 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:bg-black/60 transition-colors"
                >
                  <CaretLeft className="h-3.5 w-3.5" />
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
                  <CaretRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* Hidden file input - always rendered so empty-state button works */}
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
          className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 rounded-xl border transition-all ${
            isDragging
              ? "border-brand bg-brand/5 shadow-lg shadow-brand/10"
              : "border-black/6 dark:border-border bg-white dark:bg-card shadow-sm dark:shadow-none"
          }`}
        >
          {/* Trip picker + upload button row */}
          <div className="flex items-center gap-2.5 sm:contents">
          <div className="relative shrink-0 flex-1 sm:flex-none" ref={pickerRef}>
            <button
              onClick={() => setTripPickerOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={tripPickerOpen}
              aria-label={selectedTrip ? `Upload target: ${selectedTrip.name}` : "Choose a trip to upload to"}
              className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-background hover:bg-slate-100 dark:hover:bg-secondary transition-colors text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-white"
            >
              {selectedTrip ? (
                <>
                  <div className="h-5 w-6 rounded overflow-hidden shrink-0">
                    <img src={selectedTrip.image} alt="" className="h-full w-full object-cover" />
                  </div>
                  <span className="truncate max-w-[180px]">{selectedTrip.name}</span>
                </>
              ) : (
                <span className="text-slate-500 dark:text-muted-foreground">Select trip</span>
              )}
              <CaretDown className={`h-3 w-3 text-slate-500 dark:text-muted-foreground shrink-0 transition-transform ${tripPickerOpen ? "rotate-180" : ""}`} />
            </button>

            {tripPickerOpen && (
              <div role="listbox" aria-label="Trips" className="absolute top-full left-0 mt-1.5 w-64 bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
                {trips.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setUploadTripId(t.id); setTripPickerOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-background transition-colors text-left ${t.id === uploadTripId ? "text-brand" : "text-slate-700 dark:text-foreground/80"}`}
                  >
                    <div className="h-6 w-8 rounded overflow-hidden shrink-0">
                      <img src={t.image} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-tight truncate">{t.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-muted-foreground">{t.media?.length ?? 0} files</p>
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

          {/* Upload progress - mobile */}
          {uploading && (
            <div className="sm:hidden flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-slate-100 dark:bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand shrink-0">Uploading…</span>
            </div>
          )}

          {/* Drag hint / progress - desktop */}
          <div className="flex-1 min-w-0 hidden sm:block">
            {uploading ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-brand rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand shrink-0">Uploading…</span>
              </div>
            ) : (
              <p className="text-[11px] font-bold text-slate-500 dark:text-muted-foreground truncate">
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
          {/* Trip chips - horizontally scrollable with fade edges */}
          <div className="relative flex-1 min-w-0">

            <div
              ref={chipScrollRef}
              className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-1 py-1 -mx-1"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <button
                onClick={() => setActiveTripFilter("all")}
                className={`px-4 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors border shrink-0 ${
                  activeTripFilter === "all"
                    ? "bg-brand text-black border-transparent"
                    : "bg-white dark:bg-card border-black/6 dark:border-border text-slate-500 dark:text-muted-foreground hover:border-brand/40"
                }`}
              >
                All · {allItems.length}
              </button>
              {tripsWithMedia.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTripFilter(t.id)}
                  className={`px-4 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors border flex items-center gap-1.5 shrink-0 ${
                    activeTripFilter === t.id
                      ? "bg-brand text-black border-transparent"
                      : "bg-white dark:bg-card border-black/6 dark:border-border text-slate-500 dark:text-muted-foreground hover:border-brand/40"
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

          <div className="flex items-center gap-2 shrink-0">
            {/* Type toggle */}
            <div className="flex items-center gap-1 bg-white dark:bg-card p-1 rounded-xl border border-black/6 dark:border-border shadow-sm dark:shadow-none">
              {([
                { key: "all" as MediaFilter, label: "All", icon: <Images className="h-3.5 w-3.5" /> },
                { key: "image" as MediaFilter, label: "Photos", icon: <ImageIcon className="h-3.5 w-3.5" /> },
                { key: "video" as MediaFilter, label: "Videos", icon: <FilmStrip className="h-3.5 w-3.5" /> },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setMediaFilter(opt.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-[0.15em] transition-all ${
                    mediaFilter === opt.key
                      ? "bg-brand text-black shadow-sm"
                      : "text-slate-500 dark:text-muted-foreground hover:text-slate-700 dark:hover:text-white"
                  }`}
                >
                  {opt.icon}
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>

            {/* Select toggle */}
            <button
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all border ${
                selectMode
                  ? "bg-brand text-black border-transparent"
                  : "bg-white dark:bg-card border-black/6 dark:border-border text-slate-500 dark:text-muted-foreground hover:text-slate-700 dark:hover:text-white shadow-sm dark:shadow-none"
              }`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{selectMode ? "Cancel" : "Select"}</span>
            </button>
          </div>
        </div>}

        {/* ── Selection toolbar ── */}
        {selectMode && filtered.length > 0 && (
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 rounded-xl border border-brand/20 bg-brand/5 dark:bg-brand/8">
            <button
              onClick={() => selected.size === filtered.length ? setSelected(new Set()) : selectAllFiltered()}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-700 dark:text-white hover:text-brand transition-colors"
            >
              {selected.size === filtered.length ? <MinusSquare className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4" />}
              {selected.size === filtered.length ? "Deselect All" : "Select All"}
            </button>

            <div className="h-4 w-px bg-slate-200 dark:bg-[#2a2a2a]" />

            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-brand">
              {selected.size} selected
            </span>

            <div className="flex-1" />

            <button
              onClick={handleBulkDownload}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white dark:bg-card border border-black/6 dark:border-border text-[10px] font-black uppercase tracking-[0.15em] text-slate-700 dark:text-white hover:border-brand/40 transition-colors disabled:opacity-30"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            <button
              onClick={handleBulkDelete}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-black uppercase tracking-[0.15em] text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-30"
            >
              <Trash className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        )}

        {/* ── Gallery grouped by trip ── */}
        {filtered.length > 0 ? (
          activeTripFilter !== "all" ? (
            /* Single trip - flat grid, no header needed */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((item) => {
                const lbIdx = getLightboxIndex(item);
                return (
                  <MediaCard key={`${item.tripId}-${item.id}`} item={item} lbIdx={lbIdx} onZoom={setLightboxIndex} onDelete={handleDelete} selectMode={selectMode} isSelected={selected.has(item.id)} onToggleSelect={toggleSelect} />
                );
              })}
            </div>
          ) : (
            /* All trips - grouped with section headers */
            <div className="space-y-10">
              {groupedByTrip.map((group) => {
                const groupIds = group.items.map((i) => i.id);
                const allGroupSelected = groupIds.length > 0 && groupIds.every((id) => selected.has(id));
                const someGroupSelected = groupIds.some((id) => selected.has(id));
                return (
                <section key={group.tripId}>
                  {/* Trip section header */}
                  <div className="flex items-center gap-4 mb-4">
                    {selectMode && (
                      <button onClick={() => selectTrip(group.tripId)} className="shrink-0">
                        {allGroupSelected ? (
                          <CheckSquare className="h-5 w-5 text-brand" weight="fill" />
                        ) : someGroupSelected ? (
                          <MinusSquare className="h-5 w-5 text-brand" weight="fill" />
                        ) : (
                          <Square className="h-5 w-5 text-slate-500 dark:text-muted-foreground" />
                        )}
                      </button>
                    )}
                    <div className="h-10 w-14 rounded-xl overflow-hidden shrink-0">
                      <img src={group.tripImage} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white truncate">{group.tripName}</h3>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-muted-foreground uppercase tracking-[0.2em] mt-0.5">
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
                        <MediaCard key={`${item.tripId}-${item.id}`} item={item} lbIdx={lbIdx} onZoom={setLightboxIndex} onDelete={handleDelete} selectMode={selectMode} isSelected={selected.has(item.id)} onToggleSelect={toggleSelect} />
                      );
                    })}
                  </div>
                </section>
                );
              })}
            </div>
          )
        ) : (
          <div className="mx-auto max-w-2xl w-full space-y-3">
            {/* Drop zone - clickable area for drag & drop / browse */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
              className={`flex flex-col items-center justify-center py-24 sm:py-32 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                isDragging
                  ? "border-brand bg-brand/5 shadow-lg shadow-brand/10"
                  : "border-black/8 dark:border-border bg-white/50 dark:bg-white/2 hover:border-brand/30 hover:bg-brand/2"
              }`}
            >
              <div className={`h-16 w-16 rounded-xl flex items-center justify-center mb-5 transition-colors ${
                isDragging ? "bg-brand/15" : "bg-slate-100/80 dark:bg-white/4 border border-black/6 dark:border-border"
              }`}>
                <Upload className={`h-7 w-7 ${isDragging ? "text-brand" : "text-slate-400 dark:text-muted-foreground"}`} />
              </div>
              <p className={`text-base font-bold tracking-tight ${isDragging ? "text-brand" : "text-slate-700 dark:text-foreground/80"}`}>
                {isDragging ? "Drop files here" : "Drop photos here"}
              </p>
              <p className="text-xs text-slate-500 dark:text-muted-foreground mt-2">
                or click to browse · images &amp; videos up to 25 MB each
              </p>
            </div>

            {/* Trip picker + upload button - separate row below drop zone */}
            <div className="flex items-center gap-2.5">
              <div className="relative flex-1 min-w-0" ref={pickerRef}>
                <button
                  onClick={() => setTripPickerOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={tripPickerOpen}
              aria-label={selectedTrip ? `Upload target: ${selectedTrip.name}` : "Choose a trip to upload to"}
                  className={`w-full flex items-center gap-2.5 pl-2.5 pr-3 py-2.5 rounded-xl border transition-colors text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-white ${
                    tripPickerOpen
                      ? "bg-white dark:bg-card border-brand/50 shadow-md"
                      : "bg-white dark:bg-card border-black/6 dark:border-border hover:border-brand/40 shadow-sm dark:shadow-none"
                  }`}
                >
                  {selectedTrip ? (
                    <>
                      <div className="h-6 w-8 rounded-lg overflow-hidden shrink-0">
                        <img src={selectedTrip.image} alt="" className="h-full w-full object-cover" />
                      </div>
                      <span className="truncate flex-1 text-left">{selectedTrip.name}</span>
                    </>
                  ) : (
                    <span className="text-slate-500 dark:text-muted-foreground flex-1 text-left">Select trip</span>
                  )}
                  <CaretDown className={`h-3.5 w-3.5 text-slate-500 dark:text-muted-foreground shrink-0 transition-transform ${tripPickerOpen ? "rotate-180" : ""}`} />
                </button>
                {tripPickerOpen && (
                  <div role="listbox" aria-label="Trips" className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
                    {trips.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setUploadTripId(t.id); setTripPickerOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-background transition-colors text-left ${t.id === uploadTripId ? "text-brand" : "text-slate-700 dark:text-foreground/80"}`}
                      >
                        <div className="h-7 w-10 rounded-lg overflow-hidden shrink-0">
                          <img src={t.image} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-tight truncate">{t.name}</p>
                          <p className="text-[10px] text-slate-500 dark:text-muted-foreground">{t.destination}</p>
                        </div>
                        {t.id === uploadTripId && <div className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => !uploading && fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 h-11 px-6 rounded-xl bg-brand text-black text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 transition-opacity shrink-0 disabled:opacity-40"
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

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={pendingDelete && pendingDelete.items.length > 1 ? `Delete ${pendingDelete.items.length} files?` : "Delete this file?"}
        description={pendingDelete && pendingDelete.items.length > 1
          ? "They'll be removed from their trips and from storage. This can't be undone."
          : `"${pendingDelete?.items[0]?.name ?? ""}" will be removed from the trip and from storage. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteItems(pendingDelete.items);
          if (pendingDelete.items.length > 1) exitSelectMode();
        }}
      />
    </div>
  );
}

/* ── Media Card Component ── */
function MediaCard({ item, lbIdx, onZoom, onDelete, selectMode, isSelected, onToggleSelect }: {
  item: FilteredItem;
  lbIdx: number;
  onZoom: (idx: number) => void;
  onDelete: (item: FilteredItem) => void;
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  return (
    <div
      className={`group relative rounded-xl overflow-hidden bg-white dark:bg-card border shadow-sm dark:shadow-none hover:shadow-xl transition-all duration-300 ${
        isSelected
          ? "border-brand ring-2 ring-brand/30"
          : "border-black/6 dark:border-border hover:border-brand/30"
      }`}
      onClick={selectMode ? () => onToggleSelect?.(item.id) : undefined}
    >
      <div className="relative aspect-4/3 overflow-hidden bg-slate-100 dark:bg-background">
        {item.type === "image" ? (
          <img
            src={item.url}
            alt={item.name}
            className={`w-full h-full object-cover transition-transform duration-500 ${selectMode ? "cursor-pointer" : "group-hover:scale-105 cursor-pointer"}`}
            onClick={!selectMode ? () => onZoom(lbIdx) : undefined}
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

        {/* Selection checkbox */}
        {selectMode && (
          <div className="absolute top-2 right-2 z-10">
            <div className={`h-6 w-6 rounded-lg flex items-center justify-center transition-colors ${
              isSelected ? "bg-brand" : "bg-black/40 backdrop-blur-sm border border-white/30"
            }`}>
              {isSelected && <Check className="h-3.5 w-3.5 text-black" weight="bold" />}
            </div>
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-[9px] font-black uppercase tracking-[0.15em] text-white/90 flex items-center gap-1">
          {item.type === "image" ? <ImageIcon className="h-2.5 w-2.5" /> : <FilmStrip className="h-2.5 w-2.5" />}
          {item.type === "image" ? "Photo" : "Video"}
        </div>

        {/* Hover overlay - hidden in select mode */}
        {!selectMode && (
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none group-hover:pointer-events-auto">
          {item.type === "image" && (
            <button
              onClick={() => onZoom(lbIdx)}
              className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm hover:bg-white/30 flex items-center justify-center text-white transition-colors"
            >
              <MagnifyingGlassPlus className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => downloadFile(item.url, item.name)}
            className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(item)}
            className="h-9 w-9 rounded-xl bg-red-500/80 backdrop-blur-sm hover:bg-red-500 flex items-center justify-center text-white transition-colors"
          >
            <Trash className="h-4 w-4" />
          </button>
        </div>
        )}
      </div>

      {/* Footer with metadata */}
      <div className="px-2.5 py-2">
        <p className="text-[10px] font-bold text-slate-900 dark:text-white truncate leading-tight">{item.name}</p>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[9px] font-bold text-brand truncate uppercase tracking-tight">{item.tripName}</p>
          <div className="flex items-center gap-2 shrink-0">
            {item.uploadedBy && <span className="text-[9px] font-bold text-slate-500 dark:text-muted-foreground">by {item.uploadedBy}</span>}
            {item.uploadedAt && <span className="text-[9px] font-bold text-slate-500 dark:text-muted-foreground">{formatDate(item.uploadedAt)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
