import { useEffect, useMemo, useState } from "react";
import { format, addDays } from "date-fns";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { CategoryDot } from "@/components/ui/category-dot";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { shortDay } from "@/lib/tripSummary";
import { cn } from "@/lib/utils";
import type { TravelEvent, Trip, User } from "@/types";

type Row = { ev: TravelEvent; trip: Trip };
type Tone = "ok" | "warn" | "bad" | "quiet";

const TONE_CLASS: Record<Tone, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
  quiet: "text-muted-foreground",
};

function minutes(t?: string): number | null {
  const m = (t ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) h = h % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

/** Minutes behind schedule from the live estimate the flight status job saves; 0 when on time or unknown */
function delayMins(ev: TravelEvent): number {
  const scheduled = minutes(ev.time);
  const revised = minutes(ev.revisedTime);
  if (scheduled == null || revised == null) return 0;
  const diff = ((revised - scheduled) % 1440 + 1440 + 720) % 1440 - 720;
  return Math.max(0, diff);
}

function lateLabel(mins: number): string {
  if (mins < 60) return `${mins} min late`;
  const rest = mins % 60;
  return `${Math.floor(mins / 60)} h${rest ? ` ${rest} min` : ""} late`;
}

function group(status?: string): string {
  const s = (status ?? "").toLowerCase().replace(/\s+/g, "");
  if (s.startsWith("cancel")) return "cancelled";
  if (s === "enroute" || s === "departed" || s === "approaching") return "air";
  if (s === "arrived" || s === "landed") return "landed";
  return s;
}

function flightStatus(ev: TravelEvent): { label: string; tone: Tone } {
  const g = group(ev.status);
  const late = delayMins(ev);
  if (g === "cancelled") return { label: "Cancelled", tone: "bad" };
  if (g === "diverted") return { label: "Diverted", tone: "bad" };
  if (g === "landed") return { label: ev.baggageBelt ? `Landed, belt ${ev.baggageBelt}` : "Landed", tone: "ok" };
  if (g === "air") return late >= 15 ? { label: `In the air, ${lateLabel(late)}`, tone: "warn" } : { label: "In the air", tone: "quiet" };
  if (late >= 15) return { label: lateLabel(late), tone: "warn" };
  if (g === "delayed") return { label: "Delayed", tone: "warn" };
  if (g === "boarding") return { label: ev.gate ? `Boarding, gate ${ev.gate}` : "Boarding", tone: "quiet" };
  if (ev.gate) return { label: `Gate ${ev.gate}`, tone: "quiet" };
  return { label: "Scheduled", tone: "quiet" };
}

const byTime = (a: Row, b: Row) => (a.ev.date + String(minutes(a.ev.time) ?? 9999).padStart(4, "0")).localeCompare(b.ev.date + String(minutes(b.ev.time) ?? 9999).padStart(4, "0"));

/**
 * Every trip's flights on one live board: today's with what the status job last saw, tomorrow's a click
 * away, and the next few upcoming when nobody flies today.
 */
export function FlightsBoard({ trips, directory, onOpen }: { trips: Trip[]; directory: User[]; onOpen: (tripId: string) => void }) {
  const [showTomorrow, setShowTomorrow] = useState(false);
  // "Today" moves at midnight even when no trip changes, so the board keys off a day that ticks over
  const [dayKey, setDayKey] = useState(() => format(new Date(), "yyyy-MM-dd"));
  useEffect(() => {
    const id = setInterval(() => setDayKey(format(new Date(), "yyyy-MM-dd")), 60_000);
    return () => clearInterval(id);
  }, []);
  const { today, tomorrow, upcoming } = useMemo(() => {
    const now = new Date(`${dayKey}T12:00:00`);
    const todayKey = format(now, "yyyy-MM-dd");
    const tomorrowKey = format(addDays(now, 1), "yyyy-MM-dd");
    const yesterdayKey = format(addDays(now, -1), "yyyy-MM-dd");
    const rows: Row[] = trips.flatMap(trip => trip.events.filter(e => e.type === "flight" && e.date).map(ev => ({ ev, trip })));
    const day = (key: string) => rows.filter(r => r.ev.date.slice(0, 10) === key);
    // Overnight flights from yesterday stay on today's board while in the air and once they land today
    const overnight = day(yesterdayKey).filter(r => group(r.ev.status) === "air" || (r.ev.arrivedAt && format(new Date(r.ev.arrivedAt), "yyyy-MM-dd") === todayKey));
    return {
      today: [...overnight, ...day(todayKey)].sort(byTime),
      tomorrow: day(tomorrowKey).sort(byTime),
      upcoming: rows.filter(r => r.ev.date.slice(0, 10) > todayKey).sort(byTime).slice(0, 5),
    };
  }, [trips, dayKey]);

  const avatarById = useMemo(() => new Map(directory.map(u => [u.id, u.avatar])), [directory]);

  const mode: "today" | "tomorrow" | "upcoming" = today.length === 0 ? "upcoming" : showTomorrow && tomorrow.length ? "tomorrow" : "today";
  const list = mode === "today" ? today : mode === "tomorrow" ? tomorrow : upcoming;
  if (list.length === 0) return null;

  const statuses = today.map(r => flightStatus(r.ev));
  const landed = today.filter(r => group(r.ev.status) === "landed").length;
  const late = statuses.filter(s => s.tone === "warn").length;
  const cancelled = today.filter(r => group(r.ev.status) === "cancelled").length;
  const diverted = today.filter(r => group(r.ev.status) === "diverted").length;
  const trouble = late + cancelled + diverted;
  const summary = mode === "today"
    ? [landed ? `${landed} of ${today.length} landed` : `${today.length} today`, late ? `${late} late` : "", cancelled ? `${cancelled} cancelled` : "", diverted ? `${diverted} diverted` : ""].filter(Boolean).join(", ")
    : mode === "tomorrow" ? `${tomorrow.length} tomorrow` : `${upcoming.length} next`;

  return (
    <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden flex-1 flex flex-col">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
        <p className="text-base font-semibold tracking-tight text-foreground whitespace-nowrap">
          {mode === "today" ? "Flights today" : mode === "tomorrow" ? "Flights tomorrow" : "Upcoming flights"}
        </p>
        <p className={cn("text-xs tabular-nums text-right", mode === "today" && trouble ? TONE_CLASS.warn : "text-muted-foreground")}>{summary}</p>
      </div>
      <div className="flex flex-col pb-2">
        {list.map(({ ev, trip }) => {
          const route = ev.depAirport && ev.arrAirport ? `${ev.depAirport} → ${ev.arrAirport}` : ev.location || "";
          const people = (trip.travelers ?? []).filter(t => !ev.assignedTo?.length || ev.assignedTo.includes(t.id));
          const status = flightStatus(ev);
          const late = delayMins(ev) >= 15 && group(ev.status) !== "landed";
          const time = ev.time && !/^tb[acd]$/i.test(ev.time) ? ev.time.split(" ")[0] : "";
          return (
            <button
              key={`${trip.id}-${ev.id}`}
              type="button"
              onClick={() => onOpen(trip.id)}
              className="flex items-center gap-3 px-5 py-2.5 text-left hover:bg-secondary/60 transition-colors focus-visible:outline-none focus-visible:bg-secondary/60"
            >
              <CategoryDot type="flight" size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">
                  <span className="font-medium">{[ev.airline, ev.flightNum].filter(Boolean).join(" ") || ev.title}</span>
                  {route && <span className="text-muted-foreground"> {route}</span>}
                </p>
                <div className="flex items-center gap-2 mt-0.5 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{trip.name}</p>
                  {people.length > 0 && (
                    <div className="flex items-center -space-x-1.5 shrink-0" aria-label={`${people.length} ${people.length === 1 ? "traveller" : "travellers"}`}>
                      {people.slice(0, 4).map(p => (
                        <PersonAvatar key={p.id} avatar={avatarById.get(p.id) || p.avatar} initials={p.initials} name={p.name} className="h-5 w-5 ring-2 ring-card" fallbackClassName="text-[8px] font-bold text-foreground" />
                      ))}
                      {people.length > 4 && (
                        <div className="h-5 w-5 rounded-full bg-secondary border-2 border-card flex items-center justify-center text-[8px] font-bold text-muted-foreground">+{people.length - 4}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-medium text-foreground tabular-nums">
                  {mode === "upcoming" ? shortDay(ev.date) : late && ev.revisedTime ? ev.revisedTime : time}
                  {mode !== "upcoming" && late && time && <span className="ml-1 text-[11px] font-normal text-muted-foreground line-through">{time}</span>}
                </p>
                <p className={cn("text-[11px] tabular-nums", mode === "upcoming" ? "text-muted-foreground" : TONE_CLASS[status.tone])}>
                  {mode === "upcoming" ? time : status.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {mode !== "upcoming" && tomorrow.length > 0 && (
        <button
          type="button"
          onClick={() => setShowTomorrow(v => !v)}
          className="flex items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors focus-visible:outline-none focus-visible:bg-secondary/60"
        >
          {mode === "tomorrow" ? (
            <><span className="inline-flex items-center gap-1"><CaretLeft className="h-3 w-3" /> Back to today</span><span /></>
          ) : (
            <><span>Tomorrow, {tomorrow.length} {tomorrow.length === 1 ? "flight" : "flights"}</span><CaretRight className="h-3 w-3" /></>
          )}
        </button>
      )}
    </div>
  );
}
