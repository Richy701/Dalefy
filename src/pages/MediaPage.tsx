import { useState, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { parseTripDate } from "@/lib/dates";
import {
  Upload,
  Trash,
  MagnifyingGlassPlus,
  Play,
  Images,
  CaretDown,
  X,
  Image as ImageIcon,
  FilmStrip,
  Download,
  CheckSquare,
  Square,
  MinusSquare,
  Check,
  ImageSquare,
  UserCircle,
} from "@phosphor-icons/react";
import Lightbox from "yet-another-react-lightbox";
import Video from "yet-another-react-lightbox/plugins/video";
import "yet-another-react-lightbox/styles.css";
import { toast } from "sonner";
import JSZip from "jszip";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { firebaseStorage, firebaseAuth } from "@/services/firebase";
import { useTrips } from "@/context/TripsContext";
import { useAuth } from "@/context/AuthContext";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/PageHeader";
import { BrandIllustration } from "@/components/shared/BrandIllustration";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { TripMedia } from "@/types";
import { ReportedPhotos } from "@/components/media/ReportedPhotos";
import { byDay, dayLabel, sharerKeyOf } from "@/components/media/grouping";

type FilteredItem = TripMedia & { tripId: string; tripName: string; tripImage: string };
type MediaFilter = "all" | "image" | "video";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function videoMime(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  return "video/mp4";
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
  // "all", or one sharer's key (their account, else the name on the photo)
  const [sharerFilter, setSharerFilter] = useState<string>("all");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTripId, setUploadTripId] = useState<string>(() => trips[0]?.id ?? "");
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (sharerFilter !== "all") {
      items = items.filter((m) => sharerKeyOf(m) === sharerFilter);
    }
    return items;
  }, [allItems, activeTripFilter, mediaFilter, sharerFilter]);

  // Everyone who has shared on the trips in view, for the "Shared by" filter
  const sharers = useMemo(() => {
    const inView = activeTripFilter === "all" ? allItems : allItems.filter((m) => m.tripId === activeTripFilter);
    const byKey = new Map<string, { key: string; name: string; count: number }>();
    for (const m of inView) {
      const key = sharerKeyOf(m);
      if (!key) continue;
      const row = byKey.get(key) ?? { key, name: m.uploadedBy || "A traveller", count: 0 };
      row.count++;
      if (m.uploadedBy) row.name = m.uploadedBy;
      byKey.set(key, row);
    }
    return [...byKey.values()].sort((a, b) => b.count - a.count);
  }, [allItems, activeTripFilter]);

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
    return Array.from(map.values()).map((g) => ({ ...g, days: byDay(g.items) }));
  }, [filtered]);

  // Items exactly as they appear on screen (trip, then day), so the lightbox pages in the same order
  const ordered = useMemo(() => groupedByTrip.flatMap((g) => g.days.flatMap((d) => d.items)), [groupedByTrip]);

  // All shown items in display order, so videos open in the lightbox too
  const lightboxSlides = useMemo(() =>
    ordered.map((m) =>
      m.type === "image"
        ? { src: m.url }
        : { type: "video" as const, sources: [{ src: m.url, type: videoMime(m.name) }] }
    ),
    [ordered]
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
    [uploadTripId, trips, updateTrip, user]
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

  const getLightboxIndex = (item: FilteredItem) =>
    ordered.findIndex((m) => m.id === item.id && m.tripId === item.tripId);

  const setCover = (item: FilteredItem) => {
    updateTrip(item.tripId, { image: item.url });
    toast.success(`Cover photo updated for ${item.tripName}`);
  };
  const coverOf = (tripId: string) => trips.find((t) => t.id === tripId)?.image;

  const tripsWithMedia = trips.filter((t) => (t.media?.length ?? 0) > 0);

  // Banner image & context: switches based on active trip filter
  const bannerTrip = activeTripFilter !== "all"
    ? trips.find((t) => t.id === activeTripFilter) ?? null
    : null;

  // True totals for the trip (or library) - independent of the type filter
  const bannerPhotos = bannerTrip
    ? allItems.filter((m) => m.tripId === bannerTrip.id && m.type === "image").length
    : totalPhotos;
  const bannerVideos = bannerTrip
    ? allItems.filter((m) => m.tripId === bannerTrip.id && m.type === "video").length
    : totalVideos;

  const chipScrollRef = useRef<HTMLDivElement>(null);

  const allFilteredSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <PageHeader
        left={
          <h1 className="text-sm font-bold tracking-tight text-foreground">
            Media Library
          </h1>
        }
      />

      <div className="flex-1 overflow-y-auto min-h-0">

        {trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-full gap-5 px-4 py-16">
            <BrandIllustration src="/illustrations/illus-wavy.svg" className="w-40 h-40 object-contain opacity-90" draggable={false} />
            <div className="text-center space-y-1 max-w-xs">
              <p className="text-sm font-bold tracking-tight text-foreground">No media yet</p>
              <p className="text-xs text-muted-foreground">Photos and videos live on trips. Create one to start uploading.</p>
            </div>
            <button
              onClick={() => navigate("/dashboard")}
              className="h-9 px-5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Create a Trip
            </button>
          </div>
        ) : (<>

        {/* Header: what's in view and how much of it */}
        <div className="px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6">
          <div className="rounded-xl border border-border bg-card shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              {bannerTrip?.image && <img src={bannerTrip.image} alt="" className="h-14 w-14 rounded-lg object-cover bg-secondary shrink-0" />}
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight text-foreground truncate">{bannerTrip ? bannerTrip.name : "All photos"}</h2>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {[
                    `${bannerPhotos} ${bannerPhotos === 1 ? "photo" : "photos"}`,
                    bannerVideos ? `${bannerVideos} ${bannerVideos === 1 ? "video" : "videos"}` : "",
                    bannerTrip
                      ? `${parseTripDate(bannerTrip.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} to ${parseTripDate(bannerTrip.end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                      : `across ${tripsWithMedia.length} ${tripsWithMedia.length === 1 ? "trip" : "trips"}`,
                  ].filter(Boolean).join(", ")}
                </p>
              </div>
            </div>
            {/* Uploading lives in the bar below, with its trip picker */}
            {bannerTrip && (
              <button onClick={() => navigate(`/trip/${bannerTrip.id}`)} className="h-9 px-3.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-secondary transition-colors shrink-0">
                Open trip
              </button>
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
              : "border-border bg-card shadow-sm"
          }`}
        >
          {/* Trip picker + upload button row */}
          <div className="flex items-center gap-2.5 sm:contents">
          <div className="shrink-0 flex-1 sm:flex-none">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={selectedTrip ? `Upload target: ${selectedTrip.name}` : "Choose a trip to upload to"}
                className="group flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl bg-background hover:bg-secondary transition-colors text-xs font-medium text-foreground"
              >
                {selectedTrip ? (
                  <>
                    <div className="h-5 w-6 rounded overflow-hidden shrink-0">
                      <img src={selectedTrip.image} alt="" className="h-full w-full object-cover" />
                    </div>
                    <span className="truncate max-w-[180px]">{selectedTrip.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Select trip</span>
                )}
                <CaretDown className="h-3 w-3 text-muted-foreground shrink-0 transition-transform group-data-popup-open:rotate-180" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {trips.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onClick={() => setUploadTripId(t.id)}
                    className={t.id === uploadTripId ? "text-link" : undefined}
                  >
                    <div className="h-6 w-8 rounded overflow-hidden shrink-0">
                      <img src={t.image} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground">{t.media?.length ?? 0} files</p>
                    </div>
                    {t.id === uploadTripId && <div className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Upload button (mobile: beside trip picker) */}
          <button
            onClick={() => !uploading && fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shrink-0 disabled:opacity-40 sm:hidden"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </button>
          </div>{/* end mobile trip picker + upload row */}

          {/* Upload progress - mobile */}
          {uploading && (
            <div className="sm:hidden flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="text-xs font-medium text-link shrink-0">Uploading…</span>
            </div>
          )}

          {/* Drag hint / progress - desktop */}
          <div className="flex-1 min-w-0 hidden sm:block">
            {uploading ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-brand rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-xs font-medium text-link shrink-0">Uploading…</span>
              </div>
            ) : (
              <p className="text-[11px] font-medium text-muted-foreground truncate">
                {isDragging ? "Drop files here…" : "Drag & drop or click upload"}
              </p>
            )}
          </div>

          {/* Upload button (desktop: right side) */}
          <button
            onClick={() => !uploading && fileInputRef.current?.click()}
            disabled={uploading}
            className="hidden sm:flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shrink-0 disabled:opacity-40"
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
                onClick={() => { setActiveTripFilter("all"); setSharerFilter("all"); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors border shrink-0 ${
                  activeTripFilter === "all"
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/25"
                }`}
              >
                All · {allItems.length}
              </button>
              {tripsWithMedia.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setActiveTripFilter(activeTripFilter === t.id ? "all" : t.id); setSharerFilter("all"); }}
                  aria-pressed={activeTripFilter === t.id}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors border flex items-center gap-1.5 shrink-0 ${
                    activeTripFilter === t.id
                      ? "bg-primary text-primary-foreground border-transparent"
                      : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/25"
                  }`}
                >
                  {t.name} · {t.media!.length}
                  {activeTripFilter === t.id && <X className="h-2.5 w-2.5" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Shared by */}
            {sharers.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Filter by who shared"
                  className="group flex items-center gap-1.5 h-[38px] px-3 rounded-xl border border-border bg-card shadow-sm text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="hidden sm:inline max-w-[140px] truncate">
                    {sharerFilter === "all" ? "Shared by anyone" : sharers.find((p) => p.key === sharerFilter)?.name ?? "Shared by"}
                  </span>
                  <CaretDown className="h-3 w-3 text-muted-foreground transition-transform group-data-popup-open:rotate-180" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setSharerFilter("all")}>
                    <span className="flex-1 text-xs font-medium">Anyone</span>
                    {sharerFilter === "all" && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                  {sharers.map((p) => (
                    <DropdownMenuItem key={p.key} onClick={() => setSharerFilter(p.key)}>
                      <span className="flex-1 min-w-0 truncate text-xs font-medium">{p.name}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{p.count}</span>
                      {sharerFilter === p.key && <Check className="h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Type toggle */}
            <div className="flex items-center gap-1 bg-card p-1 rounded-xl border border-border shadow-sm">
              {([
                { key: "all" as MediaFilter, label: "All", icon: <Images className="h-3.5 w-3.5" /> },
                { key: "image" as MediaFilter, label: "Photos", icon: <ImageIcon className="h-3.5 w-3.5" /> },
                { key: "video" as MediaFilter, label: "Videos", icon: <FilmStrip className="h-3.5 w-3.5" /> },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setMediaFilter(opt.key)}
                  aria-label={opt.label}
                  aria-pressed={mediaFilter === opt.key}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    mediaFilter === opt.key
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:hover:text-foreground"
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
              aria-label={selectMode ? "Cancel selection" : "Select files"}
              aria-pressed={selectMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                selectMode
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-card border-border text-muted-foreground hover:hover:text-foreground shadow-sm"
              }`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{selectMode ? "Cancel" : "Select"}</span>
            </button>
          </div>
        </div>}

        {/* ── Reported by travellers, ahead of everything else ── */}
        <ReportedPhotos tripIds={tripsWithMedia.map((t) => t.id)} items={allItems} onRemove={(item) => handleDelete(item as FilteredItem)} />

        {/* ── Selection toolbar ── */}
        {selectMode && filtered.length > 0 && (
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 rounded-xl border border-border bg-secondary/60">
            <button
              onClick={() => allFilteredSelected ? setSelected(new Set()) : selectAllFiltered()}
              className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-foreground transition-colors"
            >
              {allFilteredSelected ? <MinusSquare className="h-4 w-4 text-foreground" /> : <Square className="h-4 w-4" />}
              {allFilteredSelected ? "Deselect All" : "Select All"}
            </button>

            <div className="h-4 w-px bg-border" />

            <span className="text-xs font-medium text-link">
              {selected.size} selected
            </span>

            <div className="flex-1" />

            <button
              onClick={handleBulkDownload}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-card border border-border text-xs font-medium text-foreground hover:border-brand/40 transition-colors disabled:opacity-30"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            <button
              onClick={handleBulkDelete}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-30"
            >
              <Trash className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        )}

        {/* ── Gallery grouped by trip ── */}
        {filtered.length > 0 ? (
          activeTripFilter !== "all" ? (
            /* Single trip - its days, no trip header needed */
            <MediaDays days={groupedByTrip[0]?.days ?? []} renderItem={(item) => <MediaCard key={`${item.tripId}-${item.id}`} item={item} lbIdx={getLightboxIndex(item)} onZoom={setLightboxIndex} onDelete={handleDelete} onSetCover={setCover} isCover={item.type === "image" && coverOf(item.tripId) === item.url} selectMode={selectMode} isSelected={selected.has(item.id)} onToggleSelect={toggleSelect} />} />
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
                          <CheckSquare className="h-5 w-5 text-foreground" weight="fill" />
                        ) : someGroupSelected ? (
                          <MinusSquare className="h-5 w-5 text-foreground" weight="fill" />
                        ) : (
                          <Square className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                    )}
                    <div className="h-10 w-14 rounded-xl overflow-hidden shrink-0">
                      <img src={group.tripImage} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold tracking-tight text-foreground truncate">{group.tripName}</h3>
                      <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
                        {(() => {
                          const photos = group.items.filter(i => i.type === "image").length, videos = group.items.filter(i => i.type === "video").length;
                          return [`${photos} ${photos === 1 ? "photo" : "photos"}`, videos ? `${videos} ${videos === 1 ? "video" : "videos"}` : "", `${group.days.length} ${group.days.length === 1 ? "day" : "days"}`].filter(Boolean).join(", ");
                        })()}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/trip/${group.tripId}`)}
                      className="flex items-center gap-1 text-xs font-medium text-link hover:underline shrink-0"
                    >
                      Open trip
                    </button>
                  </div>

                  {/* The trip's photos, a day at a time */}
                  <MediaDays days={group.days} renderItem={(item) => <MediaCard key={`${item.tripId}-${item.id}`} item={item} lbIdx={getLightboxIndex(item)} onZoom={setLightboxIndex} onDelete={handleDelete} onSetCover={setCover} isCover={item.type === "image" && coverOf(item.tripId) === item.url} selectMode={selectMode} isSelected={selected.has(item.id)} onToggleSelect={toggleSelect} />} />
                </section>
                );
              })}
            </div>
          )
        ) : (
          <div className="mx-auto max-w-xl w-full">
            {/* Single card: drop area on top, trip picker + upload in the footer */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-xl border transition-colors ${
                isDragging
                  ? "border-brand bg-brand/5"
                  : "border-border bg-card shadow-sm"
              }`}
            >
              <div
                onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
                className="flex flex-col items-center text-center px-6 py-12 cursor-pointer"
              >
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center mb-4 transition-colors ${
                  isDragging ? "bg-brand/15" : "bg-secondary"
                }`}>
                  <Upload className={`h-5 w-5 ${isDragging ? "text-link" : "text-muted-foreground"}`} />
                </div>
                <p className={`text-sm font-bold tracking-tight ${isDragging ? "text-link" : "text-foreground"}`}>
                  {isDragging ? "Drop to upload" : "No photos yet"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Drag files here or click to browse. Images and videos up to 25 MB each.
                </p>
              </div>

              <div className="flex items-center gap-2 border-t border-border px-3 py-3">
              <div className="flex-1 min-w-0">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={selectedTrip ? `Upload target: ${selectedTrip.name}` : "Choose a trip to upload to"}
                    className="group w-full flex items-center gap-2.5 pl-2.5 pr-3 py-2 rounded-lg border transition-colors text-xs font-medium text-foreground bg-secondary border-border hover:border-brand/40 data-popup-open:border-brand/50"
                  >
                    {selectedTrip ? (
                      <>
                        <div className="h-6 w-8 rounded-lg overflow-hidden shrink-0">
                          <img src={selectedTrip.image} alt="" className="h-full w-full object-cover" />
                        </div>
                        <span className="truncate flex-1 text-left">{selectedTrip.name}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground flex-1 text-left">Select trip</span>
                    )}
                    <CaretDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform group-data-popup-open:rotate-180" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-(--anchor-width)">
                    {trips.map((t) => (
                      <DropdownMenuItem
                        key={t.id}
                        onClick={() => setUploadTripId(t.id)}
                        className={t.id === uploadTripId ? "text-link" : undefined}
                      >
                        <div className="h-7 w-10 rounded-lg overflow-hidden shrink-0">
                          <img src={t.image} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{t.name}</p>
                          <p className="text-[10px] text-muted-foreground">{t.destination}</p>
                        </div>
                        {t.id === uploadTripId && <div className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <button
                onClick={() => !uploading && fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shrink-0 disabled:opacity-40"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload
              </button>
              </div>
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
        plugins={[Video]}
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

/* ── A trip's photos, grouped under day headers ── */
function MediaDays({ days, renderItem }: { days: Array<{ key: string; items: FilteredItem[] }>; renderItem: (item: FilteredItem) => React.ReactNode }) {
  return (
    <div className="space-y-6">
      {days.map((d) => (
        <div key={d.key || "undated"}>
          <div className="flex items-center gap-3 mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{dayLabel(d.key)}</p>
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground tabular-nums">{d.items.length}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {d.items.map(renderItem)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Media Card Component ── */
function MediaCard({ item, lbIdx, onZoom, onDelete, onSetCover, isCover, selectMode, isSelected, onToggleSelect }: {
  item: FilteredItem;
  lbIdx: number;
  onZoom: (idx: number) => void;
  onDelete: (item: FilteredItem) => void;
  onSetCover?: (item: FilteredItem) => void;
  isCover?: boolean;
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  return (
    <div
      className={`group relative rounded-xl overflow-hidden bg-card border shadow-sm hover:shadow-xl transition-all duration-300 ${
        isSelected
          ? "border-foreground/40 ring-2 ring-foreground/15"
          : "border-border hover:border-foreground/25"
      }`}
      role={selectMode ? "checkbox" : undefined}
      aria-checked={selectMode ? isSelected : undefined}
      aria-label={selectMode ? item.name : undefined}
      tabIndex={selectMode ? 0 : undefined}
      onClick={selectMode ? () => onToggleSelect?.(item.id) : undefined}
      onKeyDown={selectMode ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleSelect?.(item.id); } } : undefined}
    >
      <div className="relative aspect-4/3 overflow-hidden bg-secondary">
        {item.type === "image" ? (
          <img
            src={item.url}
            alt={item.name}
            className={`w-full h-full object-cover transition-transform duration-500 ${selectMode ? "cursor-pointer" : "group-hover:scale-105 cursor-pointer"}`}
            onClick={!selectMode ? () => onZoom(lbIdx) : undefined}
          />
        ) : (
          <div
            className={`relative w-full h-full flex items-center justify-center ${selectMode ? "" : "cursor-pointer"}`}
            onClick={!selectMode ? () => onZoom(lbIdx) : undefined}
          >
            <video src={item.url} preload="metadata" className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
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
              isSelected ? "bg-primary" : "bg-black/40 backdrop-blur-sm border border-white/30"
            }`}>
              {isSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" weight="bold" />}
            </div>
          </div>
        )}

        {/* The trip's current cover */}
        {isCover && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/55 backdrop-blur-sm text-[11px] font-medium text-white flex items-center gap-1">
            <ImageSquare className="h-3 w-3" /> Cover
          </div>
        )}

        {/* Type badge - videos only; photos are self-evident */}
        {item.type === "video" && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-[11px] font-medium text-white/90 flex items-center gap-1">
            <FilmStrip className="h-2.5 w-2.5" />
            Video
          </div>
        )}

        {/* Hover overlay - hidden in select mode */}
        {!selectMode && (
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none group-hover:pointer-events-auto">
          <button
            onClick={() => onZoom(lbIdx)}
            aria-label={item.type === "image" ? `View ${item.name}` : `Play ${item.name}`}
            className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          >
            {item.type === "image" ? <MagnifyingGlassPlus className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={() => downloadFile(item.url, item.name)}
            aria-label={`Download ${item.name}`}
            className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          >
            <Download className="h-4 w-4" />
          </button>
          {item.type === "image" && onSetCover && !isCover && (
            <button
              onClick={() => onSetCover(item)}
              aria-label={`Use ${item.name} as the trip cover`}
              title="Use as cover"
              className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm hover:bg-white/30 flex items-center justify-center text-white transition-colors"
            >
              <ImageSquare className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(item)}
            aria-label={`Delete ${item.name}`}
            className="h-9 w-9 rounded-xl bg-red-500/80 backdrop-blur-sm hover:bg-red-500 flex items-center justify-center text-white transition-colors"
          >
            <Trash className="h-4 w-4" />
          </button>
        </div>
        )}
      </div>

      {/* Footer with metadata */}
      <div className="px-2.5 py-2">
        <p className="text-[10px] font-bold text-foreground truncate leading-tight">{item.name}</p>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[10px] font-medium text-muted-foreground truncate">{item.tripName}</p>
          <div className="flex items-center gap-2 shrink-0">
            {item.uploadedBy && <span className="text-[9px] font-bold text-muted-foreground">by {item.uploadedBy}</span>}
            {item.uploadedAt && <span className="text-[9px] font-bold text-muted-foreground">{formatDate(item.uploadedAt)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
