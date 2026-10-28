import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { AirplaneTilt, CaretRight, Flag, ImageSquare, PaperPlaneTilt } from "@phosphor-icons/react";
import { firebaseDb, isFirebaseConfigured } from "@/services/firebase";
import { publishedChanges } from "@/lib/tripChanges";
import { parseTripDate } from "@/lib/dates";
import { timeAgo } from "@/lib/timeAgo";
import type { Trip, TravelEvent } from "@/types";
import { ReportCard, Figure, EmptyNote } from "./ReportParts";
import { shortDate } from "./format";

/** "14:30" or "2:30 PM" in minutes past midnight; null when there's no time */
function minutes(t?: string): number | null {
  const m = (t ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) h = h % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

/** How late the live flight data says a flight now leaves, in minutes */
function delayOf(ev: TravelEvent): number {
  const planned = minutes(ev.time), revised = minutes(ev.revisedTime);
  return planned == null || revised == null ? 0 : revised - planned;
}

interface MediaReport { trip_id: string; media_id: string; reported_at: string }

/** Publishing, live flights and the gallery, trip by trip */
export function TripsReport({ trips }: { trips: Trip[] }) {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<MediaReport[] | null>(null);
  const tripIds = useMemo(() => trips.map(t => t.id).sort().join(","), [trips]);

  // Photo reports from travellers, read a trip at a time the way the rules allow
  useEffect(() => {
    if (!isFirebaseConfigured() || !tripIds) return;
    let cancelled = false;
    Promise.all(tripIds.split(",").map(id =>
      getDocs(query(collection(firebaseDb(), "media_reports"), where("trip_id", "==", id))).then(s => s.docs.map(d => d.data() as MediaReport)).catch(() => []),
    )).then(lists => { if (!cancelled) setLoaded(lists.flat()); });
    return () => { cancelled = true; };
  }, [tripIds]);

  const reports = useMemo(() => (!isFirebaseConfigured() || !tripIds ? [] : loaded), [tripIds, loaded]);
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const current = useMemo(() => trips.filter(t => parseTripDate(t.end) >= today), [trips, today]);

  const publishing = useMemo(() => {
    const drafts = trips.filter(t => t.status === "Draft");
    const pending = trips
      .filter(t => t.status !== "Draft" && t.publishedSnapshot)
      .map(t => ({ trip: t, changes: publishedChanges(t.publishedSnapshot!, { events: t.events, start: t.start, end: t.end, info: t.info }) }))
      .filter(r => r.changes.length > 0);
    return { drafts, pending, published: trips.length - drafts.length };
  }, [trips]);

  const flights = useMemo(() => {
    const list = current.flatMap(t => t.events.filter(e => e.type === "flight").map(ev => ({ trip: t, ev, delay: delayOf(ev) })));
    const status = (s?: string) => (s ?? "").toLowerCase();
    return {
      total: list.length,
      delayed: list.filter(f => f.delay >= 15 || status(f.ev.status) === "delayed"),
      cancelled: list.filter(f => ["canceled", "cancelled", "diverted"].includes(status(f.ev.status))),
      gates: list.filter(f => f.ev.gate).length,
      landed: list.filter(f => f.ev.arrivedAt).length,
    };
  }, [current]);

  const gallery = useMemo(() => trips.map(t => {
    const photos = (t.media ?? []).filter(m => m.type === "image");
    return {
      trip: t,
      photos: photos.length,
      people: new Set(photos.map(p => p.uploaderId || p.uploadedBy).filter(Boolean)).size,
      latest: photos.map(p => p.uploadedAt).filter(Boolean).sort().pop() ?? null,
      reported: (reports ?? []).filter(r => r.trip_id === t.id && photos.some(p => p.id === r.media_id)).length,
    };
  }).filter(g => g.photos > 0).sort((a, b) => b.photos - a.photos), [trips, reports]);

  const openTrip = (id: string) => navigate(`/trip/${id}`);
  const reportedTotal = gallery.reduce((n, g) => n + g.reported, 0);

  return (
    <div className="space-y-6 mt-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Figure label="Published" value={`${publishing.published}`} sub={`${publishing.drafts.length} still in draft`} />
        <Figure label="Waiting to publish" value={`${publishing.pending.length}`} sub="Published trips with newer changes" />
        <Figure label="Flights tracked" value={`${flights.total}`} sub={`${flights.delayed.length} delayed, ${flights.gates} with a gate`} />
        <Figure label="Gallery photos" value={`${gallery.reduce((n, g) => n + g.photos, 0)}`} sub={reports === null ? "Checking reports" : `${reportedTotal} reported by travellers`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ReportCard title="Publishing" sub="Travellers only see what's published">
          {publishing.pending.length === 0 && publishing.drafts.length === 0 ? (
            <EmptyNote>Every trip is published and up to date.</EmptyNote>
          ) : (
            <ul className="divide-y divide-border -my-3">
              {publishing.pending.map(({ trip, changes }) => (
                <li key={trip.id}>
                  <button type="button" onClick={() => openTrip(trip.id)} className="w-full flex items-center gap-3 py-3 text-left rounded-lg hover:bg-secondary/50 px-2 -mx-2 transition-colors">
                    <PaperPlaneTilt className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground truncate">{trip.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">{changes.length === 1 ? changes[0] : `${changes.length} changes, including ${changes[0].toLowerCase()}`}</span>
                    </span>
                    <span className="text-xs font-medium text-link shrink-0">Publish</span>
                  </button>
                </li>
              ))}
              {publishing.drafts.map(trip => (
                <li key={trip.id}>
                  <button type="button" onClick={() => openTrip(trip.id)} className="w-full flex items-center gap-3 py-3 text-left rounded-lg hover:bg-secondary/50 px-2 -mx-2 transition-colors">
                    <span className="h-4 w-4 shrink-0 rounded border border-dashed border-muted-foreground/60" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground truncate">{trip.name}</span>
                      <span className="block text-xs text-muted-foreground">Draft, starts {shortDate(trip.start)}</span>
                    </span>
                    <CaretRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ReportCard>

        <ReportCard title="Flights" sub={`On current and upcoming trips${flights.landed ? `, ${flights.landed} landed so far` : ""}`}>
          {flights.delayed.length + flights.cancelled.length === 0 ? (
            <EmptyNote>{flights.total ? "No delays or cancellations right now." : "No flights on current or upcoming trips."}</EmptyNote>
          ) : (
            <ul className="divide-y divide-border -my-3">
              {[...flights.cancelled, ...flights.delayed.filter(f => !flights.cancelled.includes(f))].map(({ trip, ev, delay }) => (
                <li key={`${trip.id}-${ev.id}`}>
                  <button type="button" onClick={() => openTrip(trip.id)} className="w-full flex items-center gap-3 py-3 text-left rounded-lg hover:bg-secondary/50 px-2 -mx-2 transition-colors">
                    <AirplaneTilt className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground truncate">{[ev.airline, ev.flightNum].filter(Boolean).join(" ") || ev.title}</span>
                      <span className="block text-xs text-muted-foreground truncate">{trip.name}, {shortDate(ev.date)}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-xs font-semibold text-amber-600 dark:text-amber-400">{delay >= 15 ? `${delay} min late` : ev.status}</span>
                      {ev.revisedTime && <span className="block text-[11px] text-muted-foreground tabular-nums">{ev.time} now {ev.revisedTime}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ReportCard>
      </div>

      <ReportCard title="Gallery" sub="Photos travellers and your team have shared on each trip">
        {gallery.length === 0 ? <EmptyNote>No photos shared yet.</EmptyNote> : (
          <ul className="divide-y divide-border -my-3">
            {gallery.map(g => (
              <li key={g.trip.id}>
                <button type="button" onClick={() => navigate("/media")} className="w-full flex items-center gap-3 py-3 text-left rounded-lg hover:bg-secondary/50 px-2 -mx-2 transition-colors">
                  <ImageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground truncate">{g.trip.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {g.photos} {g.photos === 1 ? "photo" : "photos"}{g.people ? ` from ${g.people} ${g.people === 1 ? "person" : "people"}` : ""}{g.latest ? `, latest ${timeAgo(g.latest)}` : ""}
                    </span>
                  </span>
                  {g.reported > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 shrink-0">
                      <Flag className="h-3.5 w-3.5" /> {g.reported} reported
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </ReportCard>
    </div>
  );
}
