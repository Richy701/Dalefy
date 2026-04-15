import { useState, useRef, useCallback, useMemo } from "react";
import {
  Upload,
  Trash2,
  ZoomIn,
  Play,
  ImageIcon,
  VideoIcon,
  Images,
  ChevronDown,
  X,
} from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { toast } from "sonner";
import { useTrips } from "@/context/TripsContext";
import type { TripMedia } from "@/types";

type FilteredItem = TripMedia & { tripId: string; tripName: string; tripImage: string };

export function MediaPage() {
  const { trips, updateTrip } = useTrips();

  const [activeTripFilter, setActiveTripFilter] = useState<string>("all");
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

  const filtered = useMemo(() =>
    activeTripFilter === "all"
      ? allItems
      : allItems.filter((m) => m.tripId === activeTripFilter),
    [allItems, activeTripFilter]
  );

  const lightboxSlides = useMemo(() =>
    filtered
      .filter((m) => m.type === "image")
      .map((m) => ({ src: m.url, title: `${m.name} · ${m.tripName}` })),
    [filtered]
  );

  const totalPhotos = allItems.filter((m) => m.type === "image").length;
  const totalVideos = allItems.filter((m) => m.type === "video").length;
  const totalSize = allItems.reduce((s, m) => s + m.size, 0);

  const fmtSize = (b: number) =>
    b < 1_048_576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1_048_576).toFixed(1)} MB`;

  const selectedTrip = trips.find((t) => t.id === uploadTripId);

  const processFiles = useCallback(
    (files: File[]) => {
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

      setUploading(true);
      setUploadProgress(0);

      const interval = setInterval(() => {
        setUploadProgress((p) => {
          if (p >= 90) { clearInterval(interval); return p; }
          return p + Math.random() * 18;
        });
      }, 80);

      const readers = valid.map(
        (file) =>
          new Promise<TripMedia>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) =>
              resolve({
                id: `media-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                type: file.type.startsWith("video/") ? "video" : "image",
                name: file.name,
                url: ev.target?.result as string,
                size: file.size,
                uploadedAt: new Date().toISOString(),
              });
            reader.readAsDataURL(file);
          })
      );

      Promise.all(readers).then((newMedia) => {
        clearInterval(interval);
        setUploadProgress(100);
        const trip = trips.find((t) => t.id === uploadTripId);
        if (!trip) return;
        setTimeout(() => {
          updateTrip(uploadTripId, { media: [...(trip.media ?? []), ...newMedia] });
          setUploading(false);
          setUploadProgress(0);
          toast.success(`${newMedia.length} file${newMedia.length > 1 ? "s" : ""} added to ${trip.name}`);
        }, 350);
      });
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

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#050505] overflow-y-auto">
      {/* Header */}
      <div className="px-6 lg:px-8 pt-6 pb-5 border-b border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black italic uppercase tracking-[0.35em] text-[#0bd2b5] mb-1">
              DAF Adventures
            </p>
            <h1 className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white leading-none">
              Media Library
            </h1>
            <p className="text-xs text-slate-400 dark:text-[#888888] mt-2 uppercase tracking-wider font-bold">
              All trip photos and videos in one place
            </p>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex flex-col items-center bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-xl px-4 py-2.5">
              <span className="text-xl font-black italic text-slate-900 dark:text-white leading-none">{totalPhotos}</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#888888] mt-0.5">Photos</span>
            </div>
            <div className="flex flex-col items-center bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-xl px-4 py-2.5">
              <span className="text-xl font-black italic text-pink-500 leading-none">{totalVideos}</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#888888] mt-0.5">Videos</span>
            </div>
            <div className="flex flex-col items-center bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-xl px-4 py-2.5">
              <span className="text-xl font-black italic text-slate-900 dark:text-white leading-none">{fmtSize(totalSize)}</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#888888] mt-0.5">Storage</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 lg:px-8 py-6 space-y-6">
        {/* Upload zone */}
        <div className="space-y-3">
          {/* Trip selector */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-black italic uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888] shrink-0">
              Upload to:
            </span>
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setTripPickerOpen((o) => !o)}
                className="flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] hover:border-[#0bd2b5]/50 transition-colors text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-white shadow-sm"
              >
                {selectedTrip ? (
                  <>
                    <div className="h-5 w-6 rounded overflow-hidden shrink-0">
                      <img src={selectedTrip.image} alt="" className="h-full w-full object-cover" />
                    </div>
                    <span className="truncate max-w-[160px]">{selectedTrip.name}</span>
                  </>
                ) : (
                  <span className="text-slate-400">Select a trip</span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1 shrink-0" />
              </button>

              {tripPickerOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-64 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
                  {trips.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setUploadTripId(t.id); setTripPickerOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-[#050505] transition-colors text-left ${t.id === uploadTripId ? "text-[#0bd2b5]" : "text-slate-700 dark:text-[#ccc]"}`}
                    >
                      <div className="h-6 w-8 rounded overflow-hidden shrink-0">
                        <img src={t.image} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-tight truncate">{t.name}</p>
                        <p className="text-[10px] text-slate-400 dark:text-[#666]">{t.media?.length ?? 0} files</p>
                      </div>
                      {t.id === uploadTripId && <div className="h-1.5 w-1.5 rounded-full bg-[#0bd2b5] shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-[2rem] transition-all cursor-pointer flex items-center justify-center gap-6 py-10 ${
              isDragging
                ? "border-[#0bd2b5] bg-[#0bd2b5]/5"
                : "border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] hover:border-[#0bd2b5]/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => { processFiles(Array.from(e.target.files || [])); e.target.value = ""; }}
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 rounded-full border-2 border-[#0bd2b5]/20 flex items-center justify-center">
                  <div className="h-6 w-6 rounded-full border-2 border-[#0bd2b5] border-t-transparent animate-spin" />
                </div>
                <div className="w-40 h-1 bg-slate-100 dark:bg-[#1f1f1f] rounded-full overflow-hidden">
                  <div className="h-full bg-[#0bd2b5] rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-[10px] font-black italic uppercase tracking-[0.3em] text-[#0bd2b5]">UPLOADING…</p>
              </div>
            ) : (
              <>
                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-all shrink-0 ${isDragging ? "bg-[#0bd2b5] text-black scale-110" : "bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] text-slate-400 dark:text-[#888888]"}`}>
                  <Upload className="h-6 w-6" />
                </div>
                <div className="pointer-events-none">
                  <p className="font-black italic text-sm uppercase tracking-[0.15em] text-slate-900 dark:text-white">
                    {isDragging ? "DROP FILES HERE" : "DRAG & DROP PHOTOS · VIDEOS"}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-[#888888] mt-1">
                    {selectedTrip ? `Will be added to "${selectedTrip.name}"` : "Select a trip above, then drop files"}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Trip filter chips */}
        {tripsWithMedia.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTripFilter("all")}
              className={`px-4 py-1.5 rounded-full text-[10px] font-black italic uppercase tracking-[0.2em] transition-all border ${
                activeTripFilter === "all"
                  ? "bg-[#0bd2b5] text-black border-transparent shadow-md shadow-[#0bd2b5]/20"
                  : "bg-white dark:bg-[#111111] border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:border-[#0bd2b5]/40"
              }`}
            >
              All Trips · {allItems.length}
            </button>
            {tripsWithMedia.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTripFilter(t.id)}
                className={`px-4 py-1.5 rounded-full text-[10px] font-black italic uppercase tracking-[0.2em] transition-all border flex items-center gap-1.5 ${
                  activeTripFilter === t.id
                    ? "bg-[#0bd2b5] text-black border-transparent shadow-md shadow-[#0bd2b5]/20"
                    : "bg-white dark:bg-[#111111] border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:border-[#0bd2b5]/40"
                }`}
              >
                {t.name} · {t.media!.length}
                {activeTripFilter === t.id && (
                  <X className="h-2.5 w-2.5" onClick={(e) => { e.stopPropagation(); setActiveTripFilter("all"); }} />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((item) => {
              const lbIdx = getLightboxIndex(item);
              return (
                <div
                  key={`${item.tripId}-${item.id}`}
                  className="group relative rounded-2xl overflow-hidden bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] shadow-sm hover:shadow-xl hover:border-[#0bd2b5]/30 transition-all duration-300"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-[#0a0a0a]">
                    {item.type === "image" ? (
                      <img
                        src={item.url}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer"
                        onClick={() => setLightboxIndex(lbIdx)}
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

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none group-hover:pointer-events-auto">
                      {item.type === "image" && (
                        <button
                          onClick={() => setLightboxIndex(lbIdx)}
                          className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                        >
                          <ZoomIn className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item)}
                        className="h-9 w-9 rounded-xl bg-red-500/80 backdrop-blur-sm hover:bg-red-500 flex items-center justify-center text-white transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Type pill */}
                    <div className="absolute top-2 left-2">
                      <div className={`h-5 px-1.5 rounded-full flex items-center gap-1 text-[9px] font-bold uppercase backdrop-blur-sm ${item.type === "video" ? "bg-pink-500/80 text-white" : "bg-black/50 text-white/90"}`}>
                        {item.type === "video" ? <VideoIcon className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                        {item.type}
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-2.5 py-2">
                    <p className="text-[10px] font-bold text-slate-900 dark:text-white truncate leading-tight">{item.name}</p>
                    <p className="text-[9px] font-bold text-[#0bd2b5] truncate mt-0.5 uppercase tracking-tight">{item.tripName}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400 dark:text-[#888888]">
            <Images className="h-16 w-16 mb-4 opacity-15" />
            <p className="text-xs font-black italic uppercase tracking-[0.3em]">No media yet</p>
            <p className="text-[11px] mt-1 opacity-70">
              {allItems.length === 0
                ? "Select a trip and upload your first photos or videos"
                : "No media matches the current filter"}
            </p>
          </div>
        )}
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
