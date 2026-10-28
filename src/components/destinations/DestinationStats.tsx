import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CaretRight } from "@phosphor-icons/react";
import { parseTripDate } from "@/lib/dates";
import { travellerCount } from "@/lib/travelerSync";
import { ReportCard, EmptyNote } from "@/components/reports/ReportParts";
import { shortDate } from "@/components/reports/format";
import type { Trip } from "@/types";

export interface DestinationSummary { name: string; region: string; tripIds: string[] }

const nightsOf = (t: Trip) => Math.max(0, Math.round((parseTripDate(t.end).getTime() - parseTripDate(t.start).getTime()) / 86_400_000));

/** Every destination with its trips, travellers, nights and next departure */
export function DestinationStats({ destinations, trips }: { destinations: DestinationSummary[]; trips: Trip[] }) {
  const navigate = useNavigate();
  const rows = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return destinations.map(d => {
      const ts = trips.filter(t => d.tripIds.includes(t.id));
      const next = ts.filter(t => parseTripDate(t.end) >= today).sort((a, b) => a.start.localeCompare(b.start))[0];
      return {
        dest: d,
        trips: ts.length,
        travellers: ts.reduce((n, t) => n + travellerCount(t), 0),
        nights: ts.reduce((n, t) => n + nightsOf(t), 0),
        next,
      };
    }).sort((a, b) => (a.next?.start ?? "9999").localeCompare(b.next?.start ?? "9999") || b.trips - a.trips);
  }, [destinations, trips]);

  return (
    <ReportCard title="Destinations at a glance" sub="Trips, travellers and nights per destination, soonest departure first">
      {rows.length === 0 ? <EmptyNote>No destinations yet.</EmptyNote> : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-2 pb-2 font-medium">Destination</th>
                <th className="px-2 pb-2 font-medium text-right">Trips</th>
                <th className="px-2 pb-2 font-medium text-right">Travellers</th>
                <th className="px-2 pb-2 font-medium text-right">Nights</th>
                <th className="px-2 pb-2 font-medium">Next departure</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border border-t border-border">
              {rows.map(r => (
                <tr
                  key={r.dest.name}
                  onClick={() => r.next && navigate(`/trip/${r.next.id}`)}
                  className={r.next ? "cursor-pointer hover:bg-secondary/50 transition-colors" : ""}
                >
                  <td className="px-2 py-3">
                    <p className="font-semibold text-foreground truncate max-w-[260px]">{r.dest.name}</p>
                    {r.dest.region !== "Unknown" && <p className="text-xs text-muted-foreground">{r.dest.region}</p>}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-foreground">{r.trips}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-foreground">{r.travellers}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-foreground">{r.nights}</td>
                  <td className="px-2 py-3">
                    {r.next ? (
                      <>
                        <p className="text-foreground">{shortDate(r.next.start)}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.next.name}</p>
                      </>
                    ) : <span className="text-muted-foreground">None booked</span>}
                  </td>
                  <td className="px-2 py-3">{r.next && <CaretRight className="h-4 w-4 text-muted-foreground" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportCard>
  );
}
