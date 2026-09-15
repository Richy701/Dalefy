import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { MapPin, SpinnerGap, Check, CaretDown, AirplaneTilt, Printer, Paperclip, EnvelopeSimple, Phone, ArrowRight, CalendarBlank, Moon, Flag, Info, Bed, ListChecks } from "@phosphor-icons/react";
import { tabsListVariants } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Linkify } from "@/lib/linkify";
import { parseTripDate } from "@/lib/dates";
import { tzAbbr, eventTz } from "@/lib/timezone";
import { isFirebaseConfigured } from "@/services/firebase";
import { apiFetch, ApiError } from "@/lib/api";
import type { Trip, TravelEvent } from "@/types";
import { resolvedBrand } from "@/config/brand";
import { hexToRgb } from "@/context/BrandContext";
import { fetchBranding, type OrgBranding } from "@/services/firebaseBranding";
import { sortEvents } from "@/lib/sortEvents";
import { CategoryDot, CATEGORY_CLASS } from "@/components/ui/category-dot";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

type Brand = ReturnType<typeof resolvedBrand>;

function rowToTrip(row: Record<string, unknown>): Trip {
  return {
    id: row.id as string,
    name: row.name as string,
    attendees: row.attendees as string,
    destination: (row.destination as string) ?? undefined,
    paxCount: (row.pax_count as string) ?? undefined,
    start: row.start as string,
    end: row.end_date as string,
    status: row.status as Trip["status"],
    image: row.image as string,
    events: (row.events as Trip["events"]) ?? [],
    media: (row.media as Trip["media"]) ?? undefined,
    travelerIds: (row.traveler_ids as string[]) ?? undefined,
    travelers: (row.travelers as Trip["travelers"]) ?? undefined,
    organizer: (row.organizer as Trip["organizer"]) ?? undefined,
    info: ((row.info as Trip["info"]) ?? [])?.filter(i => !i.leaderOnly),
    documents: (row.documents as Trip["documents"]) ?? undefined,
  };
}

/* ---------- formatting helpers ---------- */

const DAY_MS = 86400000;

function fmtLong(date: string) {
  return parseTripDate(date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
function fmtShort(date: string) {
  return parseTripDate(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function fmtRange(start: string, end: string) {
  const s = parseTripDate(start);
  const e = parseTripDate(end);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const sPart = sameMonth
    ? s.toLocaleDateString("en-GB", { day: "numeric" })
    : s.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return `${sPart} - ${e.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
}
function fmtSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function isPlaceholderTime(t?: string) {
  return !t || /^tb[acd]$/i.test(t);
}

/** Departure and arrival from explicit airport fields, else "X to Y" in the location. */
function routeOf(ev: TravelEvent): { from: string; to: string } {
  const parts = ev.location?.split(/\s+to\s+|→/i).map(s => s.trim());
  return {
    from: ev.depAirport || parts?.[0] || "",
    to: ev.arrAirport || parts?.[1] || "",
  };
}
const isCode = (s: string) => /^[A-Z]{3,4}$/.test(s);

/** Trip phase relative to today, for the status line under the title. */
function tripPhase(start: string, end: string): string {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const s = parseTripDate(start);
  const e = parseTripDate(end);
  const untilStart = Math.round((s.getTime() - today.getTime()) / DAY_MS);
  if (untilStart > 1) return `Departs in ${untilStart} days`;
  if (untilStart === 1) return "Departs tomorrow";
  if (untilStart === 0) return "Departs today";
  if (today.getTime() <= e.getTime() + DAY_MS / 2) return "Trip in progress";
  return "Trip completed";
}

/* ---------- sections ---------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-lg font-semibold tracking-tight text-foreground">{children}</h2>;
}

function FlightCard({ ev }: { ev: TravelEvent }) {
  const { from, to } = routeOf(ev);
  // Only label a zone the event itself resolves; the trip fallback would mislabel the outbound leg.
  const depTz = tzAbbr(eventTz(ev, undefined, "dep"), ev.date);
  const arrTz = tzAbbr(eventTz(ev, undefined, "arr"), ev.endDate || ev.date);
  const carrier = [ev.airline, ev.flightNum].filter(Boolean).join(" ") || ev.title;
  const arrivesNextDay = ev.endDate && ev.endDate !== ev.date;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 print:break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3 text-xs sm:text-sm">
        <p className="font-medium text-foreground truncate">{carrier}</p>
        <p className="text-muted-foreground shrink-0">{fmtShort(ev.date)}</p>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="min-w-0">
          <p className={`font-semibold tracking-tight text-foreground ${isCode(from) ? "text-xl sm:text-2xl font-mono" : "text-base leading-tight"}`}>{from || "—"}</p>
          <p className="mt-1 text-sm text-foreground whitespace-nowrap">
            {isPlaceholderTime(ev.time) ? "" : ev.time}
            {depTz && !isPlaceholderTime(ev.time) && <span className="ml-1 text-xs text-muted-foreground">{depTz}</span>}
          </p>
          {ev.terminal && <p className="text-xs text-muted-foreground">Terminal {ev.terminal.replace(/^T/i, "")}</p>}
        </div>

        <div className="flex flex-col items-center gap-1 px-2 text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="h-px w-3 sm:w-6 bg-border" />
            <AirplaneTilt className="h-4 w-4 text-cat-flight" weight="fill" />
            <span className="h-px w-3 sm:w-6 bg-border" />
          </div>
          {ev.duration && <p className="text-[11px]">{ev.duration}</p>}
        </div>

        <div className="min-w-0 text-right">
          <p className={`font-semibold tracking-tight text-foreground ${isCode(to) ? "text-xl sm:text-2xl font-mono" : "text-base leading-tight"}`}>{to || "—"}</p>
          <p className="mt-1 text-sm text-foreground whitespace-nowrap">
            {isPlaceholderTime(ev.endTime) ? "" : ev.endTime}
            {arrTz && !isPlaceholderTime(ev.endTime) && <span className="ml-1 text-xs text-muted-foreground">{arrTz}</span>}
            {arrivesNextDay && <span className="ml-1 text-xs text-muted-foreground">+1</span>}
          </p>
          {ev.arrTerminal && <p className="text-xs text-muted-foreground">Terminal {ev.arrTerminal.replace(/^T/i, "")}</p>}
        </div>
      </div>

      {(ev.gate || ev.aircraft || ev.confNumber || ev.status) && (
        <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {ev.gate && <span>Gate {ev.gate}</span>}
          {ev.aircraft && <span>{ev.aircraft}</span>}
          {ev.confNumber && <span>Booking ref <span className="font-mono text-foreground">{ev.confNumber}</span></span>}
          {ev.status && <span>{ev.status}</span>}
        </div>
      )}
    </div>
  );
}

function StayCard({ ev, checkoutDate }: { ev: TravelEvent; checkoutDate?: string }) {
  const nights = checkoutDate ? Math.max(0, Math.round((parseTripDate(checkoutDate).getTime() - parseTripDate(ev.date).getTime()) / DAY_MS)) : 0;
  const checkin = ev.checkin || (isPlaceholderTime(ev.time) ? "" : ev.time);
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 print:break-inside-avoid">
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold tracking-tight text-foreground leading-tight">{ev.title}</p>
          {ev.location && <p className="mt-0.5 text-sm text-muted-foreground">{ev.location}</p>}
          {ev.roomType && <p className="mt-2 text-sm text-foreground">{ev.roomType}</p>}
        </div>
        {ev.image && (
          <img src={ev.image} alt="" className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg object-cover shrink-0 print:hidden" />
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Check in</p>
          <p className="mt-0.5 text-foreground">{fmtShort(ev.date)}{checkin ? ` · ${checkin}` : ""}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Check out</p>
          <p className="mt-0.5 text-foreground">
            {checkoutDate ? fmtShort(checkoutDate) : "—"}{ev.checkout ? ` · ${ev.checkout}` : ""}
          </p>
        </div>
      </div>
      {(nights > 0 || ev.confNumber || ev.status) && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {nights > 0 && <span>{nights} night{nights !== 1 ? "s" : ""}</span>}
          {ev.confNumber && <span>Booking ref <span className="font-mono text-foreground">{ev.confNumber}</span></span>}
          {ev.status && <span>{ev.status}</span>}
        </div>
      )}
    </div>
  );
}

function eventMeta(ev: TravelEvent): string {
  if (ev.type === "flight") {
    const { from, to } = routeOf(ev);
    const route = from && to ? `${from} to ${to}` : ev.location;
    const carrier = [ev.airline, ev.flightNum].filter(Boolean).join(" ");
    const titled = ev.flightNum && ev.title.includes(ev.flightNum);
    return [titled ? "" : carrier, route, ev.duration].filter(Boolean).join(" · ");
  }
  if (ev.type === "hotel") {
    return [ev.location, ev.roomType].filter(Boolean).join(" · ");
  }
  const until = ev.endTime && !isPlaceholderTime(ev.endTime) ? `until ${ev.endTime}` : "";
  return [ev.location, ev.duration, until].filter(Boolean).join(" · ");
}

function TimelineRow({ ev, last }: { ev: TravelEvent; last: boolean }) {
  const label = ev.type === "hotel" ? "Check in" : CATEGORY_CLASS[ev.type]?.label;
  const time = isPlaceholderTime(ev.time) ? "" : ev.time;
  return (
    <div className="relative sm:grid sm:grid-cols-[4.5rem_2.25rem_minmax(0,1fr)] gap-x-2 print:break-inside-avoid">
      <p className="hidden sm:block pt-1.5 text-sm font-medium text-foreground tabular-nums">{time}</p>
      <div className="absolute left-0 top-1.5 sm:static flex flex-col items-center">
        <CategoryDot type={ev.type} transferType={ev.transferType} size="md" />
        {!last && <span className="hidden sm:block w-px flex-1 bg-border my-1.5" />}
      </div>
      <div className={`min-w-0 break-words pt-1.5 ${last ? "pb-1" : "pb-6"}`}>
        {time && <p className="mb-1 pl-11 text-xs font-medium text-muted-foreground tabular-nums sm:hidden">{time}</p>}
        <p className="min-h-8 pl-11 sm:min-h-0 sm:pl-0 text-sm font-medium text-foreground leading-snug">
          {ev.title}
          {label && ev.type !== "activity" && <span className="ml-2 text-xs font-normal text-muted-foreground">{label}</span>}
        </p>
        {eventMeta(ev) && <p className="mt-0.5 text-sm text-muted-foreground">{eventMeta(ev)}</p>}
        {ev.description && <p className="mt-2 text-sm leading-relaxed text-foreground/80"><Linkify text={ev.description} /></p>}
        {ev.image && ev.type !== "hotel" && (
          <img src={ev.image} alt="" className="mt-3 mx-auto sm:mx-0 w-full sm:max-w-sm aspect-[16/9] rounded-lg object-cover print:hidden" />
        )}
        {ev.documents && ev.documents.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {ev.documents.map(doc => (
              <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
                <Paperclip className="h-3.5 w-3.5" />{doc.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewCell({ label, value, icon, prominent = false }: { label: string; value: React.ReactNode; icon: React.ReactNode; prominent?: boolean }) {
  return (
    <div className="min-w-0 px-4 py-5 sm:px-6 sm:py-6">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{icon}{label}</p>
      <p className={`mt-3 tracking-tight text-foreground ${prominent ? "text-xl sm:text-2xl font-semibold" : "text-base font-medium"}`}>{value}</p>
    </div>
  );
}

/* ---------- the document ---------- */

export function SharedTripView({ trip, brand }: { trip: Trip; brand: Brand }) {
  const [activeSection, setActiveSection] = useState(trip.info?.length ? "information" : "schedule");
  const [viewAsId, setViewAsId] = useState<string | null>(null);
  const travelers = trip.travelers ?? [];
  const viewAsTraveler = viewAsId ? travelers.find(t => t.id === viewAsId) ?? null : null;

  const visibleEvents = useMemo(() => {
    const sorted = sortEvents(trip.events);
    if (!viewAsId) return sorted;
    return sorted.filter(e => !e.assignedTo || e.assignedTo.length === 0 || e.assignedTo.includes(viewAsId));
  }, [trip.events, viewAsId]);

  const days = useMemo(() => {
    const map = new Map<string, TravelEvent[]>();
    for (const ev of visibleEvents) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visibleEvents]);

  const flights = useMemo(() => visibleEvents.filter(e => e.type === "flight"), [visibleEvents]);
  const stays = useMemo(() => {
    const hotels = visibleEvents.filter(e => e.type === "hotel");
    return hotels.map((h, i) => ({
      ev: h,
      checkoutDate: h.endDate || hotels[i + 1]?.date || trip.end,
    }));
  }, [visibleEvents, trip.end]);

  const nights = Math.max(0, Math.round((parseTripDate(trip.end).getTime() - parseTripDate(trip.start).getTime()) / DAY_MS));
  const org = trip.organizer;
  const hasDetails = !!(flights.length || stays.length || org?.name || trip.documents?.length);
  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  useEffect(() => {
    const ids = ["information", "schedule", "flights", "stays", "documents"];
    let frame = 0;
    const update = () => {
      frame = 0;
      const sections = ids.map(id => document.getElementById(id)).filter((element): element is HTMLElement => !!element);
      const current = sections.filter(element => element.getBoundingClientRect().top <= 160).at(-1) || sections[0];
      if (current) setActiveSection(current.id);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [trip, viewAsId]);
  const dayNumber = (date: string) => Math.round((parseTripDate(date).getTime() - parseTripDate(trip.start).getTime()) / DAY_MS) + 1;

  return (
    <div
      className="min-h-dvh w-full bg-background text-foreground print:bg-white"
      style={brand.accentColor ? { "--brand-rgb": hexToRgb(brand.accentColor) } as React.CSSProperties : undefined}
    >
      <div className="w-full px-4 sm:px-8 lg:px-10 xl:px-14 pt-4 sm:pt-6 pb-10 sm:pb-16 print:max-w-none print:p-0">
        {/* Masthead */}
        <header className="flex items-center justify-between gap-4 pb-4 sm:pb-6 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            {brand.logoUrl && <img src={brand.logoUrl} alt="" className="h-9 w-auto max-w-[140px] shrink-0 object-contain" />}
            <p className="text-base font-semibold tracking-tight text-foreground truncate">{brand.name}</p>
          </div>
          <Button variant="outline"
            type="button"
            onClick={() => window.print()}
            className="print:hidden min-h-11 gap-2 px-3 sm:px-4 shrink-0"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print or save PDF</span>
            <span className="sm:hidden">Print</span>
          </Button>
        </header>

        <section aria-labelledby="trip-title" className="flex flex-col items-start gap-6 py-6 sm:py-8 print:block">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Travel itinerary</p>
            <h1 id="trip-title" className="mt-2 max-w-[20ch] break-words text-3xl sm:text-4xl xl:text-4xl font-semibold tracking-tight leading-[1.1] text-foreground">{trip.name}</h1>
            {trip.destination && <p className="mt-4 text-base sm:text-lg text-muted-foreground">{trip.destination}</p>}
            <p className="mt-2 text-sm sm:text-base text-muted-foreground">{fmtRange(trip.start, trip.end)}</p>
          </div>
          {trip.image && <img src={trip.image} alt="" className="w-full aspect-[16/9] sm:aspect-[2/1] lg:aspect-[3/1] max-h-[420px] rounded-xl object-cover bg-secondary print:hidden" />}
        </section>

        {/* Overview */}
        <div className="overflow-hidden rounded-xl border border-border border-t-2 border-t-brand bg-card grid grid-cols-2 sm:grid-cols-4 [&>div:nth-child(even)]:border-l [&>div:nth-child(even)]:border-border [&>div:nth-child(n+3)]:border-t [&>div:nth-child(n+3)]:border-border sm:[&>div:nth-child(n+3)]:border-t-0 sm:[&>div+div]:border-l sm:[&>div+div]:border-border">
          <OverviewCell label="Departure" value={fmtShort(trip.start)} icon={<AirplaneTilt aria-hidden="true" className="h-4 w-4" />} prominent />
          <OverviewCell label="Return" value={fmtShort(trip.end)} icon={<CalendarBlank aria-hidden="true" className="h-4 w-4" />} prominent />
          <OverviewCell label="Duration" value={`${nights} night${nights !== 1 ? "s" : ""}`} icon={<Moon aria-hidden="true" className="h-4 w-4" />} prominent />
          <OverviewCell label="Your trip" value={tripPhase(trip.start, trip.end)} icon={<Flag aria-hidden="true" className="h-4 w-4" />} />
        </div>

        <nav aria-label="Itinerary sections" className="sticky top-0 z-10 -mx-4 mt-5 overflow-x-auto bg-background px-4 py-3 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10 xl:-mx-14 xl:px-14 print:hidden">
          <div className={tabsListVariants({ className: "gap-1 p-1" })}>
          {[{ id: "information", label: "Good to know", icon: Info, show: !!trip.info?.length }, { id: "schedule", label: "Itinerary", icon: ListChecks, show: true }, { id: "flights", label: "Flights", icon: AirplaneTilt, show: flights.length > 0 }, { id: "stays", label: "Stays", icon: Bed, show: stays.length > 0 }, { id: "documents", label: "Documents", icon: Paperclip, show: !!trip.documents?.length }].filter(section => section.show).map(section => (
            <Button key={section.id} variant="ghost" aria-current={activeSection === section.id ? "location" : undefined} className={`min-h-11 shrink-0 gap-2 rounded-md px-4 text-sm ${activeSection === section.id ? "bg-background text-foreground shadow-sm hover:bg-background" : "text-muted-foreground"}`} onClick={() => { setActiveSection(section.id); jumpTo(section.id); }}><section.icon aria-hidden="true" className="h-4 w-4" />{section.label}</Button>
          ))}
          </div>
        </nav>

        {/* Traveller picker */}
        {travelers.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <p className="text-sm text-muted-foreground">
              {viewAsTraveler ? `Showing ${visibleEvents.length} of ${trip.events.length} items for ${viewAsTraveler.name}` : "Showing the full group itinerary"}
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-2 min-h-11 max-w-full pl-3 pr-2.5 rounded-lg border border-border bg-card text-sm text-foreground hover:bg-secondary transition-colors">
                {viewAsTraveler ? viewAsTraveler.name : "Everyone"}
                <CaretDown className="h-3.5 w-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card border border-border text-foreground rounded-xl shadow-xl p-1 min-w-[220px] max-h-80 overflow-y-auto">
                <DropdownMenuItem onClick={() => setViewAsId(null)} className="gap-2 p-2 rounded-lg text-sm hover:bg-secondary">
                  <span className="flex-1">Everyone</span>
                  {!viewAsId && <Check className="h-4 w-4 text-brand" />}
                </DropdownMenuItem>
                <div className="my-1 h-px bg-border" />
                {travelers.map(t => (
                  <DropdownMenuItem key={t.id} onClick={() => setViewAsId(t.id)} className="gap-2 p-2 rounded-lg text-sm hover:bg-secondary">
                    <span className="flex-1">{t.name}</span>
                    {viewAsId === t.id && <Check className="h-4 w-4 text-brand" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <div className="mt-8 min-w-0 space-y-10 print:block">
          <main className="min-w-0 space-y-10">
        {/* Good to know */}
        {trip.info && trip.info.length > 0 && (
          <section id="information" className="min-w-0 scroll-mt-24">
            <SectionTitle>Good to know</SectionTitle>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {trip.info.map(item => (
                <div key={item.id} className="p-4 sm:p-5 print:break-inside-avoid">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  {item.body && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap"><Linkify text={item.body} /></p>}
                  {item.deadline && <p className="mt-2 text-xs text-muted-foreground">Due {fmtShort(item.deadline)}</p>}
                  {item.actionUrl && (
                    <a href={item.actionUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-brand hover:underline">
                      {item.actionLabel || "Open link"}<ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {item.documents && item.documents.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {item.documents.map(doc => (
                        <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
                          <Paperclip className="h-3.5 w-3.5" />{doc.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Day by day */}
        {days.length > 0 && (
          <section id="schedule" aria-labelledby="daily-schedule" className="min-w-0 scroll-mt-24">
            <h2 id="daily-schedule" className="mb-4 text-lg font-semibold tracking-tight text-foreground">Day by day</h2>

            {days.length > 1 && (
              <div className="print:hidden mb-6 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
                {days.map(([date]) => (
                  <Button
                    variant="outline"
                    key={date}
                    onClick={() => jumpTo(`day-${date}`)}
                    className="min-h-11 shrink-0 rounded-lg bg-card px-3 text-xs"
                  >
                    <span className="text-muted-foreground">Day {dayNumber(date)}</span>
                    <span className="mx-1.5 text-border">|</span>
                    {parseTripDate(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
                  </Button>
                ))}
              </div>
            )}

            <div className="space-y-8">
              {days.map(([date, events]) => (
                <div key={date} id={`day-${date}`} className="scroll-mt-24 rounded-xl border border-border bg-card p-4 sm:p-6 print:border-0 print:p-0 print:break-inside-avoid">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-3 mb-4 border-b border-border">
                    <p className="text-sm font-medium text-muted-foreground tabular-nums">Day {dayNumber(date)}</p>
                    <h3 className="text-base font-semibold tracking-tight text-foreground">{fmtLong(date)}</h3>
                  </div>
                  <div>
                    {events.map((ev, i) => <TimelineRow key={ev.id} ev={ev} last={i === events.length - 1} />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {days.length === 0 && (
          <div className="mt-10 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No itinerary items yet.</p>
          </div>
        )}

          </main>
          {hasDetails && <aside aria-label="Trip details" className="min-w-0 space-y-8 print:mt-8">
        {/* Flights */}
        {flights.length > 0 && (
          <section id="flights" className="min-w-0 scroll-mt-24">
            <SectionTitle>Flights</SectionTitle>
            <div className="space-y-3">
              {flights.map(ev => <FlightCard key={ev.id} ev={ev} />)}
            </div>
          </section>
        )}

        {/* Stays */}
        {stays.length > 0 && (
          <section id="stays" className="min-w-0 scroll-mt-24">
            <SectionTitle>Where you're staying</SectionTitle>
            <div className="space-y-3">
              {stays.map(({ ev, checkoutDate }) => <StayCard key={ev.id} ev={ev} checkoutDate={checkoutDate} />)}
            </div>
          </section>
        )}

        {/* Organiser */}
        {org?.name && (
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 print:break-inside-avoid">
            <div className="flex items-center gap-3">
              {org.avatar ? (
                <img src={org.avatar} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-brand/15 text-brand flex items-center justify-center text-sm font-semibold shrink-0">
                  {org.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Your travel organiser</p>
                <p className="text-sm font-medium text-foreground">{org.name}</p>
                {(org.role || org.company) && <p className="text-sm text-muted-foreground">{[org.role, org.company].filter(Boolean).join(", ")}</p>}
              </div>
            </div>
            {(org.email || org.phone) && (
              <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {org.phone && <a href={`tel:${org.phone}`} className="inline-flex min-h-11 items-center gap-1.5 break-all text-brand hover:underline"><Phone className="h-4 w-4" />{org.phone}</a>}
                {org.email && <a href={`mailto:${org.email}`} className="inline-flex min-h-11 items-center gap-1.5 break-all text-brand hover:underline"><EnvelopeSimple className="h-4 w-4" />{org.email}</a>}
              </div>
            )}
          </div>
        )}

        {/* Documents */}
        {trip.documents && trip.documents.length > 0 && (
          <section id="documents" className="min-w-0 scroll-mt-24">
            <SectionTitle>Documents</SectionTitle>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {trip.documents.map(doc => (
                <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-5 py-3.5 hover:bg-secondary transition-colors">
                  <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground truncate flex-1">{doc.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtSize(doc.size)}</span>
                </a>
              ))}
            </div>
          </section>
        )}

          </aside>}
        </div>

        {/* Footer */}
        <footer className="mt-14 pt-6 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>Prepared by {brand.name}</p>
          <p className="flex items-center gap-3">
            <span>Powered by {brand.platformName}</span>
            <a href="/privacy.html" className="hover:text-foreground">Privacy</a>
            <a href="/terms.html" className="hover:text-foreground">Terms</a>
          </p>
        </footer>
      </div>
    </div>
  );
}

/* ---------- page: loads and hands off ---------- */

export function SharedTripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorKind, setErrorKind] = useState<"unavailable" | "unpublished" | "network" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [orgBranding, setOrgBranding] = useState<OrgBranding | null>(null);
  const brand = resolvedBrand(orgBranding ? { companyName: orgBranding.companyName, logoUrl: orgBranding.logoUrl, accentColor: orgBranding.accentColor } : null);

  // The document is always light. Restore the viewer's theme when leaving.
  useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains("dark");
    html.classList.remove("dark");
    html.classList.add("light");
    return () => {
      if (wasDark) {
        html.classList.remove("light");
        html.classList.add("dark");
      }
    };
  }, []);

  useEffect(() => {
    if (!tripId || !isFirebaseConfigured()) {
      setError("This itinerary link isn't available right now.");
      setErrorKind("unavailable");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    setErrorKind(null);

    // Resolve branding from the sanitized trip's organization, never its private record.
    apiFetch<{ trip: Record<string, unknown> }>(`/api/trip?id=${encodeURIComponent(tripId)}`)
      .then(async ({ trip: row }) => {
        const b = typeof row?.organization_id === "string" ? await fetchBranding(row.organization_id) : null;
        if (cancelled) return;
        setOrgBranding(b);
        if (!row) {
          setError("We couldn't find this itinerary. The link may be out of date.");
          setErrorKind("unavailable");
        } else {
          const t = rowToTrip(row);
          if (t.status !== "Published") {
            setError("Your itinerary isn't ready yet. Your travel organiser is still finalising it.");
            setErrorKind("unpublished");
          } else {
            setTrip(t);
          }
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
        if (code === "permission-denied" || (err instanceof ApiError && err.status === 404)) {
          setError("Your itinerary isn't ready yet. Your travel organiser is still finalising it.");
          setErrorKind("unpublished");
        } else {
          setError("We couldn't load your itinerary. Check your connection and try again.");
          setErrorKind("network");
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tripId, reloadKey]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <SpinnerGap className="h-6 w-6 text-brand animate-spin" />
        <p className="text-sm text-muted-foreground">Loading your itinerary</p>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-card border border-border flex items-center justify-center">
          <MapPin className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="max-w-sm space-y-2">
          <p className="text-lg font-semibold tracking-tight text-foreground">
            {errorKind === "unpublished" ? "Almost there" : errorKind === "network" ? "Connection problem" : "Itinerary unavailable"}
          </p>
          <p className="text-sm text-muted-foreground">{error}</p>
          {errorKind === "unpublished" && (
            <p className="text-sm text-muted-foreground">Check back soon, or contact your travel organiser if you think this is a mistake.</p>
          )}
        </div>
        {errorKind === "network" && (
          <button
            type="button"
            onClick={() => setReloadKey(k => k + 1)}
            className="h-10 px-5 rounded-lg bg-brand text-black text-sm font-medium hover:opacity-90"
          >
            Try again
          </button>
        )}
        <p className="text-xs text-muted-foreground">Powered by {brand.platformName}</p>
      </div>
    );
  }

  return <SharedTripView trip={trip} brand={brand} />;
}
