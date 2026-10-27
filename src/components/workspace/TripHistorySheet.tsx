import type { TripHistoryEntry } from "@/types";

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** The trip's change log, grouped by day: time, who, what */
export function TripHistorySheet({ history }: { history: TripHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="px-5 py-6 text-sm text-muted-foreground">Nothing recorded yet. Changes from now on are listed here with who made them.</p>;
  }
  const days: Array<{ day: string; entries: TripHistoryEntry[] }> = [];
  for (const entry of history) {
    const day = dayKey(entry.at);
    const last = days[days.length - 1];
    if (last && last.day === day) last.entries.push(entry); else days.push({ day, entries: [entry] });
  }
  return (
    <div className="px-5 py-4 space-y-5">
      {days.map(group => (
        <section key={group.day}>
          <p className="text-xs font-medium text-muted-foreground mb-2">{group.day}</p>
          <div className="rounded-xl border border-border divide-y divide-border">
            {group.entries.map(e => (
              <div key={e.id} className="flex items-start gap-3 px-3 py-2.5">
                <span className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5">{clock(e.at)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{e.summary}</p>
                  <p className="text-xs text-muted-foreground">{e.by}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
