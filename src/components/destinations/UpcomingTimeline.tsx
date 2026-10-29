import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { parseTripDate } from "@/lib/dates";
import { travellerCount } from "@/lib/travelerSync";
import { ReportCard, EmptyNote } from "@/components/reports/ReportParts";
import type { Trip } from "@/types";

/** Where groups are heading next, month by month */
export function UpcomingTimeline({ trips, destinationOf }: { trips: Trip[]; destinationOf: (trip: Trip) => string }) {
  const navigate = useNavigate();
  const months = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const upcoming = trips.filter(t => parseTripDate(t.end) >= today).sort((a, b) => a.start.localeCompare(b.start));
    const groups: Array<{ label: string; trips: Trip[] }> = [];
    for (const t of upcoming) {
      const label = parseTripDate(t.start).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      const group = groups[groups.length - 1];
      if (group && group.label === label) group.trips.push(t);
      else groups.push({ label, trips: [t] });
    }
    return { groups, today };
  }, [trips]);

  return (
    <ReportCard title="Coming up" sub="Where groups are heading next">
      {months.groups.length === 0 ? <EmptyNote>No upcoming trips.</EmptyNote> : (
        <div className="space-y-5">
          {months.groups.map(g => (
            <div key={g.label}>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">{g.label}</p>
              {/* One column in date order, so you read straight down the calendar */}
              <ul className="-mx-2 divide-y divide-border">
                {g.trips.map(t => {
                  const start = parseTripDate(t.start), end = parseTripDate(t.end);
                  const live = start <= months.today;
                  const days = Math.round((start.getTime() - months.today.getTime()) / 86_400_000);
                  const nights = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
                  const pax = travellerCount(t);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/trip/${t.id}`)}
                        className="w-full flex items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-secondary/50 transition-colors outline-none focus-visible:bg-secondary"
                      >
                        <span className="w-10 shrink-0 text-center leading-none">
                          <span className="block text-lg font-semibold tabular-nums text-foreground">{start.getDate()}</span>
                          <span className="block text-[11px] text-muted-foreground mt-0.5">{start.toLocaleDateString("en-GB", { month: "short" })}</span>
                        </span>
                        <img src={t.image} alt="" className="h-10 w-10 rounded-lg object-cover bg-secondary shrink-0" loading="lazy" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground truncate">{t.name}</span>
                          <span className="block text-xs text-muted-foreground truncate">{destinationOf(t)}</span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className={`block text-sm tabular-nums ${live ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}>
                            {live ? "On now" : days === 1 ? "Tomorrow" : `In ${days} days`}
                          </span>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {nights} {nights === 1 ? "night" : "nights"}, {pax} {pax === 1 ? "traveller" : "travellers"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </ReportCard>
  );
}
