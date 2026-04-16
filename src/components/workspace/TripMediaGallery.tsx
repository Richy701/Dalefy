import { useState, useRef, useCallback } from "react";
import { Upload, Trash2, ZoomIn, Play, ImageIcon, VideoIcon } from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { toast } from "sonner";
import type { TripMedia } from "@/types";

interface Props {
  media: TripMedia[];
  onUpdate: (media: TripMedia[]) => void;
}

export function TripMediaGallery({ media, onUpdate }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const images = media.filter((m) => m.type === "image");
  const lightboxSlides = images.map((m) => ({ src: m.url, title: m.name }));

  const processFiles = useCallback(
    (files: File[]) => {
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
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return prev;
          }
          return prev + Math.random() * 18;
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
        setTimeout(() => {
          onUpdate([...media, ...newMedia]);
          setUploading(false);
          setUploadProgress(0);
          toast.success(
            `${newMedia.length} file${newMedia.length > 1 ? "s" : ""} added`
          );
        }, 350);
      });
    },
    [media, onUpdate]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(Array.from(e.dataTransfer.files));
    },
    [processFiles]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  const handleDelete = (id: string) => {
    onUpdate(media.filter((m) => m.id !== id));
    toast.success("Removed");
  };

  const fmt = (bytes: number) =>
    bytes < 1_048_576
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / 1_048_576).toFixed(1)} MB`;

  return (
    <div className="px-4 lg:px-10 pt-10 pb-32 w-full">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-[2rem] transition-all cursor-pointer flex flex-col items-center justify-center gap-4 py-14 mb-8 select-none ${
          isDragging
            ? "border-brand bg-brand/5"
            : "border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] hover:border-brand/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileInput}
        />

        {uploading ? (
          <>
            <div className="h-14 w-14 rounded-full border-2 border-brand/20 flex items-center justify-center">
              <div className="h-9 w-9 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            </div>
            <div className="w-52 h-1.5 bg-slate-100 dark:bg-[#1f1f1f] rounded-full overflow-hidden">
              <div
                className="h-full bg-brand rounded-full transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-brand">
              UPLOADING...
            </p>
          </>
        ) : (
          <>
            <div
              className={`h-16 w-16 rounded-2xl flex items-center justify-center transition-all ${
                isDragging
                  ? "bg-brand text-black scale-110"
                  : "bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888888]"
              }`}
            >
              <Upload className="h-7 w-7" />
            </div>
            <div className="text-center pointer-events-none">
              <p className="font-black text-sm uppercase tracking-[0.2em] text-slate-900 dark:text-white">
                {isDragging ? "DROP FILES HERE" : "DRAG & DROP PHOTOS · VIDEOS"}
              </p>
              <p className="text-xs text-slate-500 dark:text-[#888888] mt-1">
                or click to browse your device
              </p>
            </div>
          </>
        )}
      </div>

      {/* Gallery */}
      {media.length > 0 ? (
        <>
          <div className="flex items-center justify-between mb-5">
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-brand">
              {media.length} FILE{media.length !== 1 ? "S" : ""}
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888888] hover:text-brand transition-colors flex items-center gap-1.5"
            >
              <Upload className="h-3 w-3" /> ADD MORE
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {media.map((item) => {
              const imgIdx = images.findIndex((i) => i.id === item.id);
              return (
                <div
                  key={item.id}
                  className="group relative rounded-2xl overflow-hidden bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] shadow-sm hover:shadow-xl hover:border-brand/30 transition-all duration-300"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-[#0a0a0a]">
                    {item.type === "image" ? (
                      <img
                        src={item.url}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer"
                        onClick={() => setLightboxIndex(imgIdx)}
                      />
                    ) : (
                      <div className="relative w-full h-full flex items-center justify-center">
                        <video
                          src={item.url}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <div className="h-12 w-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                            <Play className="h-5 w-5 text-white ml-0.5" fill="white" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none group-hover:pointer-events-auto">
                      {item.type === "image" && (
                        <button
                          onClick={() => setLightboxIndex(imgIdx)}
                          className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                        >
                          <ZoomIn className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="h-9 w-9 rounded-xl bg-red-500/80 backdrop-blur-sm hover:bg-red-500 flex items-center justify-center text-white transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Type pill */}
                    <div className="absolute top-2 left-2">
                      <div
                        className={`h-5 px-2 rounded-full flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider backdrop-blur-sm ${
                          item.type === "video"
                            ? "bg-pink-500/80 text-white"
                            : "bg-black/50 text-white/90"
                        }`}
                      >
                        {item.type === "video" ? (
                          <VideoIcon className="h-2.5 w-2.5" />
                        ) : (
                          <ImageIcon className="h-2.5 w-2.5" />
                        )}
                        {item.type}
                      </div>
                    </div>
                  </div>

                  {/* Info footer */}
                  <div className="px-3 py-2.5">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate leading-tight">
                      {item.name}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-slate-500 dark:text-[#888888]">
                        {fmt(item.size)}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-[#888888]">
                        {new Date(item.uploadedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        !uploading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-[#888888]">
            <ImageIcon className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-xs font-black uppercase tracking-[0.3em]">
              NO MEDIA YET
            </p>
            <p className="text-[11px] mt-1 opacity-70">
              Upload trip photos and videos above
            </p>
          </div>
        )
      )}

      {/* Lightbox */}
      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        index={lightboxIndex}
        slides={lightboxSlides}
      />
    </div>
  );
}
