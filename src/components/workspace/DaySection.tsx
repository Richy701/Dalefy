import { Plus } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * One day of the itinerary: a heading you can find at a glance (day number, then the full date), then the
 * rows in one card. `date` arrives as "MONDAY, NOVEMBER 9"; it is shown as "Monday 9 November".
 */
export function DaySection({ date, dayNumber, count, children, onAddEvent }: {
  date: string;
  dayNumber?: number;
  count?: number;
  children: ReactNode;
  onAddEvent: () => void;
}) {
  const commaIdx = date.indexOf(",");
  const weekday = commaIdx > -1 ? date.slice(0, commaIdx) : date;
  const dateInfo = commaIdx > -1 ? date.slice(commaIdx + 1).trim() : "";
  const nice = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, ch => ch.toUpperCase());
  // "NOVEMBER 9" reads as "9 November"
  const [month, day] = dateInfo.split(/\s+/);
  const shown = [nice(weekday), day && month ? `${day} ${nice(month)}` : nice(dateInfo)].filter(Boolean).join(" ");

  return (
    <section>
      <div className="flex items-center gap-3 pb-3 pl-0 sm:pl-8">
        {dayNumber !== undefined && (
          <span className="shrink-0 rounded-lg bg-secondary px-2.5 py-1 text-sm font-semibold text-foreground tabular-nums">Day {dayNumber}</span>
        )}
        <h3 className="text-base sm:text-lg font-semibold tracking-tight text-foreground truncate">{shown}</h3>
        <span className="flex-1" />
        {count !== undefined && (
          <span className="text-xs text-muted-foreground tabular-nums">{count} {count === 1 ? "event" : "events"}</span>
        )}
        <button
          type="button"
          onClick={onAddEvent}
          className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium text-brand hover:bg-brand/10 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" weight="bold" /> Add
        </button>
      </div>
      {children}
    </section>
  );
}
