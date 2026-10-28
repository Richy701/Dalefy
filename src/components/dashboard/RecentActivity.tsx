import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PaperPlaneTilt, Plus, PlusCircle, Trash, PencilSimple, UploadSimple } from "@phosphor-icons/react";
import { timeAgo } from "@/lib/timeAgo";
import type { Trip } from "@/types";

/** "richmond lamptey" reads as a name: "Richmond Lamptey" */
const properName = (name: string) => name.replace(/\b\p{L}/gu, c => c.toUpperCase());

/** A small icon for the kind of change, so a column of rows can be scanned at a glance */
function kindOf(summary: string) {
  const s = summary.toLowerCase();
  if (s.startsWith("published")) return { Icon: PaperPlaneTilt, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  if (s.startsWith("created")) return { Icon: PlusCircle, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" };
  if (s.startsWith("imported")) return { Icon: UploadSimple, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" };
  if (s.startsWith("removed") || s.startsWith("deleted")) return { Icon: Trash, tone: "bg-red-500/10 text-red-600 dark:text-red-400" };
  if (s.startsWith("added")) return { Icon: Plus, tone: "bg-secondary text-foreground" };
  return { Icon: PencilSimple, tone: "bg-secondary text-muted-foreground" };
}

/** Today, Yesterday, or the date */
function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

const initials = (name: string) => name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

/** The latest changes across every trip, by day: who did what, repeats folded together */
export function RecentActivity({ trips, limit = 10 }: { trips: Trip[]; limit?: number }) {
  const navigate = useNavigate();
  const days = useMemo(() => {
    const images = new Map(trips.map(t => [t.id, t.image]));
    const sorted = trips
      .flatMap(t => (t.history ?? []).map(h => ({ ...h, tripId: t.id, tripName: t.name, image: images.get(t.id) })))
      .sort((a, b) => b.at.localeCompare(a.at));
    // The same person doing the same thing to the same trip, back to back, is one row
    const rows: Array<(typeof sorted)[number] & { times: number }> = [];
    for (const e of sorted) {
      const last = rows[rows.length - 1];
      if (last && last.tripId === e.tripId && last.by === e.by && last.summary === e.summary) last.times += 1;
      else rows.push({ ...e, times: 1 });
      if (rows.length > limit) { rows.pop(); break; }
    }
    const groups: Array<{ label: string; rows: typeof rows }> = [];
    for (const r of rows) {
      const label = dayLabel(r.at);
      const g = groups[groups.length - 1];
      if (g && g.label === label) g.rows.push(r); else groups.push({ label, rows: [r] });
    }
    return groups;
  }, [trips, limit]);

  return (
    <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground leading-none">Recent activity</h2>
        <p className="text-xs text-muted-foreground mt-1">What you and your team changed on trips</p>
      </div>
      {days.length === 0 ? (
        <p className="mx-5 mb-5 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Changes you and your team make to trips show up here.
        </p>
      ) : (
        <div className="px-5 pb-4 space-y-4">
          {days.map(day => (
            <div key={day.label}>
              <div className="flex items-center gap-3 mb-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{day.label}</p>
                <div className="h-px flex-1 bg-border" />
              </div>
              <ul>
                {day.rows.map(e => {
                  const { Icon, tone } = kindOf(e.summary);
                  const who = properName(e.by || "Someone");
                  const what = /^[A-Z][a-z]/.test(e.summary) ? e.summary.charAt(0).toLowerCase() + e.summary.slice(1) : e.summary;
                  return (
                    <li key={`${e.tripId}-${e.id}`}>
                      <button
                        type="button"
                        onClick={() => navigate(`/trip/${e.tripId}`)}
                        className="w-full flex items-center gap-3 rounded-lg px-2 -mx-2 py-2 text-left hover:bg-secondary/50 transition-colors"
                      >
                        {/* Who, with a badge for what kind of change */}
                        <span className="relative shrink-0">
                          <span className="h-9 w-9 rounded-full bg-secondary text-foreground flex items-center justify-center text-[11px] font-semibold">{initials(who)}</span>
                          <span className={`absolute -bottom-0.5 -right-0.5 h-4.5 w-4.5 rounded-full border-2 border-card flex items-center justify-center ${tone}`}>
                            <Icon className="h-2.5 w-2.5" weight="bold" />
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-foreground truncate">
                            <span className="font-semibold">{who}</span> {what}{e.times > 1 ? `, ${e.times} times` : ""}
                          </span>
                          <span className="block text-xs text-muted-foreground truncate">{timeAgo(e.at)}</span>
                        </span>
                        {/* The trip it happened on */}
                        <span className="hidden sm:flex items-center gap-2 max-w-[45%] min-w-0 rounded-lg bg-secondary/60 pl-1 pr-2.5 py-1 shrink-0">
                          {e.image ? <img src={e.image} alt="" className="h-6 w-6 rounded-md object-cover shrink-0" loading="lazy" /> : <span className="h-6 w-6 rounded-md bg-secondary shrink-0" />}
                          <span className="text-xs font-medium text-foreground truncate">{e.tripName}</span>
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
    </section>
  );
}
