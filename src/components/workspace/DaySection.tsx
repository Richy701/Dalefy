import { Plus } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * One day of the itinerary: a quiet header, then the rows in one card.
 * `date` arrives as "MONDAY, JUNE 15"; it is shown as "Mon, June 15".
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

  return (
    <section>
      <div className="flex items-center gap-2 pb-2 pl-0 sm:pl-8">
        <span className="text-xs font-medium text-muted-foreground">
          {nice(weekday).slice(0, 3)}{dateInfo ? ` ${nice(dateInfo)}` : ""}
        </span>
        {dayNumber !== undefined && (
          <span className="text-xs text-muted-foreground/70 tabular-nums">· Day {dayNumber}</span>
        )}
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
