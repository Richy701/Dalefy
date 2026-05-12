import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { CalendarDots, MapPin, Users, Compass, Clock, SpinnerGap, Check, CaretDown, AirplaneTilt, Terminal, Door, Info, FileText } from "@phosphor-icons/react";
import { Linkify } from "@/lib/linkify";
import { tzAbbr, destinationTz, eventTz } from "@/lib/timezone";
import { isFirebaseConfigured, firebaseDb } from "@/services/firebase";
import { doc, getDoc } from "firebase/firestore";
import type { Trip, TravelEvent } from "@/types";
import { resolvedBrand } from "@/config/brand";
import { hexToRgb } from "@/context/BrandContext";
import { fetchBrandingForTrip, type OrgBranding } from "@/services/firebaseBranding";
import { EVENT_ICONS, EVENT_HEX } from "@/config/eventStyles";
import { sortEvents } from "@/lib/sortEvents";

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
    info: ((row.info as Trip["info"]) ?? [])?.filter(i => !i.leaderOnly),
  };
}

function EventRow({ ev, tripTz }: { ev: TravelEvent; tripTz?: string }) {
  const [open, setOpen] = useState(false);
  const Icon = EVENT_ICONS[ev.type] ?? Compass;
  const color = EVENT_HEX[ev.type] ?? "#0bd2b5";
  const hasDetail = !!(ev.description || ev.notes || ev.image || ev.airline || ev.terminal || ev.arrTerminal || ev.status || ev.flightNum || ev.confNumber || ev.roomType);

  return (
    <div
      className={`transition-colors ${hasDetail ? "cursor-pointer hover:bg-slate-50/50 dark:hover:bg-white/[0.02]" : ""}`}
      onClick={() => hasDetail && setOpen(!open)}
    >
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border"
          style={{ backgroundColor: `${color}15`, borderColor: `${color}30` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{ev.title}</p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-[#888] flex-wrap">
            {ev.time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{ev.time}{(() => { const tz = eventTz(ev, tripTz, "dep"); return tz ? ` ${tzAbbr(tz, ev.date)}` : ""; })()}</span>}
            {ev.endTime && <span className="text-slate-400 dark:text-[#666]">-</span>}
            {ev.endTime && <span>{ev.endTime}{(() => { const tz = eventTz(ev, tripTz, "arr"); return tz ? ` ${tzAbbr(tz, ev.endDate || ev.date)}` : ""; })()}</span>}
            {ev.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /><span className="truncate max-w-[200px] sm:max-w-[300px]">{ev.location}</span></span>}
            {ev.duration && <span>{ev.duration}</span>}
          </div>
        </div>
        {hasDetail && (
          <CaretDown
            className={`h-3.5 w-3.5 text-slate-300 dark:text-[#444] shrink-0 mt-1 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        )}
      </div>

      {open && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0 ml-12 space-y-3">
          {ev.image && (
            <img src={ev.image} alt={ev.title} className="w-full h-40 sm:h-48 rounded-xl object-cover" />
          )}

          {(ev.airline || ev.flightNum || ev.terminal || ev.arrTerminal || ev.status) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
              {ev.airline && <span className="flex items-center gap-1 text-slate-600 dark:text-[#aaa]"><AirplaneTilt className="h-3 w-3" />{ev.airline}{ev.flightNum ? ` ${ev.flightNum}` : ""}</span>}
              {ev.terminal && <span className="flex items-center gap-1 text-slate-600 dark:text-[#aaa]"><Door className="h-3 w-3" />Dep T{ev.terminal}</span>}
              {ev.arrTerminal && <span className="flex items-center gap-1 text-slate-600 dark:text-[#aaa]"><Door className="h-3 w-3" />Arr T{ev.arrTerminal}</span>}
              {ev.status && <span className="flex items-center gap-1 text-slate-600 dark:text-[#aaa]"><Info className="h-3 w-3" />{ev.status}</span>}
            </div>
          )}

          {(ev.confNumber || ev.roomType) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
              {ev.roomType && <span className="text-slate-600 dark:text-[#aaa]">{ev.roomType}</span>}
              {ev.confNumber && <span className="text-slate-500 dark:text-[#777] font-mono">Ref: {ev.confNumber}</span>}
            </div>
          )}

          {ev.description && (
            <p className="text-[12px] leading-relaxed text-slate-600 dark:text-[#aaa]">{ev.description}</p>
          )}

          {ev.notes && (
            <p className="text-[11px] leading-relaxed text-slate-400 dark:text-[#666] italic">{ev.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function DaySection({ date, events, dayIdx, tripTz }: { date: string; events: TravelEvent[]; dayIdx: number; tripTz?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const d = new Date(date + "T12:00:00");

  return (
    <div>
      <div className="bg-slate-50 dark:bg-[#111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 w-full text-left cursor-pointer px-4 py-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-brand">
                Day {dayIdx + 1}
              </span>
              <span className="w-px h-3.5 bg-slate-300 dark:bg-[#333]" />
              <span className="text-[13px] font-bold text-slate-900 dark:text-white">
                {d.toLocaleDateString("en-GB", { weekday: "long" })} {ordinal(d.getDate())} {d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </span>
            </div>
            <p className="text-[10px] font-semibold text-slate-400 dark:text-[#666] uppercase tracking-wider mt-1">
              {events.length} event{events.length !== 1 ? "s" : ""}
            </p>
          </div>
          <CaretDown className={`h-3.5 w-3.5 text-slate-400 dark:text-[#555] transition-transform duration-200 shrink-0 ${collapsed ? "-rotate-90" : ""}`} />
        </button>
        {!collapsed && (
          <div className="divide-y divide-slate-100 dark:divide-[#1a1a1a] border-t border-slate-200 dark:border-[#1f1f1f]">
            {events.map(ev => (
              <EventRow key={ev.id} ev={ev} tripTz={tripTz} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SharedTripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewAsId, setViewAsId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [orgBranding, setOrgBranding] = useState<OrgBranding | null>(null);
  const brand = resolvedBrand(orgBranding ? { companyName: orgBranding.companyName, logoUrl: orgBranding.logoUrl, accentColor: orgBranding.accentColor } : null);

  useEffect(() => {
    if (!tripId || !isFirebaseConfigured()) {
      setError("Trip sharing requires Firebase to be configured.");
      setLoading(false);
      return;
    }

    getDoc(doc(firebaseDb(), "trips", tripId))
      .then((snap) => {
        if (!snap.exists()) {
          setError("Trip not found or no longer available.");
        } else {
          const t = rowToTrip({ id: snap.id, ...snap.data() });
          if (t.status !== "Published") {
            setError("This trip hasn't been published yet.");
          } else {
            setTrip(t);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Trip not found or no longer available.");
        setLoading(false);
      });

    fetchBrandingForTrip(tripId).then(b => setOrgBranding(b));
  }, [tripId]);

  const tripTz = useMemo(() => destinationTz(trip?.destination), [trip?.destination]);
  const hasTravelers = (trip?.travelers?.length ?? 0) > 0;
  const viewAsTraveler = useMemo(() => {
    if (!viewAsId || !trip?.travelers) return null;
    return trip.travelers.find(t => t.id === viewAsId) ?? null;
  }, [viewAsId, trip?.travelers]);

  const filteredEvents = useMemo(() => {
    if (!trip) return [];
    if (!viewAsId) return trip.events;
    return trip.events.filter(
      e => !e.assignedTo || e.assignedTo.length === 0 || e.assignedTo.includes(viewAsId)
    );
  }, [trip, viewAsId]);

  const grouped = useMemo(() => {
    const sorted = sortEvents(filteredEvents);
    const map: Record<string, TravelEvent[]> = {};
    for (const ev of sorted) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEvents]);

  const nights = useMemo(() => {
    if (!trip) return 0;
    return Math.ceil((new Date(trip.end).getTime() - new Date(trip.start).getTime()) / 86400000);
  }, [trip]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#050505] flex items-center justify-center">
        <SpinnerGap className="h-8 w-8 text-brand animate-spin" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#050505] flex flex-col items-center justify-center gap-4 px-6">
        <div className="h-16 w-16 rounded-2xl bg-white dark:bg-[#111] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center">
          <MapPin className="h-7 w-7 text-slate-300 dark:text-[#444]" />
        </div>
        <p className="text-sm font-bold text-slate-500 dark:text-[#888] uppercase tracking-wider text-center">{error}</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-100 dark:bg-[#050505]"
      style={brand.accentColor ? { "--brand-rgb": hexToRgb(brand.accentColor) } as React.CSSProperties : undefined}
    >
      {/* Hero */}
      <div className="relative h-[320px] sm:h-[400px] overflow-hidden">
        <img src={trip.image} alt={trip.name} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
          <div className="flex items-center gap-2 mb-2">
            {brand.logoUrl && (
              <img src={brand.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
            )}
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-white/80">
              {brand.name} · Itinerary
            </p>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold uppercase tracking-tight text-white leading-none mb-4">
            {trip.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
              <CalendarDots className="h-3 w-3 text-white/70" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">
                {new Date(trip.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" - "}
                {new Date(trip.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {" · "}{nights} nights
              </span>
            </div>
            {trip.destination && (
              <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
                <MapPin className="h-3 w-3 text-white/70" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">{trip.destination}</span>
              </div>
            )}
            {trip.attendees && (
              <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
                <Users className="h-3 w-3 text-white/70" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">{trip.attendees}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Itinerary */}
      <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
        <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm">
          {/* Traveler picker */}
          {hasTravelers && (
            <div className="mb-6">
              <div className="relative">
                <button
                  onClick={() => setPickerOpen(!pickerOpen)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                    viewAsId
                      ? "bg-brand/5 dark:bg-brand/10 border-brand/20"
                      : "bg-slate-50 dark:bg-[#111] border-slate-200 dark:border-[#1f1f1f] hover:border-brand/30"
                  }`}
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-[10px] font-black uppercase shrink-0 ${
                    viewAsId ? "bg-brand/15 text-brand" : "bg-slate-100 dark:bg-[#1a1a1a] text-slate-500 dark:text-[#888]"
                  }`}>
                    {viewAsTraveler ? viewAsTraveler.initials : <Users className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888]">
                      {viewAsId ? "Viewing as" : "Who are you?"}
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {viewAsTraveler ? viewAsTraveler.name : "Select your name to see your itinerary"}
                    </p>
                  </div>
                  <CaretDown className={`h-4 w-4 text-slate-400 dark:text-[#666] transition-transform duration-200 shrink-0 ${pickerOpen ? "rotate-180" : ""}`} />
                </button>

                {pickerOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-[#111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl shadow-2xl overflow-hidden z-20">
                    <button
                      onClick={() => { setViewAsId(null); setPickerOpen(false); }}
                      className={`w-full flex items-center gap-3 p-3 text-left transition-colors cursor-pointer ${
                        !viewAsId ? "bg-brand/5" : "hover:bg-slate-50 dark:hover:bg-[#0a0a0a]"
                      }`}
                    >
                      <div className="h-8 w-8 rounded-md bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center text-[9px] font-black text-slate-500 dark:text-[#888]">ALL</div>
                      <span className="text-xs font-bold text-slate-700 dark:text-[#ccc] uppercase tracking-wider">Everyone - Full itinerary</span>
                      {!viewAsId && <Check className="h-3.5 w-3.5 text-brand ml-auto" />}
                    </button>
                    <div className="h-px bg-slate-100 dark:bg-[#1a1a1a]" />
                    {trip.travelers!.map(t => (
                      <button
                        key={t.id}
                        onClick={() => { setViewAsId(t.id); setPickerOpen(false); }}
                        className={`w-full flex items-center gap-3 p-3 text-left transition-colors cursor-pointer ${
                          viewAsId === t.id ? "bg-brand/5" : "hover:bg-slate-50 dark:hover:bg-[#0a0a0a]"
                        }`}
                      >
                        <div className="h-8 w-8 rounded-md bg-brand/10 flex items-center justify-center text-[9px] font-black text-brand uppercase">{t.initials}</div>
                        <span className="text-xs font-bold text-slate-700 dark:text-[#ccc]">{t.name}</span>
                        {viewAsId === t.id && <Check className="h-3.5 w-3.5 text-brand ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {viewAsTraveler && (
                <p className="text-[10px] font-bold text-brand/60 uppercase tracking-wider mt-2 px-1">
                  Showing {filteredEvents.length} of {trip.events.length} events for {viewAsTraveler.name}
                </p>
              )}
            </div>
          )}

          {trip.info && trip.info.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-3.5 w-3.5 text-brand" />
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-brand">Trip Information</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {trip.info.map(item => (
                  <div key={item.id} className="rounded-xl p-3.5 bg-slate-50 dark:bg-[#111] border border-slate-100 dark:border-[#1a1a1a]">
                    <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-tight mb-1">{item.title}</p>
                    {item.body && (
                      <p className="text-[11px] leading-relaxed text-slate-600 dark:text-[#999] whitespace-pre-wrap"><Linkify text={item.body} /></p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-6">
            {grouped.map(([date, events], dayIdx) => (
              <DaySection key={date} date={date} events={events} dayIdx={dayIdx} tripTz={tripTz} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 text-center pb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 dark:text-[#555]">
            Powered by {brand.platformName}
          </p>
        </div>
      </div>
    </div>
  );
}
