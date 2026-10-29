import { useEffect, useState } from "react";
import { fetchTripMembers, APP_MEMBERS_ERROR } from "@/services/firebaseTrips";
import { parseTripDate } from "@/lib/dates";
import { EVENT_ICONS, EVENT_TEXT_COLORS, type EventType } from "@/config/eventStyles";
import { publishedChanges } from "@/lib/tripChanges";
import type { Trip } from "@/types";

/** The next trip at a glance: who's going, who's ready, and what happens first */
export function NextTripSide({ trip }: { trip: Trip }) {
  const [inApp, setInApp] = useState<number | null>(null);
  const [inAppError, setInAppError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchTripMembers([trip.id]).then(members => {
      if (!cancelled) { setInApp(new Set(members.map(m => m.linked_traveler_id || m.uid || m.device_id)).size); setInAppError(false); }
    }).catch(() => { if (!cancelled) { setInApp(null); setInAppError(true); } });
    return () => { cancelled = true; };
  }, [trip.id]);

  const travellers = trip.travelers ?? [];
  const invited = travellers.filter(t => t.invitedAt).length;
  const first = [...trip.events].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  const type = (first?.type ?? "activity") as EventType;
  const Icon = EVENT_ICONS[type];

  const changes = trip.status !== "Draft" && trip.publishedSnapshot
    ? publishedChanges(trip.publishedSnapshot, { events: trip.events, start: trip.start, end: trip.end, info: trip.info }).length : 0;
  const copy = trip.status === "Draft" || !trip.publishedSnapshot ? { text: "Draft", warn: false }
    : changes ? { text: `${changes} ${changes === 1 ? "change" : "changes"} to publish`, warn: true } : { text: "Published", warn: false };

  // Label on the left, value on the right, one line each, so the panel reads like a checklist
  const row = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-xs text-muted-foreground pt-0.5 shrink-0">{label}</dt>
      <dd className="text-sm text-foreground text-right min-w-0">
        {value}
        {sub && <span className="block text-xs text-muted-foreground mt-0.5">{sub}</span>}
      </dd>
    </div>
  );

  return (
    <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-border p-5 sm:p-6 flex flex-col justify-center">
      <dl className="divide-y divide-border">
        {travellers.length > 0 && row("Travellers", (
          <span className="inline-flex items-center gap-2">
            <span className="flex -space-x-1.5" aria-hidden="true">
              {travellers.slice(0, 4).map(t => (
                <span key={t.id} className="h-6 w-6 rounded-full ring-2 ring-card bg-secondary overflow-hidden flex items-center justify-center text-[9px] font-semibold text-foreground">
                  {t.avatar ? <img src={t.avatar} alt="" className="h-full w-full object-cover" /> : t.initials}
                </span>
              ))}
            </span>
            <span className="tabular-nums">{travellers.length}</span>
          </span>
        ))}
        {travellers.length > 0 && row("Invited", <span className={`tabular-nums ${invited < travellers.length ? "text-amber-700 dark:text-amber-400" : ""}`}>{invited} of {travellers.length}</span>)}
        {travellers.length > 0 && row("In the app", inAppError ? <span className="text-xs text-amber-700 dark:text-amber-400">{APP_MEMBERS_ERROR}</span> : <span className="tabular-nums">{inApp === null ? "..." : `${inApp} of ${travellers.length}`}</span>)}
        {first && row("First up", (
          <span className="inline-flex items-center gap-1.5 max-w-[11rem]">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${EVENT_TEXT_COLORS[type]}`} />
            <span className="truncate">{first.title}</span>
          </span>
        ), `${parseTripDate(first.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}${first.time && first.time !== "TBD" ? `, ${first.time}` : ""}`)}
        {row("Travellers' copy", <span className={copy.warn ? "text-amber-700 dark:text-amber-400" : ""}>{copy.text}</span>)}
      </dl>
    </div>
  );
}
