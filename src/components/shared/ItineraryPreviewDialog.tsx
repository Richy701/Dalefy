import { useMemo } from "react";
import {
  CalendarDays, MapPin, Users, Plane, Hotel, Compass, Utensils,
  Clock, X, DollarSign, Briefcase, Hash, ArrowRight, User,
  Tag,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Trip, TravelEvent } from "@/types";

const EVENT_ICONS = { flight: Plane, hotel: Hotel, activity: Compass, dining: Utensils } as const;
const EVENT_COLORS = {
  flight:   { bg: "bg-blue-400/10",   text: "text-blue-500",   hex: "#60a5fa" },
  hotel:    { bg: "bg-amber-400/10",  text: "text-amber-500",  hex: "#f59e0b" },
  activity: { bg: "bg-brand/10",      text: "text-brand",      hex: "#0bd2b5" },
  dining:   { bg: "bg-pink-400/10",   text: "text-pink-500",   hex: "#f472b6" },
} as const;

interface ItineraryPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip;
}

export function ItineraryPreviewDialog({ open, onOpenChange, trip }: ItineraryPreviewDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-4rem)] overflow-y-auto overflow-x-hidden bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl sm:rounded-[2rem] p-0 gap-0 shadow-2xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{trip.name} — Preview</DialogTitle>
          <DialogDescription>Read-only itinerary preview</DialogDescription>
        </DialogHeader>

        {/* ── Hero ── */}
        <div className="relative h-[200px] sm:h-[280px] overflow-hidden rounded-t-2xl sm:rounded-t-[2rem] shrink-0">
          {trip.image ? (
            <img src={trip.image} alt={trip.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand/30 via-[#111] to-[#050505]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />

          {/* Close */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 z-10 h-9 w-9 rounded-xl bg-black/30 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Eyebrow */}
          <span className="absolute top-4 left-4 text-[9px] font-bold tracking-[0.25em] text-brand uppercase">
            DAF Adventures · Itinerary Preview
          </span>

          {/* Title block */}
          <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-white leading-[1.05] mb-3">
              {trip.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Pill icon={CalendarDays}>{dateRange} · {nights} night{nights !== 1 ? "s" : ""}</Pill>
              {trip.destination && <Pill icon={MapPin}>{trip.destination}</Pill>}
              {trip.attendees && <Pill icon={Users}>{trip.attendees}</Pill>}
            </div>
          </div>
        </div>

        {/* ── Metadata strip ── */}
        {hasMeta && (
          <div className="flex flex-wrap items-center gap-3 px-5 sm:px-8 py-4 bg-white dark:bg-[#111111] border-b border-slate-200 dark:border-[#1f1f1f]">
            {trip.tripType && (
              <MetaChip icon={Tag} label="Type" value={trip.tripType} />
            )}
            {trip.paxCount && (
              <MetaChip icon={Users} label="Pax" value={trip.paxCount} />
            )}
            {trip.budget && (
              <MetaChip icon={DollarSign} label="Budget" value={`${trip.currency ?? "USD"} ${trip.budget}`} />
            )}
            {trip.organizer?.name && (
              <MetaChip icon={User} label="Organizer" value={[trip.organizer.name, trip.organizer.company].filter(Boolean).join(" · ")} />
            )}
          </div>
        )}

        {/* ── Itinerary body ── */}
        <div className="px-4 sm:px-8 py-6 sm:py-8">
          <div className="max-w-3xl mx-auto">
            {/* Event count */}
            <div className="flex items-center gap-2 mb-6">
              <Compass className="h-4 w-4 text-brand" />
              <span className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-[#888]">
                {trip.events.length} event{trip.events.length !== 1 ? "s" : ""} · {grouped.length} day{grouped.length !== 1 ? "s" : ""}
              </span>
            </div>

            {grouped.length === 0 ? (
              <div className="bg-white dark:bg-[#111111] border border-dashed border-slate-200 dark:border-[#1f1f1f] rounded-2xl flex flex-col items-center justify-center py-16 text-slate-500 dark:text-[#888]">
                <Compass className="h-7 w-7 mb-3 opacity-40" />
                <p className="text-xs font-bold uppercase tracking-widest">No events yet</p>
                <p className="text-[10px] text-slate-400 dark:text-[#555] mt-1">Add events in the workspace to see them here</p>
              </div>
            ) : (
              <div className="space-y-8">
                {grouped.map(([date, events], dayIdx) => {
                  const d = new Date(date + "T12:00:00");
                  return (
                    <div key={date}>
                      {/* Day header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-lg bg-brand/10 border border-brand/20 flex flex-col items-center justify-center shrink-0">
                          <span className="text-[10px] font-black text-brand leading-none">
                            {d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                          </span>
                          <span className="text-xs font-black text-brand leading-none mt-0.5">
                            {d.getDate()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                            Day {dayIdx + 1} · {d.toLocaleDateString("en-US", { weekday: "long" })}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-[#888]">
                            {events.length} event{events.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>

                      {/* Events */}
                      <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-[#1a1a1a]">
                        {events.map(ev => (
                          <PreviewEventCard key={ev.id} ev={ev} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            <div className="mt-10 pt-6 border-t border-slate-200 dark:border-[#1f1f1f] text-center">
              <p className="text-[9px] font-bold uppercase tracking-[0.35em] text-slate-400 dark:text-[#555]">
                Powered by DAF Adventures
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Pill badge (hero) ── */
function Pill({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
      <Icon className="h-3 w-3 text-brand" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">{children}</span>
    </div>
  );
}

/* ── Metadata chip ── */
function MetaChip({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#0a0a0a] rounded-xl px-3 py-2 border border-slate-100 dark:border-[#1a1a1a]">
      <Icon className="h-3 w-3 text-brand shrink-0" />
      <div className="min-w-0">
        <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#555]">{label}</p>
        <p className="text-[11px] font-bold text-slate-700 dark:text-[#ccc] truncate">{value}</p>
      </div>
    </div>
  );
}

/* ── Event card ── */
function PreviewEventCard({ ev }: { ev: TravelEvent }) {
  const Icon = EVENT_ICONS[ev.type] ?? Compass;
  const colors = EVENT_COLORS[ev.type] ?? EVENT_COLORS.activity;

  return (
    <div className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4">
      {/* Type icon */}
      <div
        className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border", colors.bg)}
        style={{ borderColor: `${colors.hex}30` }}
      >
        <Icon className={cn("h-4 w-4", colors.text)} />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        {/* Type pill + title */}
        <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-[0.15em] mb-1", colors.bg, colors.text)}>
          <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
          {ev.type === "flight" ? "Flight" : ev.type === "hotel" ? "Stay" : ev.type === "dining" ? "Dining" : "Activity"}
        </div>
        <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{ev.title}</p>

        {/* Time + location */}
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500 dark:text-[#888] flex-wrap">
          {ev.time && (
            <span className="flex items-center gap-1 font-bold">
              <Clock className="h-3 w-3" strokeWidth={2} />
              {ev.time}
              {ev.endTime && <> → {ev.endTime}</>}
            </span>
          )}
          {ev.location && (
            <span className="flex items-center gap-1 font-medium">
              <MapPin className="h-3 w-3" strokeWidth={2} />
              <span className="truncate max-w-[200px]">{ev.location}</span>
            </span>
          )}
          {ev.duration && (
            <span className="flex items-center gap-1 font-medium">
              <Clock className="h-3 w-3 opacity-60" strokeWidth={2} />
              {ev.duration}
            </span>
          )}
        </div>

        {/* Type-specific details */}
        {ev.type === "flight" && (ev.airline || ev.flightNum || ev.terminal) && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {(ev.airline || ev.flightNum) && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 dark:text-[#ddd]">
                <Plane className="h-3 w-3 text-blue-500" strokeWidth={2} />
                {[ev.airline, ev.flightNum].filter(Boolean).join(" · ")}
              </span>
            )}
            {ev.terminal && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#1a1a1a] text-slate-600 dark:text-[#999]">
                T{ev.terminal}
              </span>
            )}
            {ev.gate && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#1a1a1a] text-slate-600 dark:text-[#999]">
                Gate {ev.gate}
              </span>
            )}
            {ev.seatDetails && (
              <span className="text-[10px] font-bold text-slate-500 dark:text-[#888]">
                Seat {ev.seatDetails}
              </span>
            )}
          </div>
        )}

        {ev.type === "hotel" && (ev.roomType || ev.checkin || ev.checkout) && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {ev.roomType && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 dark:text-[#ddd]">
                <Hotel className="h-3 w-3 text-amber-500" strokeWidth={2} />
                {ev.roomType}
              </span>
            )}
            {(ev.checkin || ev.checkout) && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-[#888]">
                {ev.checkin || "—"}
                <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                {ev.checkout || "—"}
              </span>
            )}
          </div>
        )}

        {ev.type === "dining" && ev.supplier && (
          <p className="mt-1.5 text-[10px] font-bold text-slate-500 dark:text-[#888]">
            <Briefcase className="h-3 w-3 inline mr-1" strokeWidth={2} />
            {ev.supplier}
          </p>
        )}

        {ev.type === "activity" && ev.supplier && (
          <p className="mt-1.5 text-[10px] font-bold text-slate-500 dark:text-[#888]">
            <Briefcase className="h-3 w-3 inline mr-1" strokeWidth={2} />
            {ev.supplier}
          </p>
        )}

        {/* Bottom row: conf number, price, status */}
        {(ev.confNumber || ev.price || ev.status) && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {ev.confNumber && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
                <Hash className="h-2.5 w-2.5" strokeWidth={2.5} />
                {ev.confNumber}
              </span>
            )}
            {ev.price && (
              <span className={cn("inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full", colors.bg, colors.text)}>
                <DollarSign className="h-2.5 w-2.5" strokeWidth={2.5} />
                {ev.price}
              </span>
            )}
            {ev.status && (
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border",
                ev.status === "Confirmed" || ev.status === "On Time"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
              )}>
                {ev.status}
              </span>
            )}
          </div>
        )}

        {/* Notes */}
        {ev.notes && (
          <p className="mt-2 text-[11px] italic text-slate-400 dark:text-[#666] line-clamp-2 leading-relaxed">
            {ev.notes}
          </p>
        )}
      </div>

      {/* Image thumbnail */}
      {ev.image && (
        <img
          src={ev.image}
          alt={ev.title}
          className="h-16 w-24 sm:h-20 sm:w-28 rounded-xl object-cover shrink-0"
        />
      )}
    </div>
  );
}
