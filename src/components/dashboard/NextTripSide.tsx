import { useEffect, useState } from "react";
import { fetchTripMembers } from "@/services/firebaseTrips";
import { parseTripDate } from "@/lib/dates";
import { EVENT_ICONS, EVENT_TEXT_COLORS, type EventType } from "@/config/eventStyles";
import type { Trip } from "@/types";

/** The next trip at a glance: who's going, who's ready, and what happens first */
export function NextTripSide({ trip }: { trip: Trip }) {
  const [inApp, setInApp] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchTripMembers([trip.id]).then(members => {
      if (!cancelled) setInApp(new Set(members.map(m => m.linked_traveler_id || m.uid || m.device_id)).size);
    });
    return () => { cancelled = true; };
  }, [trip.id]);

  const travellers = trip.travelers ?? [];
  const invited = travellers.filter(t => t.invitedAt).length;
  const first = [...trip.events].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  const type = (first?.type ?? "activity") as EventType;
  const Icon = EVENT_ICONS[type];

  return (
    <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-border p-5 sm:p-6 flex flex-col justify-center gap-5">
      {travellers.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Travellers</p>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2 shrink-0" aria-hidden="true">
              {travellers.slice(0, 5).map(t => (
                <span key={t.id} className="h-8 w-8 rounded-full border-2 border-card bg-secondary overflow-hidden flex items-center justify-center text-[10px] font-semibold text-foreground">
                  {t.avatar ? <img src={t.avatar} alt="" className="h-full w-full object-cover" /> : t.initials}
                </span>
              ))}
            </div>
            <p className="text-sm text-muted-foreground min-w-0">
              <span className="font-semibold text-foreground">{invited} of {travellers.length}</span> invited
              {inApp !== null && <>, <span className="font-semibold text-foreground">{inApp}</span> in the app</>}
            </p>
          </div>
        </div>
      )}
      {first && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">First up</p>
          <div className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-full border border-border bg-background flex items-center justify-center shrink-0">
              <Icon className={`h-4 w-4 ${EVENT_TEXT_COLORS[type]}`} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground truncate">{first.title}</span>
              <span className="block text-xs text-muted-foreground">
                {parseTripDate(first.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}{first.time && first.time !== "TBD" ? `, ${first.time}` : ""}
              </span>
            </span>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {trip.status === "Draft" ? "Draft, not visible to travellers yet" : "Published to travellers"}
      </p>
    </div>
  );
}
