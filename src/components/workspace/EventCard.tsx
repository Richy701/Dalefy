import { memo } from "react";
import { Plane, Hotel, Compass, Utensils, MapPin, Clock, MoreVertical, Settings, Trash2, ArrowRight, Image as ImageIcon, Video } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { TravelEvent } from "@/types";

function StatusChip({ status }: { status?: string }) {
  if (!status) return null;
  const cls =
    status === "On Time" || status === "Confirmed"
      ? "bg-emerald-500/10 text-emerald-400"
      : status === "Proposed"
      ? "bg-amber-500/10 text-amber-500"
      : "bg-slate-100 dark:bg-[#1a1a1a] text-slate-500 dark:text-[#888]";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${cls}`}>
      {status}
    </span>
  );
}

function MediaBadge({ media }: { media?: TravelEvent["media"] }) {
  if (!media?.length) return null;
  const images = media.filter(m => m.type === "image").length;
  const videos = media.filter(m => m.type === "video").length;
  return (
    <div className="flex items-center gap-1.5">
      {images > 0 && (
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#555] bg-slate-100 dark:bg-[#1a1a1a] px-2 py-0.5 rounded-full">
          <ImageIcon className="h-2.5 w-2.5" />{images}
        </span>
      )}
      {videos > 0 && (
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[#0bd2b5] bg-[#0bd2b5]/10 px-2 py-0.5 rounded-full">
          <Video className="h-2.5 w-2.5" />{videos}
        </span>
      )}
    </div>
  );
}

function CardMenu({ onClick, onDelete }: { onClick: () => void; onDelete: () => void }) {
  return (
    <div onClick={e => e.stopPropagation()} className="shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Event options" className="h-8 w-8 rounded-lg bg-slate-50 dark:bg-[#0a0a0a] text-slate-500 dark:text-[#555] flex items-center justify-center border border-transparent hover:border-slate-200 dark:hover:border-[#2a2a2a] hover:text-slate-600 dark:hover:text-[#aaa] transition-[border-color,color] duration-150">
          <MoreVertical className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white rounded-xl shadow-2xl p-1 min-w-[160px]">
          <DropdownMenuItem onClick={onClick} className="gap-2 p-2 rounded-lg font-bold text-[11px] uppercase tracking-wider text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-[#050505]">
            <Settings className="h-3.5 w-3.5 text-[#0bd2b5]" /> Edit Event
          </DropdownMenuItem>
          <div className="my-1 h-px bg-slate-100 dark:bg-[#1f1f1f]" />
          <DropdownMenuItem onClick={onDelete} className="gap-2 p-2 rounded-lg font-bold text-[11px] uppercase tracking-wider text-red-500 hover:bg-red-500/5">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Flight Card ──────────────────────────────────────────────────────────────
function FlightCard({ event, onClick, onDelete }: { event: TravelEvent; onClick: () => void; onDelete: () => void }) {
  const parts = event.location.match(/^(.+?)\s+to\s+(.+)$/i);
  const from = parts?.[1]?.trim() ?? event.location;
  const to = parts?.[2]?.trim() ?? "";

  const fromCode = from.length <= 4 ? from.toUpperCase() : from.slice(0, 3).toUpperCase();
  const toCode = to.length <= 4 ? to.toUpperCase() : to.slice(0, 3).toUpperCase();
  const fromLabel = from.length > 4 ? from.slice(0, 14) : "Departure";
  const toLabel = to.length > 4 ? to.slice(0, 14) : "Arrival";

  return (
    <div
      onClick={onClick}
      className="group relative bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden hover:border-slate-300 dark:hover:border-[#2a2a2a] hover:shadow-lg transition-[border-color,box-shadow] duration-200 cursor-pointer"
    >
      <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 dark:via-[#2a2a2a] to-transparent" />
      <div className="px-6 py-5 flex items-center gap-6">
        {/* Departure time */}
        <div className="flex flex-col items-center shrink-0 w-14 text-center">
          <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] text-slate-500 dark:text-[#888888] flex items-center justify-center mb-2">
            <Plane className="h-3.5 w-3.5" />
          </div>
          <span className="text-xl font-black italic tracking-tighter text-slate-900 dark:text-white leading-none">{event.time.split(" ")[0]}</span>
          <span className="text-[10px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-wider mt-0.5">{event.time.split(" ")[1]}</span>
        </div>

        {/* Route visualization */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-center shrink-0">
              <p className="text-2xl font-black italic tracking-tighter text-slate-900 dark:text-white leading-none">{fromCode}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-[#888888] mt-0.5 leading-none max-w-[60px] truncate">{fromLabel}</p>
            </div>
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
              <div className="h-px flex-1 border-t border-dashed border-slate-300 dark:border-[#2a2a2a]" />
              <Plane className="h-3 w-3 text-slate-500 dark:text-[#555] shrink-0" />
              <div className="h-px flex-1 border-t border-dashed border-slate-300 dark:border-[#2a2a2a]" />
            </div>
            {to && (
              <div className="text-center shrink-0">
                <p className="text-2xl font-black italic tracking-tighter text-slate-900 dark:text-white leading-none">{toCode}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-[#888888] mt-0.5 leading-none max-w-[60px] truncate">{toLabel}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{event.title}</p>
            <StatusChip status={event.status} />
            <MediaBadge media={event.media} />
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-[#888888]">
            {event.airline && <span>{event.airline}{event.flightNum ? ` · ${event.flightNum}` : ""}</span>}
            {event.terminal && <span>Terminal {event.terminal.replace("T", "")}</span>}
            {event.duration && (
              <span className="flex items-center gap-1 ml-auto shrink-0">
                <Clock className="h-3 w-3" />{event.duration}
              </span>
            )}
          </div>
        </div>

        <CardMenu onClick={onClick} onDelete={onDelete} />
      </div>
    </div>
  );
}

// ─── Hotel Card ───────────────────────────────────────────────────────────────
function HotelCard({ event, onClick, onDelete }: { event: TravelEvent; onClick: () => void; onDelete: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden hover:border-amber-400/30 hover:shadow-lg transition-[border-color,box-shadow] duration-200 cursor-pointer"
    >
      <div className="flex">
        {event.image ? (
          <div className="w-28 lg:w-40 shrink-0 relative overflow-hidden">
            <img src={event.image} alt={event.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 min-h-[120px]" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/10" />
          </div>
        ) : (
          <div className="w-28 lg:w-40 shrink-0 bg-amber-500/5 flex items-center justify-center min-h-[120px] border-r border-slate-100 dark:border-[#1a1a1a]">
            <Hotel className="h-7 w-7 text-amber-400/30" />
          </div>
        )}

        <div className="flex-1 min-w-0 p-5 lg:p-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Hotel className="h-3 w-3 text-amber-400 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-500">Accommodation</span>
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate group-hover:text-amber-400 transition-colors">{event.title}</h4>
              <p className="text-xs text-slate-500 dark:text-[#888888] flex items-center gap-1.5 mt-1">
                <MapPin className="h-3 w-3 shrink-0" />{event.location}
              </p>
            </div>
            <CardMenu onClick={onClick} onDelete={onDelete} />
          </div>

          <div className="flex items-center gap-4 pt-3 border-t border-slate-100 dark:border-[#1a1a1a]">
            {event.checkin ? (
              <>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888] mb-0.5">Check In</p>
                  <p className="text-sm font-black italic tracking-tighter text-slate-900 dark:text-white leading-none">{event.checkin}</p>
                </div>
                {event.checkout && <ArrowRight className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                {event.checkout && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888] mb-0.5">Check Out</p>
                    <p className="text-sm font-black italic tracking-tighter text-slate-900 dark:text-white leading-none">{event.checkout}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm font-black italic tracking-tighter text-slate-900 dark:text-white">{event.time}</span>
                <StatusChip status={event.status} />
              </div>
            )}
            {event.roomType && (
              <span className="ml-auto text-[11px] font-bold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full shrink-0">{event.roomType}</span>
            )}
            <MediaBadge media={event.media} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Activity / Dining Card ───────────────────────────────────────────────────
function ActivityCard({ event, onClick, onDelete }: { event: TravelEvent; onClick: () => void; onDelete: () => void }) {
  const isDining = event.type === "dining";
  const Icon = isDining ? Utensils : Compass;

  return (
    <div
      onClick={onClick}
      className={`group relative bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden transition-[border-color,box-shadow] duration-200 cursor-pointer hover:shadow-lg ${isDining ? "hover:border-pink-400/30" : "hover:border-[#0bd2b5]/30"}`}
    >
      <div className="flex">
        {event.image ? (
          <div className="w-32 lg:w-44 shrink-0 relative overflow-hidden">
            <img src={event.image} alt={event.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 min-h-[130px]" />
          </div>
        ) : (
          <div className={`w-24 shrink-0 flex items-center justify-center min-h-[130px] border-r border-slate-100 dark:border-[#1a1a1a] ${isDining ? "bg-pink-500/5" : "bg-[#0bd2b5]/5"}`}>
            <Icon className={`h-7 w-7 opacity-20 ${isDining ? "text-pink-400" : "text-[#0bd2b5]"}`} />
          </div>
        )}

        <div className="flex-1 min-w-0 p-5 lg:p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className={`h-3 w-3 shrink-0 ${isDining ? "text-pink-400" : "text-[#0bd2b5]"}`} />
                <span className={`text-[10px] font-bold uppercase tracking-[0.25em] ${isDining ? "text-pink-500" : "text-[#0bd2b5]"}`}>
                  {isDining ? "Dining" : "Activity"}
                </span>
              </div>
              <h4 className={`text-base font-bold text-slate-900 dark:text-white leading-tight truncate transition-colors ${isDining ? "group-hover:text-pink-400" : "group-hover:text-[#0bd2b5]"}`}>{event.title}</h4>
              <p className="text-xs text-slate-500 dark:text-[#888888] flex items-center gap-1.5 mt-1">
                <MapPin className="h-3 w-3 shrink-0" />{event.location}
              </p>
              {event.notes && (
                <p className="text-xs text-slate-500 dark:text-[#888] mt-2 line-clamp-2 leading-relaxed">{event.notes}</p>
              )}
            </div>
            <CardMenu onClick={onClick} onDelete={onDelete} />
          </div>

          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-[#1a1a1a]">
            <span className="text-sm font-black italic tracking-tighter text-slate-900 dark:text-white">{event.time}</span>
            {event.endTime && (
              <span className="text-[11px] font-bold text-slate-500 dark:text-[#888888]">→ {event.endTime}</span>
            )}
            <StatusChip status={event.status} />
            <MediaBadge media={event.media} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────
export const EventCard = memo(function EventCard({ event, onClick, onDelete }: { event: TravelEvent; onClick: () => void; onDelete: () => void }) {
  if (event.type === "flight") return <FlightCard event={event} onClick={onClick} onDelete={onDelete} />;
  if (event.type === "hotel") return <HotelCard event={event} onClick={onClick} onDelete={onDelete} />;
  return <ActivityCard event={event} onClick={onClick} onDelete={onDelete} />;
});
