import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "@phosphor-icons/react";
import { parseTripDate } from "@/lib/dates";
import { travellerCount } from "@/lib/travelerSync";
import { ReportCard, EmptyNote } from "@/components/reports/ReportParts";
import { shortDate } from "@/components/reports/format";
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
              <div className="flex items-center gap-3 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{g.label}</p>
                <div className="h-px flex-1 bg-border" />
              </div>
              <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                {g.trips.map(t => {
                  const live = parseTripDate(t.start) <= months.today;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/trip/${t.id}`)}
                        className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-secondary/50 transition-colors"
                      >
                        <img src={t.image} alt="" className="h-10 w-10 rounded-lg object-cover bg-secondary shrink-0" loading="lazy" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-foreground truncate">{t.name}</span>
                          <span className="block text-xs text-muted-foreground truncate">{destinationOf(t)}</span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className={`block text-xs font-semibold tabular-nums ${live ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                            {live ? "On now" : `${shortDate(t.start)} to ${shortDate(t.end)}`}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Users className="h-3 w-3" /> {travellerCount(t)}
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
