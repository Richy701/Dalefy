import { Plus } from "lucide-react";
import type { ReactNode } from "react";

export function DaySection({ date, eventCount, children, onAddEvent }: { date: string; eventCount?: number; children: ReactNode; onAddEvent: () => void }) {
  // date arrives as "MONDAY, JUNE 15" — split into weekday + rest
  const commaIdx = date.indexOf(",");
  const weekday = commaIdx > -1 ? date.slice(0, commaIdx) : date;
  const dateInfo = commaIdx > -1 ? date.slice(commaIdx + 1).trim() : "";

  return (
    <div className="space-y-5">
      {/* Sticky day header */}
      <div className="sticky top-16 z-20 bg-slate-50/90 dark:bg-[#050505]/90 backdrop-blur-md pt-2 pb-4">
        <div className="flex items-end justify-between">
          {/* Editorial date treatment */}
          <div className="flex items-baseline gap-3">
            <span className="text-[10px] font-black italic uppercase tracking-[0.3em] text-[#0bd2b5] leading-none">{weekday}</span>
            <span className="text-xl font-black italic uppercase tracking-tight text-slate-900 dark:text-white leading-none">{dateInfo}</span>
            {eventCount !== undefined && (
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888] bg-slate-100 dark:bg-[#1a1a1a] px-2 py-0.5 rounded-full">
                {eventCount}
              </span>
            )}
          </div>

          <button
            onClick={onAddEvent}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-[#0bd2b5] bg-[#0bd2b5]/5 hover:bg-[#0bd2b5] hover:text-black border border-[#0bd2b5]/15 transition-all"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {/* Full-width rule */}
        <div className="mt-3 h-px w-full bg-slate-200 dark:bg-[#1f1f1f]" />
      </div>

      <div className="space-y-5">{children}</div>
    </div>
  );
}
