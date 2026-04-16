import { Plus } from "lucide-react";
import type { ReactNode } from "react";

export function DaySection({ date, dayNumber, children, onAddEvent }: { date: string; dayNumber?: number; children: ReactNode; onAddEvent: () => void }) {
  // date arrives as "MONDAY, JUNE 15" — split into weekday + rest
  const commaIdx = date.indexOf(",");
  const weekday = commaIdx > -1 ? date.slice(0, commaIdx) : date;
  const dateInfo = commaIdx > -1 ? date.slice(commaIdx + 1).trim() : "";

  return (
    <div className="space-y-5">
      {/* Day header */}
      <div className="pt-2 pb-4">
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            {dayNumber !== undefined && (
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 dark:text-[#555] leading-none tabular-nums">Day {dayNumber}</span>
            )}
            <span className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white leading-none">{weekday}</span>
            <span className="text-lg font-black uppercase tracking-tight text-brand leading-none">{dateInfo}</span>
          </div>

          <button
            onClick={onAddEvent}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-brand bg-brand/5 hover:bg-brand hover:text-black border border-brand/15 transition-all"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        <div className="mt-3 h-px w-full bg-slate-200 dark:bg-[#1f1f1f]" />
      </div>

      <div className="space-y-5">{children}</div>
    </div>
  );
}
