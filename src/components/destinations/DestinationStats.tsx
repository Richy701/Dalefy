import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CaretRight } from "@phosphor-icons/react";
import { parseTripDate } from "@/lib/dates";
import { travellerCount } from "@/lib/travelerSync";
import { objectPosition } from "@/lib/imagePosition";
import { ReportCard, EmptyNote } from "@/components/reports/ReportParts";
import { shortDate } from "@/components/reports/format";
import type { Trip } from "@/types";

export interface DestinationSummary { name: string; region: string; tripIds: string[] }

const nightsOf = (t: Trip) => Math.max(0, Math.round((parseTripDate(t.end).getTime() - parseTripDate(t.start).getTime()) / 86_400_000));
/** Destinations taken from a flight's arrival can be bare airport codes like "BGI" */
const isAirportCode = (name: string) => /^[A-Z]{3}$/.test(name.trim());

/** Every destination with its photo, people, nights and when it's next visited */
export function DestinationStats({ destinations, trips }: { destinations: DestinationSummary[]; trips: Trip[] }) {
  const navigate = useNavigate();
  const rows = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return destinations.map(d => {
      const ts = trips.filter(t => d.tripIds.includes(t.id)).sort((a, b) => a.start.localeCompare(b.start));
      const next = ts.find(t => parseTripDate(t.end) >= today);
      const last = [...ts].reverse().find(t => parseTripDate(t.end) < today);
      const photo = (next ?? ts[ts.length - 1]) as Trip | undefined;
      const days = next ? Math.round((parseTripDate(next.start).getTime() - today.getTime()) / 86_400_000) : null;
      // A code reads better as its country ("Barbados") once the lookup has found it
      const code = isAirportCode(d.name);
      return {
        dest: d,
        title: code && d.region !== "Unknown" ? d.region : d.name,
        sub: code ? `${d.region !== "Unknown" ? "" : "Airport "}${d.name}` : d.region !== "Unknown" && d.region !== d.name ? d.region : "",
        trips: ts.length,
        travellers: ts.reduce((n, t) => n + travellerCount(t), 0),
        nights: ts.reduce((n, t) => n + nightsOf(t), 0),
        next, last, photo, days,
      };
    }).sort((a, b) => (a.next?.start ?? "9999").localeCompare(b.next?.start ?? "9999") || (b.last?.end ?? "").localeCompare(a.last?.end ?? ""));
  }, [destinations, trips]);

  const when = (days: number) => (days > 1 ? `in ${days} days` : days === 1 ? "tomorrow" : days === 0 ? "today" : "under way");

  return (
    <ReportCard title="Destinations at a glance" sub="Where you're going next, soonest first, then where you've been">
      {rows.length === 0 ? <EmptyNote>No destinations yet.</EmptyNote> : (
        <ul className="-mx-4 sm:-mx-6 divide-y divide-border border-t border-border">
          {rows.map(r => {
            const target = r.next ?? r.last;
            const facts = [
              r.trips > 1 && `${r.trips} trips`,
              `${r.travellers} ${r.travellers === 1 ? "traveller" : "travellers"}`,
              `${r.nights} ${r.nights === 1 ? "night" : "nights"}`,
            ].filter(Boolean).join(", ");
            return (
              <li key={r.dest.name}>
                <button
                  type="button"
                  disabled={!target}
                  onClick={() => target && navigate(`/trip/${target.id}`)}
                  className="group w-full grid grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:grid-cols-[2.5rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_1rem] items-center gap-x-4 px-4 sm:px-6 py-3 text-left hover:bg-secondary/50 transition-colors outline-none focus-visible:bg-secondary disabled:cursor-default"
                >
                  {r.photo?.image
                    ? <img src={r.photo.image} alt="" loading="lazy" className="h-10 w-10 rounded-lg object-cover" style={{ objectPosition: objectPosition(r.photo.imagePosition) }} />
                    : <div className="h-10 w-10 rounded-lg bg-secondary" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{[r.sub, <span key="m" className="sm:hidden">{facts}</span>].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && ", "}{x}</span>)}</p>
                  </div>
                  <p className="hidden sm:block text-sm text-muted-foreground tabular-nums truncate">{facts}</p>
                  <div className="min-w-0 text-right sm:text-left">
                    {r.next ? (
                      <>
                        <p className="text-sm text-foreground tabular-nums">{shortDate(r.next.start)}<span className="text-muted-foreground">, {when(r.days ?? 0)}</span></p>
                        <p className="text-xs text-muted-foreground truncate">{r.next.name}</p>
                      </>
                    ) : r.last ? (
                      <>
                        <p className="text-sm text-muted-foreground tabular-nums">Last trip {parseTripDate(r.last.start).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.last.name}</p>
                      </>
                    ) : <span className="sr-only">No trips booked</span>}
                  </div>
                  <CaretRight className="hidden sm:block h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ReportCard>
  );
}
