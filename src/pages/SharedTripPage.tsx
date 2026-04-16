import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { CalendarDays, MapPin, Users, Plane, Hotel, Compass, Utensils, Clock, ArrowRight, Loader2 } from "lucide-react";
import { isSupabaseConfigured } from "@/services/supabase";
import { supabase } from "@/services/supabase";
import type { Trip, TravelEvent } from "@/types";

const EVENT_ICONS = { flight: Plane, hotel: Hotel, activity: Compass, dining: Utensils } as const;
const EVENT_COLORS = { flight: "#94a3b8", hotel: "#f59e0b", activity: "#0bd2b5", dining: "#f472b6" } as const;

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
  };
}

function EventRow({ ev }: { ev: TravelEvent }) {
  const Icon = EVENT_ICONS[ev.type] ?? Compass;
  const color = EVENT_COLORS[ev.type] ?? "#0bd2b5";

  return (
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
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{ev.time}</span>
          {ev.endTime && <span>→ {ev.endTime}</span>}
          {ev.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location}</span>}
          {ev.duration && <span>{ev.duration}</span>}
        </div>
      </div>
      {ev.image && (
        <img src={ev.image} alt={ev.title} className="h-14 w-20 rounded-lg object-cover shrink-0 hidden sm:block" />
      )}
    </div>
  );
}

export function SharedTripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tripId || !isSupabaseConfigured()) {
      setError("Trip sharing requires Supabase to be configured.");
      setLoading(false);
      return;
    }

    supabase
      .from("trips")
      .select("*")
      .eq("id", tripId)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError("Trip not found or no longer available.");
        } else {
          const t = rowToTrip(data);
          if (t.status !== "Published") {
            setError("This trip hasn't been published yet.");
          } else {
            setTrip(t);
          }
        }
        setLoading(false);
      });
  }, [tripId]);

  const grouped = useMemo(() => {
    if (!trip) return [];
    const map: Record<string, TravelEvent[]> = {};
    for (const ev of trip.events) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [trip]);

  const nights = useMemo(() => {
    if (!trip) return 0;
    return Math.ceil((new Date(trip.end).getTime() - new Date(trip.start).getTime()) / 86400000);
  }, [trip]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-[#0bd2b5] animate-spin" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-4 px-6">
        <div className="h-16 w-16 rounded-2xl bg-[#111] border border-[#1f1f1f] flex items-center justify-center">
          <MapPin className="h-7 w-7 text-[#444]" />
        </div>
        <p className="text-sm font-bold text-[#888] uppercase tracking-wider text-center">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050505]">
      {/* Hero */}
      <div className="relative h-[320px] sm:h-[400px] overflow-hidden">
        <img src={trip.image} alt={trip.name} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#0bd2b5] mb-2">
            DAF Adventures · Itinerary
          </p>
          <h1 className="text-2xl sm:text-4xl font-extrabold uppercase tracking-tight text-white leading-none mb-4">
            {trip.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
              <CalendarDays className="h-3 w-3 text-[#0bd2b5]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">
                {new Date(trip.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" — "}
                {new Date(trip.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {" · "}{nights} nights
              </span>
            </div>
            {trip.destination && (
              <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
                <MapPin className="h-3 w-3 text-[#0bd2b5]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">{trip.destination}</span>
              </div>
            )}
            {trip.attendees && (
              <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
                <Users className="h-3 w-3 text-[#0bd2b5]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">{trip.attendees}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Itinerary */}
      <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center gap-2 mb-6">
          <Compass className="h-4 w-4 text-[#0bd2b5]" />
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-[#888]">
            {trip.events.length} events · {grouped.length} days
          </span>
        </div>

        <div className="space-y-8">
          {grouped.map(([date, events], dayIdx) => {
            const d = new Date(date + "T12:00:00");
            return (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg bg-[#0bd2b5]/10 border border-[#0bd2b5]/20 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-black text-[#0bd2b5] leading-none">
                      {d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                    </span>
                    <span className="text-xs font-black text-[#0bd2b5] leading-none mt-0.5">{d.getDate()}</span>
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
                <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-[#1a1a1a]">
                  {events.map(ev => (
                    <EventRow key={ev.id} ev={ev} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 dark:text-[#555]">
            Powered by DAF Adventures
          </p>
        </div>
      </div>
    </div>
  );
}
