import { useMemo, useState } from "react";
import type { Trip } from "@/types";

const MS_PER_DAY = 86400000;
const WEEKS = 53;

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function TravelHeatmap({ trips, onSelectTrip }: { trips: Trip[]; onSelectTrip: (t: Trip) => void }) {
  const [hover, setHover] = useState<{ date: string; tripIds: string[]; x: number; y: number } | null>(null);

  // Build a map of YYYY-MM-DD → list of trip IDs active on that day
  const dayIndex = useMemo(() => {
    const map = new Map<string, string[]>();
    trips.forEach(t => {
      const start = new Date(t.start);
      const end = new Date(t.end);
      for (let d = new Date(start); d.getTime() <= end.getTime(); d = new Date(d.getTime() + MS_PER_DAY)) {
        const k = ymd(d);
        const arr = map.get(k) || [];
        arr.push(t.id);
        map.set(k, arr);
      }
    });
    return map;
  }, [trips]);

  // 53 weeks ending at today's week, Sunday-start grid
  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    // Align end to Saturday so the last column always has a full-ish week
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));

    const grid: { date: Date; count: number; tripIds: string[] }[][] = [];
    for (let w = 0; w < WEEKS; w++) {
      const col: { date: Date; count: number; tripIds: string[] }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getTime() + (w * 7 + d) * MS_PER_DAY);
        const ids = dayIndex.get(ymd(date)) || [];
        col.push({ date, count: ids.length, tripIds: ids });
      }
      grid.push(col);
    }
    return grid;
  }, [dayIndex]);

  const monthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((col, i) => {
      const m = col[0].date.getMonth();
      if (m !== lastMonth) {
        labels.push({ col: i, label: col[0].date.toLocaleString("en-US", { month: "short" }) });
        lastMonth = m;
      }
    });
    return labels;
  }, [weeks]);

  const tripById = useMemo(() => new Map(trips.map(t => [t.id, t])), [trips]);
  const totalDays = [...dayIndex.values()].length;

  const intensity = (n: number) => {
    if (n === 0) return "bg-slate-100 dark:bg-[#1a1a1a]";
    if (n === 1) return "bg-brand/30";
    if (n === 2) return "bg-brand/60";
    return "bg-brand";
  };

  return (
    <div className="relative bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-3xl p-5">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h3 className="text-base font-black tracking-tight text-slate-900 dark:text-white leading-none">Travel Activity</h3>
          <p className="text-xs text-slate-500 dark:text-[#888] mt-1">
            {totalDays} {totalDays === 1 ? "day" : "days"} of travel in the last year
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">
          <span>Less</span>
          <span className="h-2.5 w-2.5 rounded-[3px] bg-slate-100 dark:bg-[#1a1a1a]" />
          <span className="h-2.5 w-2.5 rounded-[3px] bg-brand/30" />
          <span className="h-2.5 w-2.5 rounded-[3px] bg-brand/60" />
          <span className="h-2.5 w-2.5 rounded-[3px] bg-brand" />
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Month labels */}
          <div className="relative h-4 mb-1 ml-6" style={{ width: WEEKS * 14 }}>
            {monthLabels.map(({ col, label }) => (
              <span key={col} className="absolute text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]" style={{ left: col * 14 }}>
                {label}
              </span>
            ))}
          </div>

          <div className="flex">
            {/* Day-of-week labels */}
            <div className="flex flex-col gap-[2px] mr-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#666]">
              {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
                <span key={i} className="h-3 leading-3">{d}</span>
              ))}
            </div>

            <div className="flex gap-[2px]">
              {weeks.map((col, i) => (
                <div key={i} className="flex flex-col gap-[2px]">
                  {col.map((cell, j) => {
                    const firstTripId = cell.tripIds[0];
                    return (
                      <button
                        key={j}
                        type="button"
                        aria-label={`${ymd(cell.date)}${cell.count ? ` · ${cell.count} trip${cell.count > 1 ? "s" : ""}` : ""}`}
                        disabled={!cell.count}
                        onMouseEnter={(e) => {
                          if (!cell.count) return;
                          const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          setHover({ date: ymd(cell.date), tripIds: cell.tripIds, x: r.left, y: r.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => {
                          if (firstTripId) {
                            const trip = tripById.get(firstTripId);
                            if (trip) onSelectTrip(trip);
                          }
                        }}
                        className={`h-3 w-3 rounded-[3px] ${intensity(cell.count)} ${cell.count ? "hover:ring-1 hover:ring-brand cursor-pointer" : "cursor-default"} transition-[box-shadow]`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {hover && (
        <div
          className="fixed z-50 bg-slate-900 dark:bg-[#050505] border border-slate-700 dark:border-[#2a2a2a] text-white text-[11px] rounded-lg px-3 py-2 pointer-events-none shadow-xl"
          style={{ left: hover.x + 16, top: hover.y - 8 }}
        >
          <p className="font-bold">{new Date(hover.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
          {hover.tripIds.map(id => {
            const t = tripById.get(id);
            if (!t) return null;
            return <p key={id} className="text-brand font-semibold">{t.name}</p>;
          })}
        </div>
      )}
    </div>
  );
}
