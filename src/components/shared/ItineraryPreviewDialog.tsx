import { useMemo } from "react";
import {
  CalendarDays, MapPin, Users, Plane, Hotel, Compass, Utensils,
  Clock, X, DollarSign, Briefcase, Hash, ArrowRight, User,
  Tag, FileText, Paperclip, Info,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useBrand, hexToRgb } from "@/context/BrandContext";
import { cn } from "@/lib/utils";
import type { Trip, TravelEvent } from "@/types";
import { EVENT_ICONS, EVENT_STYLES as EVENT_COLORS } from "@/config/eventStyles";

interface ItineraryPreviewContentProps {
  trip: Trip;
  forPrint?: boolean;
  onClose?: () => void;
  staticMapUrl?: string | null;
}

export function ItineraryPreviewContent({ trip, forPrint, onClose, staticMapUrl }: ItineraryPreviewContentProps) {
  const { brand } = useBrand();
  const grouped = useMemo(() => {
    const map: Record<string, TravelEvent[]> = {};
    for (const ev of trip.events) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [trip.events]);

  const nights = useMemo(() => {
    return Math.max(1, Math.ceil(
      (new Date(trip.end).getTime() - new Date(trip.start).getTime()) / 86400000
    ));
  }, [trip.start, trip.end]);

  const dateRange = useMemo(() => {
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const year = new Date(trip.end).getFullYear();
    return `${fmt(new Date(trip.start))} — ${fmt(new Date(trip.end))}, ${year}`;
  }, [trip.start, trip.end]);

  const hasMeta = trip.paxCount || trip.budget || trip.tripType || trip.organizer?.name;
  const hasInfo = trip.info && trip.info.length > 0;
  const totalDocs = trip.events.reduce((n, ev) => n + (ev.documents?.length ?? 0), 0);

  return (
    <div className={forPrint ? "bg-white" : "bg-slate-50 dark:bg-[#050505]"}>
      {/* ── Hero ── */}
      <div className={cn("relative overflow-hidden shrink-0", forPrint ? "h-[160px]" : "h-[180px] sm:h-[280px] rounded-t-2xl sm:rounded-t-[2rem]")}>
        {trip.image ? (
          <img src={trip.image} alt={trip.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand/30 via-[#111] to-[#050505]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />

        {/* Close — hidden in print */}
        {!forPrint && onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 sm:top-4 right-3 sm:right-4 z-10 h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-black/30 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/50 transition-colors"
          >
            <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        )}

        {/* Eyebrow */}
        <div className="absolute top-3 sm:top-4 left-3 sm:left-4 flex items-center gap-1.5">
          {brand.logoUrl && (
            <img src={brand.logoUrl} alt="" className="h-4 w-4 rounded object-contain" />
          )}
          <span className="text-[8px] sm:text-[9px] font-bold tracking-[0.25em] text-brand uppercase">
            {brand.name} · Itinerary {forPrint ? "" : "Preview"}
          </span>
        </div>

        {/* Title block */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-8">
          <h2 className="text-xl sm:text-3xl font-extrabold uppercase tracking-tight text-white leading-[1.05] mb-2 sm:mb-3">
            {trip.name}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Pill icon={CalendarDays} forPrint={forPrint}>{dateRange} · {nights} night{nights !== 1 ? "s" : ""}</Pill>
            {trip.destination && <Pill icon={MapPin} forPrint={forPrint}>{trip.destination}</Pill>}
            {trip.attendees && <Pill icon={Users} className={forPrint ? undefined : "hidden sm:flex"} forPrint={forPrint}>{trip.attendees}</Pill>}
          </div>
        </div>
      </div>

      {/* ── Metadata strip ── */}
      {hasMeta && (
        <div className={cn("flex flex-wrap items-center gap-2 sm:gap-3 px-4 sm:px-8 py-3 sm:py-4 border-b border-slate-200", forPrint ? "bg-white" : "bg-white dark:bg-[#111111] dark:border-[#1f1f1f]")}>
          {trip.tripType && (
            <MetaChip icon={Tag} label="Type" value={trip.tripType} forPrint={forPrint} />
          )}
          {trip.paxCount && (
            <MetaChip icon={Users} label="Pax" value={trip.paxCount} forPrint={forPrint} />
          )}
          {trip.budget && (
            <MetaChip icon={DollarSign} label="Budget" value={`${trip.currency ?? "USD"} ${trip.budget}`} forPrint={forPrint} />
          )}
          {trip.organizer?.name && (
            <MetaChip icon={User} label="Organizer" value={[trip.organizer.name, trip.organizer.company].filter(Boolean).join(" · ")} forPrint={forPrint} />
          )}
          {trip.attendees && (
            <div className={forPrint ? undefined : "sm:hidden"}>
              <MetaChip icon={Users} label="Attendees" value={trip.attendees} forPrint={forPrint} />
            </div>
          )}
        </div>
      )}

      {/* ── Trip Info Sections ── */}
      {hasInfo && (
        <div className={cn("px-4 sm:px-8 py-4 sm:py-6 border-b border-slate-200", forPrint ? "bg-white" : "bg-white dark:bg-[#111111] dark:border-[#1f1f1f]")}>
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-3.5 w-3.5 text-brand" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-brand">Trip Information</span>
            </div>
            <div className={cn("grid gap-3", forPrint ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}>
              {trip.info!.map(item => (
                <div key={item.id} className={cn("rounded-xl p-3 sm:p-4 border", forPrint ? "bg-slate-50 border-slate-100" : "bg-slate-50 dark:bg-[#0a0a0a] border-slate-100 dark:border-[#1a1a1a]")}>
                  <p className={cn("text-xs font-bold uppercase tracking-tight mb-1", forPrint ? "text-slate-900" : "text-slate-900 dark:text-white")}>{item.title}</p>
                  <p className={cn("text-[11px] leading-relaxed whitespace-pre-wrap", forPrint ? "text-slate-600" : "text-slate-600 dark:text-[#999]")}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Itinerary body ── */}
      <div className={cn(forPrint ? "px-8 py-8" : "px-3 sm:px-8 py-5 sm:py-8")}>
        <div className="max-w-3xl mx-auto">
          {/* Event count */}
          <div className="flex items-center gap-2 mb-5 sm:mb-6">
            <Compass className="h-4 w-4 text-brand" />
            <span className={cn("text-[10px] sm:text-[11px] font-black uppercase tracking-[0.25em]", forPrint ? "text-slate-500" : "text-slate-500 dark:text-[#888]")}>
              {trip.events.length} event{trip.events.length !== 1 ? "s" : ""} · {grouped.length} day{grouped.length !== 1 ? "s" : ""}
              {totalDocs > 0 && <> · {totalDocs} document{totalDocs !== 1 ? "s" : ""}</>}
            </span>
          </div>

          {grouped.length === 0 ? (
            <div className={cn("border border-dashed rounded-2xl flex flex-col items-center justify-center py-12 sm:py-16", forPrint ? "bg-white border-slate-200 text-slate-500" : "bg-white dark:bg-[#111111] border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888]")}>
              <Compass className="h-7 w-7 mb-3 opacity-40" />
              <p className="text-xs font-bold uppercase tracking-widest">No events yet</p>
              <p className={cn("text-[10px] mt-1", forPrint ? "text-slate-400" : "text-slate-400 dark:text-[#555]")}>Add events in the workspace to see them here</p>
            </div>
          ) : (
            <div className="space-y-6 sm:space-y-8">
              {grouped.map(([date, events], dayIdx) => {
                const d = new Date(date + "T12:00:00");
                return (
                  <div key={date} style={forPrint ? { breakInside: "avoid", pageBreakInside: "avoid" } : undefined}>
                    {/* Day header */}
                    <div className="flex items-center gap-2.5 sm:gap-3 mb-3">
                      <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-brand/10 border border-brand/20 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[9px] sm:text-[10px] font-black text-brand leading-none">
                          {d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                        </span>
                        <span className="text-[11px] sm:text-xs font-black text-brand leading-none mt-0.5">
                          {d.getDate()}
                        </span>
                      </div>
                      <div>
                        <p className={cn("text-xs sm:text-sm font-bold uppercase tracking-tight", forPrint ? "text-slate-900" : "text-slate-900 dark:text-white")}>
                          Day {dayIdx + 1} · {d.toLocaleDateString("en-US", { weekday: "long" })}
                        </p>
                        <p className={cn("text-[10px] sm:text-[11px]", forPrint ? "text-slate-500" : "text-slate-500 dark:text-[#888]")}>
                          {events.length} event{events.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    {/* Events */}
                    <div className={cn("border rounded-xl sm:rounded-2xl overflow-hidden divide-y", forPrint ? "bg-white border-slate-200 divide-slate-100" : "bg-white dark:bg-[#111111] border-slate-200 dark:border-[#1f1f1f] divide-slate-100 dark:divide-[#1a1a1a]")}>
                      {events.map(ev => (
                        <PreviewEventCard key={ev.id} ev={ev} forPrint={forPrint} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className={cn("mt-8 sm:mt-10 pt-5 sm:pt-6 border-t text-center", forPrint ? "border-slate-200" : "border-slate-200 dark:border-[#1f1f1f]")}>
            <p className={cn("text-[9px] font-bold uppercase tracking-[0.35em]", forPrint ? "text-slate-400" : "text-slate-400 dark:text-[#555]")}>
              Powered by {brand.platformName}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Dialog wrapper ── */
interface ItineraryPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip;
}

export function ItineraryPreviewDialog({ open, onOpenChange, trip }: ItineraryPreviewDialogProps) {
  const { brand } = useBrand();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-4rem)] overflow-y-auto overflow-x-hidden bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl sm:rounded-[2rem] p-0 gap-0 shadow-2xl"
        style={brand.accentColor ? { "--brand-rgb": hexToRgb(brand.accentColor) } as React.CSSProperties : undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{trip.name} — Preview</DialogTitle>
          <DialogDescription>Read-only itinerary preview</DialogDescription>
        </DialogHeader>
        <ItineraryPreviewContent trip={trip} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/* ── Pill badge (hero) ── */
function Pill({ icon: Icon, children, className, forPrint }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string; forPrint?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1.5 border border-white/10 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5", forPrint ? "bg-white/15" : "bg-white/10 backdrop-blur-sm", className)}>
      <Icon className="h-3 w-3 text-brand" />
      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-white/90">{children}</span>
    </div>
  );
}

/* ── Metadata chip ── */
function MetaChip({ icon: Icon, label, value, forPrint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; forPrint?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("h-3 w-3 shrink-0", forPrint ? "text-slate-400" : "text-slate-400 dark:text-[#666]")} strokeWidth={1.8} />
      <div className="min-w-0">
        <p className={cn("text-[8px] font-bold uppercase tracking-[0.2em]", forPrint ? "text-slate-400" : "text-slate-400 dark:text-[#555]")}>{label}</p>
        <p className={cn("text-[10px] sm:text-[11px] font-semibold truncate", forPrint ? "text-slate-700" : "text-slate-700 dark:text-[#ccc]")}>{value}</p>
      </div>
    </div>
  );
}

/* ── Event card ── */
function PreviewEventCard({ ev, forPrint }: { ev: TravelEvent; forPrint?: boolean }) {
  const Icon = EVENT_ICONS[ev.type] ?? Compass;
  const typeLabel = ev.type === "flight" ? "Flight" : ev.type === "hotel" ? "Stay" : ev.type === "dining" ? "Dining" : "Activity";

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-3 sm:p-4" style={forPrint ? { breakInside: "avoid", pageBreakInside: "avoid" } : undefined}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {/* Icon */}
        <div className={cn("h-8 w-8 sm:h-9 sm:w-9 rounded-lg flex items-center justify-center shrink-0", forPrint ? "bg-slate-100" : "bg-slate-100 dark:bg-[#1a1a1a]")}>
          <Icon className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", forPrint ? "text-slate-500" : "text-slate-500 dark:text-[#888]")} strokeWidth={1.8} />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <p className={cn("text-[9px] font-bold uppercase tracking-[0.15em] mb-0.5", forPrint ? "text-slate-400" : "text-slate-400 dark:text-[#666]")}>{typeLabel}</p>
          <p className={cn("text-[13px] sm:text-sm font-bold leading-snug", forPrint ? "text-slate-900" : "text-slate-900 dark:text-white")}>{ev.title}</p>

          {/* Description */}
          {ev.description && (
            <p className={cn("mt-1 text-[11px] leading-relaxed", forPrint ? "text-slate-500" : "text-slate-600 dark:text-[#999] line-clamp-3")}>{ev.description}</p>
          )}

          {/* Time + location */}
          <div className={cn("flex items-center gap-1.5 sm:gap-2 mt-1.5 text-[10px] sm:text-[11px] flex-wrap", forPrint ? "text-slate-500" : "text-slate-500 dark:text-[#888]")}>
            {ev.time && (
              <span className="flex items-center gap-1 font-semibold">
                <Clock className="h-3 w-3" strokeWidth={1.8} />
                {ev.time}
                {ev.endTime && <> — {ev.endTime}</>}
              </span>
            )}
            {ev.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" strokeWidth={1.8} />
                <span className={forPrint ? "" : "truncate max-w-[180px] sm:max-w-[200px]"}>{ev.location}</span>
              </span>
            )}
            {ev.duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 opacity-60" strokeWidth={1.8} />
                {ev.duration}
              </span>
            )}
          </div>

          {/* Type-specific details */}
          {ev.type === "flight" && (ev.airline || ev.flightNum || ev.terminal) && (
            <div className={cn("flex items-center gap-2 mt-2 flex-wrap text-[9px] sm:text-[10px] font-semibold", forPrint ? "text-slate-600" : "text-slate-600 dark:text-[#ccc]")}>
              {(ev.airline || ev.flightNum) && (
                <span>{[ev.airline, ev.flightNum].filter(Boolean).join(" · ")}</span>
              )}
              {ev.terminal && <span>Terminal {ev.terminal}</span>}
              {ev.gate && <span>Gate {ev.gate}</span>}
              {ev.seatDetails && <span>Seat {ev.seatDetails}</span>}
            </div>
          )}

          {ev.type === "hotel" && (ev.roomType || ev.checkin || ev.checkout) && (
            <div className={cn("flex items-center gap-2 mt-2 flex-wrap text-[9px] sm:text-[10px] font-semibold", forPrint ? "text-slate-600" : "text-slate-600 dark:text-[#ccc]")}>
              {ev.roomType && <span>{ev.roomType}</span>}
              {(ev.checkin || ev.checkout) && (
                <span className={forPrint ? "text-slate-400" : "text-slate-400 dark:text-[#888]"}>
                  {ev.checkin || "—"} → {ev.checkout || "—"}
                </span>
              )}
            </div>
          )}

          {(ev.type === "dining" || ev.type === "activity") && ev.supplier && (
            <p className={cn("mt-1.5 text-[9px] sm:text-[10px]", forPrint ? "text-slate-400" : "text-slate-400 dark:text-[#888]")}>
              {ev.supplier}
            </p>
          )}

          {/* Bottom row: conf number, price, status */}
          {(ev.confNumber || ev.price || ev.status) && (
            <div className={cn("flex items-center gap-2 mt-2 flex-wrap text-[9px] sm:text-[10px]", forPrint ? "text-slate-500" : "text-slate-500 dark:text-[#888]")}>
              {ev.confNumber && (
                <span className="font-semibold">Ref: {ev.confNumber}</span>
              )}
              {ev.price && (
                <span className="font-semibold">{ev.price}</span>
              )}
              {ev.status && (
                <span className={cn(
                  "font-semibold",
                  ev.status === "Confirmed" || ev.status === "On Time"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-brand",
                )}>
                  {ev.status}
                </span>
              )}
            </div>
          )}

          {/* Documents */}
          {ev.documents && ev.documents.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {ev.documents.map(doc => (
                <a
                  key={doc.id}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-medium px-2 py-0.5 rounded border transition-colors", forPrint ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-slate-50 dark:bg-[#0d0d0d] border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#aaa] hover:text-brand hover:border-brand/30")}
                >
                  <Paperclip className="h-2.5 w-2.5 shrink-0" strokeWidth={1.8} />
                  <span className={forPrint ? "" : "truncate max-w-[120px] sm:max-w-[160px]"}>{doc.name}</span>
                </a>
              ))}
            </div>
          )}

          {/* Notes */}
          {ev.notes && (
            <p className={cn("mt-2 text-[10px] sm:text-[11px] italic leading-relaxed", forPrint ? "text-slate-400" : "text-slate-400 dark:text-[#666] line-clamp-2")}>
              {ev.notes}
            </p>
          )}
        </div>
      </div>

      {/* Image thumbnail */}
      {ev.image && (
        <img
          src={ev.image}
          alt={ev.title}
          className="h-20 w-full sm:h-20 sm:w-28 rounded-xl object-cover shrink-0"
        />
      )}
    </div>
  );
}
