import { useMemo } from "react";
import { objectPosition } from "@/lib/imagePosition";
import {
  CalendarDots, MapPin, Users, Compass,
  Clock, X, CurrencyDollar, User,
  Tag, Paperclip,
} from "@phosphor-icons/react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useBrand, hexToRgb } from "@/context/BrandContext";
import { sortEvents } from "@/lib/sortEvents";
import { cn } from "@/lib/utils";
import { parseTripDate } from "@/lib/dates";
import type { Trip, TravelEvent } from "@/types";
import { EVENT_ICONS } from "@/config/eventStyles";
import { Linkify } from "@/lib/linkify";
import { tzAbbr, destinationTz, eventTz } from "@/lib/timezone";
import { topicIcon, factRows, balanceColumns } from "@/lib/infoTopics";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { CategoryDot } from "@/components/ui/category-dot";

interface ItineraryPreviewContentProps {
  trip: Trip;
  forPrint?: boolean;
  onClose?: () => void;
  staticMapUrl?: string | null;
}

export function ItineraryPreviewContent({ trip, forPrint, onClose }: ItineraryPreviewContentProps) {
  const { brand } = useBrand();
  const grouped = useMemo(() => {
    const sorted = sortEvents(trip.events);
    const map: Record<string, TravelEvent[]> = {};
    for (const ev of sorted) {
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
    const year = parseTripDate(trip.end).getFullYear();
    return `${fmt(parseTripDate(trip.start))} - ${fmt(parseTripDate(trip.end))}, ${year}`;
  }, [trip.start, trip.end]);

  const tripTz = useMemo(() => destinationTz(trip.destination), [trip.destination]);
  const hasMeta = trip.paxCount || trip.budget || trip.tripType || trip.organizer?.name;
  const travelerInfo = trip.info?.filter(i => !i.leaderOnly) ?? [];
  const hasInfo = travelerInfo.length > 0;
  const totalDocs = trip.events.reduce((n, ev) => n + (ev.documents?.length ?? 0), 0);

  return (
    <div className={forPrint ? "bg-white" : "bg-background"}>
      {/* ── Hero ── */}
      <div className={cn("relative overflow-hidden shrink-0", forPrint ? "h-[160px]" : "h-[180px] sm:h-[280px] rounded-t-xl sm:rounded-t-xl")}>
        {trip.image ? (
          <img src={trip.image} alt={trip.name} style={{ objectPosition: objectPosition(trip.imagePosition) }} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-brand/30 via-[#111] to-[#050505]" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-black/5" />

        {/* Close - hidden in print */}
        {!forPrint && onClose && (
          <button
            onClick={onClose}
            aria-label="Close preview"
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
          <span className="text-xs font-medium text-white/85">
            {brand.name} itinerary
          </span>
        </div>

        {/* Title block */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-8">
          <h2 className="text-xl sm:text-3xl font-semibold tracking-tight text-white leading-[1.05] mb-2 sm:mb-3">
            {trip.name}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Pill icon={CalendarDots} forPrint={forPrint}>{dateRange} · {nights} night{nights !== 1 ? "s" : ""}</Pill>
            {trip.destination && <Pill icon={MapPin} forPrint={forPrint}>{trip.destination}</Pill>}
          </div>
          {(trip.travelers?.length ?? 0) > 0 && (
            <div className="mt-3 flex items-center gap-2.5">
              <div className="flex -space-x-2">
                {trip.travelers!.slice(0, 5).map(t => (
                  <PersonAvatar key={t.id} avatar={t.avatar} initials={t.initials} name={t.name} className="h-7 w-7 ring-2 ring-black/40" fallbackClassName="bg-secondary text-foreground text-[10px] font-semibold" />
                ))}
                {trip.travelers!.length > 5 && <span className="h-7 w-7 rounded-full ring-2 ring-black/40 bg-secondary text-foreground text-[10px] font-semibold flex items-center justify-center">+{trip.travelers!.length - 5}</span>}
              </div>
              <span className="text-xs sm:text-sm font-medium text-white">{trip.travelers!.length} traveller{trip.travelers!.length === 1 ? "" : "s"}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Metadata strip ── */}
      {hasMeta && (
        <div className={cn("flex flex-wrap items-center gap-2 sm:gap-3 px-4 sm:px-8 py-3 sm:py-4 border-b border-border", forPrint ? "bg-white" : "bg-card border-border")}>
          {trip.tripType && (
            <MetaChip icon={Tag} label="Type" value={trip.tripType} forPrint={forPrint} />
          )}
          {trip.paxCount && (
            <MetaChip icon={Users} label="Pax" value={trip.paxCount} forPrint={forPrint} />
          )}
          {trip.budget && (
            <MetaChip icon={CurrencyDollar} label="Budget" value={`${trip.currency ?? "USD"} ${trip.budget}`} forPrint={forPrint} />
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
        <div className={cn("px-4 sm:px-8 py-4 sm:py-6 border-b border-border", forPrint ? "bg-white" : "bg-card border-border")}>
          <div className="max-w-3xl mx-auto">
            <p className="mb-3 text-base font-semibold tracking-tight text-foreground">Good to know</p>
            {/* Same cards as the shared link and the app: icon and heading, then one fact per row */}
            {(() => {
              const renderCard = (item: (typeof travelerInfo)[number]) => {
                const { Icon: TopicIcon, warn } = topicIcon(item.title || "");
                return (
                  <div key={item.id} className="rounded-xl border border-border bg-background overflow-hidden print:break-inside-avoid">
                    <div className="flex items-center gap-2.5 px-3 py-2.5 sm:px-4">
                      <span className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0", warn ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-secondary text-foreground")}>
                        <TopicIcon aria-hidden="true" weight="fill" className="h-3.5 w-3.5" />
                      </span>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    </div>
                    {(item.body ? factRows(item.body) : []).map((row, i) => (
                      <div key={i} className="border-t border-border px-3 py-2.5 sm:px-4 text-xs sm:text-sm leading-relaxed">
                        {row.label && <p className="font-medium text-foreground">{row.label}</p>}
                        <p className={row.label ? "text-muted-foreground" : "text-foreground"}><Linkify text={row.text} /></p>
                      </div>
                    ))}
                  </div>
                );
              };
              // One column in list order on narrow screens; two columns of matching height on wide ones
              return (
                <>
                  <div className="flex flex-col gap-3 sm:hidden print:hidden">{travelerInfo.map(renderCard)}</div>
                  <div className="hidden gap-3 sm:flex items-start print:flex">
                    {balanceColumns(travelerInfo).map((col, i) => <div key={i} className="flex min-w-0 flex-1 flex-col gap-3">{col.map(renderCard)}</div>)}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Itinerary body ── */}
      <div className={cn(forPrint ? "px-8 py-8" : "px-3 sm:px-8 py-5 sm:py-8")}>
        <div className="max-w-3xl mx-auto">
          {/* The trip at a glance: days, then each kind of plan with the same circles as the itinerary below */}
          {trip.events.length > 0 && (
            <div className="mb-6 sm:mb-8 grid grid-cols-3 sm:flex rounded-xl border border-border bg-card overflow-hidden" style={forPrint ? { breakInside: "avoid" } : undefined}>
              {[
                { key: "days", n: grouped.length, label: grouped.length === 1 ? "day" : "days" },
                ...GLANCE_TYPES.map(({ type, one, many }) => {
                  const n = trip.events.filter(e => e.type === type).length;
                  return { key: type, type, n, label: n === 1 ? one : many };
                }).filter(t => t.n > 0),
                ...(totalDocs > 0 ? [{ key: "docs", n: totalDocs, label: totalDocs === 1 ? "document" : "documents", docs: true }] : []),
              ].map((t, i) => (
                <div key={t.key} className={cn("flex min-w-0 items-center gap-2.5 px-4 py-3 sm:flex-1 sm:px-3", i > 0 && "sm:border-l border-border")}>
                  {"type" in t && t.type ? <CategoryDot type={t.type} size="sm" />
                    : "docs" in t ? <span className="h-7 w-7 shrink-0 rounded-full bg-secondary flex items-center justify-center"><Paperclip className="h-3.5 w-3.5 text-muted-foreground" /></span> : null}
                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-none tabular-nums text-foreground">{t.n}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {grouped.length === 0 ? (
            <div className={cn("border border-dashed rounded-xl flex flex-col items-center justify-center py-12 sm:py-16", forPrint ? "bg-white border-border text-muted-foreground" : "bg-card border-border text-muted-foreground")}>
              <Compass className="h-7 w-7 mb-3 opacity-40" />
              <p className="text-xs font-medium">No events yet</p>
              <p className={cn("text-[10px] mt-1", forPrint ? "text-muted-foreground" : "text-muted-foreground")}>Add events in the workspace to see them here</p>
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
                        <p className={cn("text-xs sm:text-sm font-medium", forPrint ? "text-slate-900" : "text-foreground")}>
                          Day {dayIdx + 1} · {d.toLocaleDateString("en-US", { weekday: "long" })}
                        </p>
                        <p className={cn("text-[10px] sm:text-[11px]", forPrint ? "text-muted-foreground" : "text-muted-foreground")}>
                          {events.length} event{events.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    {/* Events */}
                    <div className={cn("border rounded-xl overflow-hidden divide-y", forPrint ? "bg-white border-border divide-slate-100" : "bg-card border-border divide-slate-100 dark:divide-border")}>
                      {events.map(ev => (
                        <PreviewEventCard key={ev.id} ev={ev} forPrint={forPrint} tripTz={tripTz} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className={cn("mt-8 sm:mt-10 pt-5 sm:pt-6 border-t text-center", forPrint ? "border-border" : "border-border")}>
            <p className={cn("text-[11px] font-medium", forPrint ? "text-muted-foreground" : "text-muted-foreground")}>
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
        className="max-w-4xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-4rem)] overflow-y-auto overflow-x-hidden bg-background border border-border rounded-xl p-0 gap-0 shadow-2xl"
        style={brand.accentColor ? { "--brand-rgb": hexToRgb(brand.accentColor) } as React.CSSProperties : undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{trip.name} - Preview</DialogTitle>
          <DialogDescription>Read-only itinerary preview</DialogDescription>
        </DialogHeader>
        {/* Sticky close: stays visible once the hero (with its own close) scrolls away */}
        <div className="sticky top-2 z-20 h-0 flex justify-end pr-2 pointer-events-none" aria-hidden="false">
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close preview"
            className="pointer-events-auto h-9 w-9 rounded-xl bg-card/90/90 backdrop-blur-md border border-border shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ItineraryPreviewContent trip={trip} />
      </DialogContent>
    </Dialog>
  );
}

const isTbd = (t: string) => /^tb[acd]$/i.test(t.trim());

/** "2026-11-07" and "2026-11-08" read as "7-8 Nov, 1 night"; check-in and check-out times stay as written */
function stayRange(checkin?: string, checkout?: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (checkin && checkout && iso.test(checkin) && iso.test(checkout)) {
    const a = parseTripDate(checkin), b = parseTripDate(checkout);
    const n = Math.round((b.getTime() - a.getTime()) / 86400000);
    const sameMonth = a.getMonth() === b.getMonth();
    const range = sameMonth
      ? `${a.getDate()}-${b.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
      : `${a.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - ${b.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
    return n > 0 ? `${range}, ${n} night${n === 1 ? "" : "s"}` : range;
  }
  return `Check in ${checkin || "TBC"}, check out ${checkout || "TBC"}`;
}

const GLANCE_TYPES: Array<{ type: TravelEvent["type"]; one: string; many: string }> = [
  { type: "flight", one: "flight", many: "flights" },
  { type: "hotel", one: "stay", many: "stays" },
  { type: "activity", one: "activity", many: "activities" },
  { type: "dining", one: "meal", many: "meals" },
  { type: "transfer", one: "transfer", many: "transfers" },
];

/* ── Pill badge (hero) ── */
function Pill({ icon: Icon, children, className, forPrint }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string; forPrint?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1.5 border border-white/10 rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5", forPrint ? "bg-white/15" : "bg-white/10 backdrop-blur-sm", className)}>
      <Icon className="h-3 w-3 text-brand" />
      <span className="text-[9px] sm:text-xs font-medium text-white/90">{children}</span>
    </div>
  );
}

/* ── Metadata chip ── */
function MetaChip({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; forPrint?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="text-xs sm:text-sm font-semibold truncate text-foreground">{value}</p>
      </div>
    </div>
  );
}

/* ── Event card ── */
function PreviewEventCard({ ev, forPrint, tripTz }: { ev: TravelEvent; forPrint?: boolean; tripTz?: string }) {
  const Icon = EVENT_ICONS[ev.type] ?? Compass;
  const typeLabel = ev.type === "flight" ? "Flight" : ev.type === "hotel" ? "Stay" : ev.type === "dining" ? "Dining" : ev.type === "transfer" ? "Transfer" : "Activity";

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-3 sm:p-4" style={forPrint ? { breakInside: "avoid", pageBreakInside: "avoid" } : undefined}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {/* Icon */}
        <div className={cn("h-8 w-8 sm:h-9 sm:w-9 rounded-lg flex items-center justify-center shrink-0", forPrint ? "bg-secondary" : "bg-secondary")}>
          <Icon className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", forPrint ? "text-muted-foreground" : "text-muted-foreground")} />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <p className={cn("text-[11px] font-medium mb-0.5", forPrint ? "text-muted-foreground" : "text-muted-foreground")}>{typeLabel}</p>
          <p className={cn("text-[13px] sm:text-sm font-bold leading-snug", forPrint ? "text-slate-900" : "text-foreground")}>{ev.title}</p>

          {/* Description */}
          {ev.description && (
            <p className={cn("mt-1 text-[11px] leading-relaxed", forPrint ? "text-muted-foreground line-clamp-3" : "text-muted-foreground line-clamp-3")}><Linkify text={ev.description} /></p>
          )}

          {/* Time + location */}
          <div className={cn("flex items-center gap-1.5 sm:gap-2 mt-1.5 text-[10px] sm:text-[11px] flex-wrap", forPrint ? "text-muted-foreground" : "text-muted-foreground")}>
            {ev.time && isTbd(ev.time) && (
              <span className="flex items-center gap-1 font-semibold"><Clock className="h-3 w-3" weight="regular" />Time to be confirmed</span>
            )}
            {ev.time && !isTbd(ev.time) && (
              <span className="flex items-center gap-1 font-semibold">
                <Clock className="h-3 w-3" weight="regular" />
                {ev.time}{ev.type === "flight" ? (() => { const tz = eventTz(ev, tripTz, "dep"); return tz ? ` ${tzAbbr(tz, ev.date)}` : ""; })() : ""}
                {ev.endTime && !isTbd(ev.endTime) && <> - {ev.endTime}{ev.type === "flight" ? (() => { const tz = eventTz(ev, tripTz, "arr"); return tz ? ` ${tzAbbr(tz, ev.endDate || ev.date)}` : ""; })() : ""}</>}
              </span>
            )}
            {ev.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" weight="regular" />
                <span className={forPrint ? "" : "truncate max-w-[180px] sm:max-w-[200px]"}>{ev.location}</span>
              </span>
            )}
            {ev.duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 opacity-60" weight="regular" />
                {ev.duration}
              </span>
            )}
          </div>

          {/* Type-specific details */}
          {ev.type === "flight" && (ev.airline || ev.flightNum || ev.terminal) && (
            <div className={cn("flex items-center gap-2 mt-2 flex-wrap text-[9px] sm:text-[10px] font-semibold", forPrint ? "text-muted-foreground" : "text-foreground/80")}>
              {(ev.airline || ev.flightNum) && (
                <span>{[ev.airline, ev.flightNum].filter(Boolean).join(" · ")}</span>
              )}
              {ev.terminal && <span>Terminal {ev.terminal}</span>}
              {ev.gate && <span>Gate {ev.gate}</span>}
              {ev.seatDetails && <span>Seat {ev.seatDetails}</span>}
            </div>
          )}

          {ev.type === "hotel" && (ev.roomType || ev.checkin || ev.checkout) && (
            <div className={cn("flex items-center gap-2 mt-2 flex-wrap text-[9px] sm:text-[10px] font-semibold", forPrint ? "text-muted-foreground" : "text-foreground/80")}>
              {ev.roomType && <span>{ev.roomType}</span>}
              {(ev.checkin || ev.checkout) && (
                <span className={forPrint ? "text-muted-foreground" : "text-muted-foreground"}>
                  {stayRange(ev.checkin, ev.checkout)}
                </span>
              )}
            </div>
          )}

          {ev.type === "transfer" && (ev.meetingPoint || ev.contactName || ev.contactPhone) && (
            <p className="mt-1.5 text-[11px] sm:text-xs font-medium text-foreground/80">
              {[ev.meetingPoint && `Meet at ${ev.meetingPoint}`, [ev.contactName, ev.contactPhone].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
            </p>
          )}

          {(ev.type === "dining" || ev.type === "activity") && ev.supplier && (
            <p className={cn("mt-1.5 text-[9px] sm:text-[10px]", forPrint ? "text-muted-foreground" : "text-muted-foreground")}>
              {ev.supplier}
            </p>
          )}

          {/* Bottom row: conf number, price, status */}
          {(ev.confNumber || ev.price || ev.status) && (
            <div className={cn("flex items-center gap-2 mt-2 flex-wrap text-[9px] sm:text-[10px]", forPrint ? "text-muted-foreground" : "text-muted-foreground")}>
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
                  className={cn("inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-medium px-2 py-0.5 rounded border transition-colors", forPrint ? "bg-secondary border-border text-muted-foreground" : "bg-background border-border text-muted-foreground hover:text-brand hover:border-brand/30")}
                >
                  <Paperclip className="h-2.5 w-2.5 shrink-0" weight="regular" />
                  <span className={forPrint ? "" : "truncate max-w-[120px] sm:max-w-[160px]"}>{doc.name}</span>
                </a>
              ))}
            </div>
          )}

          {/* Notes */}
          {ev.notes && (
            <p className={cn("mt-2 text-[10px] sm:text-[11px] italic leading-relaxed", forPrint ? "text-muted-foreground line-clamp-2" : "text-muted-foreground line-clamp-2")}>
              <Linkify text={ev.notes} />
            </p>
          )}
        </div>
      </div>

      {/* Image thumbnail */}
      {ev.image && (
        <img
          src={ev.image}
          style={{ objectPosition: objectPosition(ev.imagePosition) }}
          alt={ev.title}
          className="h-20 w-full sm:h-20 sm:w-28 rounded-xl object-cover shrink-0"
        />
      )}
    </div>
  );
}
