import type { ReactNode } from "react";
import { Check, EnvelopeSimple, LockSimple, PaperPlaneTilt, PencilSimple, Users } from "@phosphor-icons/react";
import { objectPosition } from "@/lib/imagePosition";
import { parseTripDate } from "@/lib/dates";
import { publishedChanges } from "@/lib/tripChanges";
import { travellerCount } from "@/lib/travelerSync";
import type { Trip } from "@/types";

/** "6 to 12 Nov", or "28 Dec to 10 Jan" across months */
function dateRange(trip: Trip) {
  const start = parseTripDate(trip.start), end = parseTripDate(trip.end);
  const dm = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear() ? `${start.getDate()} to ${dm(end)}` : `${dm(start)} to ${dm(end)}`;
}

/** When the trip is, said plainly: "In 9 days", "Tomorrow", "On now", "Ended" */
function whenLabel(trip: Trip, today: Date) {
  const start = parseTripDate(trip.start), end = parseTripDate(trip.end);
  if (end < today) return "Ended";
  if (start <= today) return "On now";
  const days = Math.round((start.getTime() - today.getTime()) / 86_400_000);
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}

/** Whether travellers have the latest: never published, changes waiting, or up to date */
function readiness(trip: Trip) {
  if (trip.status === "Draft" || !trip.publishedSnapshot) return { Icon: PencilSimple, text: "Draft, not published", tone: "text-muted-foreground" };
  const n = publishedChanges(trip.publishedSnapshot, { events: trip.events, start: trip.start, end: trip.end, info: trip.info }).length;
  return n
    ? { Icon: PaperPlaneTilt, text: `${n} ${n === 1 ? "change" : "changes"} to publish`, tone: "text-amber-600 dark:text-amber-400" }
    : { Icon: Check, text: "Published", tone: "text-emerald-600 dark:text-emerald-400" };
}

/** A trip in the dashboard grid: photo on top, the facts and how ready it is underneath */
export function TripCard({ trip, today, onOpen, menu }: { trip: Trip; today: Date; onOpen: () => void; menu?: ReactNode }) {
  const when = whenLabel(trip, today);
  const ready = readiness(trip);
  const travellers = trip.travelers ?? [];
  const invited = travellers.filter(t => t.invitedAt).length;
  const people = travellerCount(trip);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open trip ${trip.name}`}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="group relative flex flex-col rounded-xl overflow-hidden bg-card border border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <div className="relative aspect-[16/9] bg-secondary overflow-hidden">
        {trip.image && (
          <img src={trip.image} alt="" loading="lazy" style={{ objectPosition: objectPosition(trip.imagePosition) }} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        )}
        <span className={`absolute top-3 left-3 text-[11px] font-semibold px-2 py-1 rounded-md backdrop-blur-md ${when === "On now" ? "bg-emerald-500/90 text-white" : "bg-black/55 text-white"}`}>
          {when}
        </span>
        {menu && (
          <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            {menu}
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col p-4">
        <h3 className="text-base font-semibold tracking-tight text-foreground leading-snug line-clamp-2">
          {trip.private && <LockSimple className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-muted-foreground" weight="bold" aria-label="Private trip" />}
          {trip.name}
        </h3>
        {trip.destination && <p className="text-xs text-muted-foreground truncate mt-0.5">{trip.destination}</p>}
        <p className="mt-2 flex items-center gap-3 text-xs text-foreground/80 tabular-nums">
          <span>{dateRange(trip)}</span>
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-muted-foreground" /> {people}</span>
        </p>
        <div className="mt-auto pt-3">
          <div className="pt-3 border-t border-border flex items-center justify-between gap-2 text-xs">
            <span className={`inline-flex items-center gap-1.5 font-medium min-w-0 ${ready.tone}`}>
              <ready.Icon className="h-3.5 w-3.5 shrink-0" weight="bold" />
              <span className="truncate">{ready.text}</span>
            </span>
            {travellers.length > 0 && (
              <span className={`inline-flex items-center gap-1 tabular-nums shrink-0 ${invited < travellers.length ? "text-foreground" : "text-muted-foreground"}`} title="Travellers emailed the itinerary">
                <EnvelopeSimple className="h-3.5 w-3.5" /> {invited}/{travellers.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
