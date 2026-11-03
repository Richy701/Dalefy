import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "@phosphor-icons/react";
import { AirlineMark } from "@/components/shared/AirlineMark";
import { CategoryDot } from "@/components/ui/category-dot";
import { parseTripDate } from "@/lib/dates";
import { sortEvents } from "@/lib/sortEvents";
import { clockTime } from "@/lib/timeInput";
import type { Trip, TravelEvent } from "@/types";

const WINDOW_DAYS = 14;
const MAX_ITEMS = 5;
const DAY_MS = 86_400_000;
const isPlaceholder = (t?: string) => !t?.trim() || /^tb[acd]$/i.test(t.trim());
/** "QR10 — London to Doha": the number goes on the second line so the route reads on its own */
const FLIGHT_NO = /^[A-Z0-9]{2}\s?\d{1,4}$/;

function flightTitle(ev: TravelEvent): string {
  const parts = ev.title.split(/\s+[—–-]\s+/);
  const codeAt = parts.length === 2 ? parts.findIndex(p => FLIGHT_NO.test(p.trim())) : -1;
  return codeAt >= 0 ? parts[1 - codeAt].trim() : ev.title;
}

function dayLabel(date: string, today: Date): string {
  const day = parseTripDate(date);
  const label = day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const ahead = Math.round((new Date(day).setHours(0, 0, 0, 0) - today.getTime()) / DAY_MS);
  return ahead === 0 ? `Today, ${label}` : ahead === 1 ? `Tomorrow, ${label}` : label;
}

function detailLine(ev: TravelEvent): { text: string; place: boolean } | null {
  if (ev.type === "flight") {
    const days = ev.endDate && ev.endDate !== ev.date ? Math.round((parseTripDate(ev.endDate).getTime() - parseTripDate(ev.date).getTime()) / DAY_MS) : 0;
    const arrives = isPlaceholder(ev.endTime) ? "" : `Arrives ${clockTime(ev.endTime)}${days ? ` ${days > 0 ? "+" : ""}${days}` : ""}`;
    const text = [ev.flightNum, arrives].filter(Boolean).join(", ");
    return text ? { text, place: false } : null;
  }
  if (ev.type === "hotel") return { text: "Check-in", place: false };
  return ev.location ? { text: ev.location, place: true } : null;
}

/** The next few things across every trip, by trip and then by day. */
export function NextUp({ trips }: { trips: Trip[] }) {
  const navigate = useNavigate();
  const { groups, today } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + WINDOW_DAYS * DAY_MS;
    const upcoming = trips
      .flatMap(trip => sortEvents(trip.events)
        .filter(ev => {
          if (!ev.date) return false;
          const at = new Date(ev.date.slice(0, 10) + "T00:00:00").getTime();
          return at >= start.getTime() && at <= end;
        })
        .map(event => ({ event, trip })))
      .sort((a, b) => a.event.date.slice(0, 10).localeCompare(b.event.date.slice(0, 10)))
      .slice(0, MAX_ITEMS);

    const byTrip = new Map<string, { trip: Trip; days: Map<string, TravelEvent[]> }>();
    for (const { event, trip } of upcoming) {
      const group = byTrip.get(trip.id) ?? { trip, days: new Map<string, TravelEvent[]>() };
      const date = event.date.slice(0, 10);
      group.days.set(date, [...(group.days.get(date) ?? []), event]);
      byTrip.set(trip.id, group);
    }
    return { groups: [...byTrip.values()], today: start };
  }, [trips]);

  if (groups.length === 0) return null;

  return (
    <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden">
      <div data-compact-card-head className="px-5 pt-5 pb-3">
        <p className="text-lg font-semibold tracking-tight text-foreground leading-none">Next up</p>
      </div>
      <div className="divide-y divide-border border-t border-border">
        {groups.map(({ trip, days }) => (
          <section key={trip.id} aria-label={trip.name} className="px-5 py-3.5">
            <h3 className="text-sm font-semibold text-foreground truncate">{trip.name}</h3>
            {[...days.entries()].map(([date, events]) => (
              <div key={date} className="mt-2.5">
                <p className="text-xs font-medium text-muted-foreground">{dayLabel(date, today)}</p>
                <ul className="mt-0.5">
                  {events.map(ev => {
                    const isFlight = ev.type === "flight";
                    const time = isPlaceholder(ev.time) ? (isFlight ? "TBC" : "") : clockTime(ev.time);
                    const detail = detailLine(ev);
                    const dot = <CategoryDot type={ev.type} transferType={ev.transferType} size="sm" />;
                    return (
                      <li key={ev.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/trip/${trip.id}?event=${ev.id}`)}
                          className="group -mx-2 grid w-[calc(100%+1rem)] grid-cols-[2.75rem_1.75rem_minmax(0,1fr)] items-start gap-x-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-secondary/50 transition-colors"
                        >
                          <span className="pt-1 text-xs font-medium tabular-nums text-brand">{time}</span>
                          {isFlight ? <AirlineMark flightNum={ev.flightNum} className="h-7 w-7" fallback={dot} /> : dot}
                          <span className="min-w-0">
                            <span className="block text-sm font-medium leading-snug text-foreground">{isFlight ? flightTitle(ev) : ev.title}</span>
                            {detail && (
                              <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                                {detail.place && <MapPin aria-hidden="true" className="h-3 w-3 shrink-0" />}
                                <span className="truncate">{detail.text}</span>
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
