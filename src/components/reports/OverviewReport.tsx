import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaretRight, PencilSimple, PaperPlaneTilt, EnvelopeSimple, Coins, Tag, Users, Wallet, DeviceMobile, CalendarBlank, AirplaneTilt, CheckCircle, type Icon } from "@phosphor-icons/react";
import { ComposedChart, Bar, Line, XAxis, YAxis } from "recharts";
import { EVENT_ICONS, type EventType } from "@/config/eventStyles";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { fetchTripMembers, type TripMember } from "@/services/firebaseTrips";
import { joinedByTrip } from "@/lib/appMembers";
import { moneyByCurrency } from "@/lib/reportMoney";
import { formatMoney, summariseCosts } from "@/lib/tripCosts";
import { publishedChanges } from "@/lib/tripChanges";
import { travellerCount } from "@/lib/travelerSync";
import { parseTripDate } from "@/lib/dates";
import { objectPosition } from "@/lib/imagePosition";
import type { Trip } from "@/types";
import { ReportCard, EmptyNote } from "./ReportParts";
import { shortDate } from "./format";

type Stage = "draft" | "upcoming" | "travelling" | "finished";
const STAGES: Array<{ key: Stage; label: string; bar: string; icon: Icon; tone: string }> = [
  { key: "draft", label: "Draft", bar: "bg-muted-foreground/25", icon: PencilSimple, tone: "text-muted-foreground" },
  { key: "upcoming", label: "Upcoming", bar: "bg-muted-foreground/55", icon: CalendarBlank, tone: "text-foreground" },
  { key: "travelling", label: "Travelling now", bar: "bg-emerald-500", icon: AirplaneTilt, tone: "text-emerald-700 dark:text-emerald-400" },
  { key: "finished", label: "Finished", bar: "bg-muted-foreground/15", icon: CheckCircle, tone: "text-muted-foreground" },
];

/** Where a trip is in time: finished once its last day has passed, otherwise draft, travelling or upcoming */
function stageOf(t: Trip, today: Date): Stage {
  const start = parseTripDate(t.start), end = parseTripDate(t.end || t.start);
  end.setHours(23, 59, 59, 999);
  if (end < today) return "finished";
  if (t.status === "Draft") return "draft";
  return start <= today ? "travelling" : "upcoming";
}

// One colour per kind of booking, around the app's teal and sand; each clears 3:1 on both card colours
const BOOKING_KINDS: Array<{ key: EventType; label: string; color: string }> = [
  { key: "flight", label: "Flights", color: "#0c9e89" },
  { key: "hotel", label: "Stays", color: "#b87613" },
  { key: "activity", label: "Activities", color: "#7461d6" },
  { key: "dining", label: "Dining", color: "#d4566c" },
  { key: "transfer", label: "Transfers", color: "#3f86c9" },
];

const dateRange = (t: Trip) => (t.end && t.end !== t.start ? `${shortDate(t.start)} to ${shortDate(t.end)}` : shortDate(t.start));
const DAY_MS = 86400000;

/** "in 9 days", "tomorrow", or "Day 3 of 6" while travelling */
function countdown(t: Trip, today: Date): string {
  const start = parseTripDate(t.start), end = parseTripDate(t.end || t.start);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const until = Math.round((start.getTime() - midnight.getTime()) / DAY_MS);
  if (until > 1) return `in ${until} days`;
  if (until === 1) return "tomorrow";
  if (until === 0) return "today";
  const total = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  return `Day ${Math.min(total, 1 - until)} of ${total}`;
}

const MONTH_MS = 30.44 * 86400000;

/** Trips laid on a month axis, each in the first row where it doesn't overlap another */
function YearTimeline({ trips, today, onOpen }: { trips: Trip[]; today: Date; onOpen: (id: string) => void }) {
  const dated = trips
    .map(t => ({ t, a: parseTripDate(t.start).getTime(), b: parseTripDate(t.end || t.start).getTime() + 86400000 }))
    .filter(x => Number.isFinite(x.a) && Number.isFinite(x.b))
    .sort((x, y) => x.a - y.a);
  if (!dated.length) return <EmptyNote>No trip dates yet.</EmptyNote>;
  // Whole months around the trips, kept to about 15 months around today when they spread wider
  const first = new Date(Math.max(dated[0].a, today.getTime() - 6 * MONTH_MS));
  const last = new Date(Math.min(Math.max(...dated.map(x => x.b)), today.getTime() + 9 * MONTH_MS));
  const from = new Date(first.getFullYear(), first.getMonth(), 1).getTime();
  const to = new Date(Math.max(last.getTime(), today.getTime()) + MONTH_MS);
  const end = new Date(to.getFullYear(), to.getMonth(), 1).getTime();
  const span = end - from;
  const pct = (ms: number) => Math.min(100, Math.max(0, ((ms - from) / span) * 100));
  const months: Date[] = [];
  for (let d = new Date(from); d.getTime() < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
  // Pills need room for a name, so each is at least ~16% wide; rows are worked out from the final
  // position (after nudging in from the right edge), so pills never land on each other
  const minWidth = 16;
  const lanes: number[] = [];
  const placed = dated.filter(x => x.b > from && x.a < end).map(x => {
    const width = Math.max(pct(x.b) - pct(x.a), minWidth);
    const left = Math.min(pct(x.a), 100 - width);
    let lane = lanes.findIndex(r => r <= left);
    if (lane === -1) { lane = lanes.length; lanes.push(0); }
    lanes[lane] = left + width + 0.5;
    return { ...x, left, width, lane };
  });
  const todayPct = pct(today.getTime());

  return (
    <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
      <div className="relative min-w-[720px]">
        <div className="relative h-6 border-b border-border">
          {months.map(m => (
            <span key={m.getTime()} className="absolute top-0 text-xs text-muted-foreground" style={{ left: `${pct(m.getTime())}%` }}>
              {m.toLocaleDateString("en-GB", { month: "short" })}{m.getMonth() === 0 ? ` ${String(m.getFullYear()).slice(2)}` : ""}
            </span>
          ))}
        </div>
        <div className="relative mt-3 mb-6" style={{ height: lanes.length * 40 }}>
          {months.map(m => <div key={m.getTime()} className="absolute top-0 bottom-0 w-px bg-border/60" style={{ left: `${pct(m.getTime())}%` }} />)}
          <div className="absolute -top-3 -bottom-1 w-0.5 bg-emerald-500 z-10" style={{ left: `${todayPct}%` }}>
            <span className="absolute -bottom-5 -translate-x-1/2 left-1/2 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">Today</span>
          </div>
          {placed.map(x => {
            const stage = stageOf(x.t, today);
            return (
              <button key={x.t.id} onClick={() => onOpen(x.t.id)} title={`${x.t.name}, ${dateRange(x.t)}`}
                className={`absolute h-8 flex items-center gap-1.5 pl-1 pr-2.5 rounded-lg border text-left text-xs font-medium truncate transition-shadow hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                  stage === "finished" ? "opacity-50 bg-card border-border text-muted-foreground"
                  : stage === "travelling" ? "bg-emerald-500/10 border-emerald-500/40 text-foreground"
                  : "bg-card border-border text-foreground shadow-sm"}`}
                style={{ left: `${x.left}%`, width: `${x.width}%`, top: x.lane * 40 }}>
                {x.t.image ? <img src={x.t.image} alt="" className="h-6 w-6 rounded-md object-cover shrink-0" style={{ objectPosition: objectPosition(x.t.imagePosition) }} /> : <span className="h-6 w-6 rounded-md bg-secondary shrink-0" />}
                <span className="truncate">{x.t.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Trip photo, or a quiet panel when a trip has none */
function Cover({ trip, className }: { trip: Trip; className: string }) {
  return trip.image
    ? <img src={trip.image} alt="" loading="lazy" className={`${className} object-cover`} style={{ objectPosition: objectPosition(trip.imagePosition) }} />
    : <div className={`${className} bg-secondary`} />;
}

/** The account at a glance: what's coming up, what needs doing, and how it's going */
export function OverviewReport({ trips, onOpenTab }: { trips: Trip[]; onOpenTab: (tab: "money" | "travellers" | "trips") => void }) {
  const navigate = useNavigate();
  const [today] = useState(() => new Date());
  const tripIds = useMemo(() => trips.map(t => t.id).sort().join(","), [trips]);
  const [members, setMembers] = useState<TripMember[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchTripMembers(tripIds ? tripIds.split(",") : [])
      .then(list => { if (!cancelled) setMembers(list); })
      .catch(() => { /* app counts stay hidden; the Travellers tab shows the error */ });
    return () => { cancelled = true; };
  }, [tripIds]);

  const stages = useMemo(() => {
    const by = new Map<Stage, Trip[]>(STAGES.map(s => [s.key, []]));
    for (const t of trips) by.get(stageOf(t, today))!.push(t);
    for (const list of by.values()) list.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    return by;
  }, [trips, today]);

  const joined = useMemo(() => (members ? joinedByTrip(members) : null), [members]);

  const money = useMemo(() => moneyByCurrency(trips), [trips]);
  const main = money.currencies[0];
  const fmt = (n: number) => (main ? formatMoney(Math.round(n), main.currency) : "");

  const attention = useMemo(() => {
    const live = trips.filter(t => stageOf(t, today) !== "finished");
    const drafts = live.filter(t => t.status === "Draft");
    const unsent = trips.filter(t => t.status !== "Draft" && t.publishedSnapshot
      && publishedChanges(t.publishedSnapshot, { events: t.events, start: t.start, end: t.end, info: t.info }).length > 0);
    const over = money.rows.filter(r => r.left !== null && r.left < 0);
    // Only where a budget is being tracked: elsewhere a missing price is normal, not a problem
    const noPrice = money.rows.filter(r => r.budget !== null).reduce((s, r) => s + r.missing + r.unpriced.length, 0);
    const notInvited = live.reduce((s, t) => s + (t.travelers ?? []).filter(p => !p.invitedAt).length, 0);
    const names = (list: Trip[]) => list.slice(0, 2).map(t => t.name).join(", ") + (list.length > 2 ? ` and ${list.length - 2} more` : "");
    return [
      drafts.length && { key: "drafts", icon: PencilSimple, tint: "bg-secondary text-muted-foreground", count: drafts.length, text: drafts.length === 1 ? "draft to publish" : "drafts to publish", detail: names(drafts), go: () => (drafts.length === 1 ? navigate(`/trip/${drafts[0].id}`) : onOpenTab("trips")) },
      unsent.length && { key: "unsent", icon: PaperPlaneTilt, tint: "bg-sky-500/10 text-sky-700 dark:text-sky-400", count: unsent.length, text: unsent.length === 1 ? "trip with changes travellers haven't seen" : "trips with changes travellers haven't seen", detail: names(unsent), go: () => onOpenTab("trips") },
      notInvited && { key: "invite", icon: EnvelopeSimple, tint: "bg-amber-500/10 text-amber-700 dark:text-amber-400", count: notInvited, text: notInvited === 1 ? "traveller not invited yet" : "travellers not invited yet", detail: "On current and upcoming trips", go: () => onOpenTab("travellers") },
      over.length && { key: "over", icon: Coins, tint: "bg-red-500/10 text-red-600 dark:text-red-400", count: over.length, text: over.length === 1 ? "trip over budget" : "trips over budget", detail: names(over.map(r => r.trip)), go: () => onOpenTab("money") },
      noPrice && { key: "price", icon: Tag, tint: "bg-secondary text-muted-foreground", count: noPrice, text: noPrice === 1 ? "booking with no price" : "bookings with no price", detail: "On trips with a budget, so spend may be higher", go: () => onOpenTab("money") },
    ].filter(Boolean) as Array<{ key: string; icon: Icon; tint: string; count: number; text: string; detail: string; go: () => void }>;
  }, [trips, today, money, navigate, onOpenTab]);

  const comingUp = useMemo(() => [...stages.get("travelling")!, ...stages.get("upcoming")!, ...stages.get("draft")!]
    .sort((a, b) => (a.start || "").localeCompare(b.start || "")).slice(0, 5), [stages]);
  const [next, ...later] = comingUp;
  // Listed travellers, or everyone in the app if more have joined (same rule as the Travellers tab)
  const paxOf = (t: Trip) => Math.max(travellerCount(t), joined?.get(t.id) ?? 0);

  // Trips starting each month, with spend in the main currency
  // Bookings each month by kind, every month in the range so gaps show, with spend in the main currency
  const byMonth = useMemo(() => {
    type Row = { month: string; sort: number; trips: number; spend: number } & Record<EventType, number>;
    const rows = new Map<number, Row>();
    const row = (d: Date) => {
      const sort = d.getFullYear() * 12 + d.getMonth();
      if (!rows.has(sort)) rows.set(sort, { month: new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), sort, trips: 0, spend: 0, flight: 0, hotel: 0, activity: 0, dining: 0, transfer: 0 });
      return rows.get(sort)!;
    };
    for (const t of trips) {
      const start = parseTripDate(t.start);
      if (!Number.isNaN(start.getTime())) row(start).trips += 1;
      const c = summariseCosts(t);
      const priced = new Map(c.lines.map(l => [l.event.id, l.total]));
      for (const e of t.events) {
        const d = parseTripDate(e.date || t.start);
        if (Number.isNaN(d.getTime())) continue;
        const r = row(d);
        r[e.type] += 1;
        if (main && c.currency === main.currency) r.spend += Math.round(priced.get(e.id) ?? 0);
      }
    }
    const sorted = [...rows.values()].sort((x, y) => x.sort - y.sort);
    if (sorted.length < 2) return sorted;
    // Fill empty months between the first and last, so the axis is a true timeline
    for (let m = sorted[0].sort + 1; m < sorted[sorted.length - 1].sort; m++) if (!rows.has(m)) row(new Date(Math.floor(m / 12), m % 12, 1));
    return [...rows.values()].sort((x, y) => x.sort - y.sort);
  }, [trips, main]);
  const kindsUsed = BOOKING_KINDS.filter(k => byMonth.some(m => m[k.key] > 0));

  const hasSpend = !!main && byMonth.some(m => m.spend > 0);

  return (
    <div className="space-y-6 mt-8">
      {next && (() => {
        const stage = stageOf(next, today);
        const pax = paxOf(next);
        const app = joined?.get(next.id);
        const cost = summariseCosts(next);
        return (
          <button onClick={() => navigate(`/trip/${next.id}`)} className="group relative block w-full h-56 sm:h-64 rounded-xl overflow-hidden text-left shadow-sm">
            <Cover trip={next} className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.02]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
            <div className="absolute inset-0 p-5 sm:p-7 flex flex-col justify-between text-white">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-white/85">{stage === "travelling" ? "Travelling now" : stage === "draft" ? "Next up, still a draft" : "Next up"}</span>
                <span className="text-sm font-semibold rounded-lg bg-black/35 backdrop-blur px-2.5 py-1 tabular-nums">{countdown(next, today)}</span>
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">{next.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-white/90">
                  <span>{dateRange(next)}</span>
                  <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />{pax} {pax === 1 ? "traveller" : "travellers"}</span>
                  {app !== undefined && <span className="inline-flex items-center gap-1.5"><DeviceMobile className="h-4 w-4" />{app} in the app</span>}
                  {cost.total > 0 && <span className="inline-flex items-center gap-1.5"><Wallet className="h-4 w-4" />{formatMoney(Math.round(cost.total), cost.currency)}{cost.budget ? ` of ${formatMoney(cost.budget, cost.currency)}` : ""}</span>}
                </div>
              </div>
            </div>
          </button>
        );
      })()}


      {later.length > 0 && (
        <section>
          <h3 className="text-base font-semibold tracking-tight text-foreground mb-3">Coming up</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {later.map(t => {
              const pax = paxOf(t);
              const app = joined?.get(t.id);
              return (
                <button key={t.id} onClick={() => navigate(`/trip/${t.id}`)} className="group text-left rounded-xl border border-border bg-card shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className="relative h-28 overflow-hidden">
                    <Cover trip={t} className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" />
                    <span className="absolute top-2.5 right-2.5 text-xs font-semibold text-white rounded-md bg-black/45 backdrop-blur px-2 py-0.5 tabular-nums">{countdown(t, today)}</span>
                    {t.status === "Draft" && <span className="absolute top-2.5 left-2.5 text-xs font-medium text-white rounded-md bg-black/45 backdrop-blur px-2 py-0.5">Draft</span>}
                  </div>
                  <div className="p-3.5">
                    <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{dateRange(t)}</p>
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-3">
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{pax}</span>
                      {app !== undefined && <span className="inline-flex items-center gap-1"><DeviceMobile className="h-3.5 w-3.5" />{app} in the app</span>}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <ReportCard title="Year at a glance" sub="Every trip on its dates, finished ones faded">
        <YearTimeline trips={trips} today={today} onOpen={id => navigate(`/trip/${id}`)} />
      </ReportCard>

      <section>
        <h3 className="text-base font-semibold tracking-tight text-foreground mb-3">Needs attention</h3>
        {attention.length === 0 ? <EmptyNote>Nothing needs you right now.</EmptyNote> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {attention.map(a => (
              <button key={a.key} onClick={a.go} className="group text-left rounded-xl border border-border bg-card shadow-sm p-4 hover:shadow-md transition-shadow flex flex-col">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${a.tint}`}>
                  <a.icon className="h-[18px] w-[18px]" />
                </div>
                <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground mt-3 leading-none">{a.count}</p>
                <p className="text-sm text-foreground mt-1.5">{a.text}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.detail}</p>
                <span className="mt-auto pt-3 text-xs font-medium text-muted-foreground group-hover:text-foreground inline-flex items-center gap-1">Sort it <CaretRight className="h-3 w-3" /></span>
              </button>
            ))}
          </div>
        )}
      </section>

      <ReportCard title="Bookings by month" sub={hasSpend ? `What's booked each month by kind, with spend in ${main!.currency}` : "What's booked each month, by kind"}>
        {byMonth.length === 0 || kindsUsed.length === 0 ? <EmptyNote>No bookings on these trips yet.</EmptyNote> : (
          <>
            <ChartContainer
              config={{
                ...Object.fromEntries(BOOKING_KINDS.map(k => [k.key, { label: k.label, color: k.color }])),
                spend: { label: main ? `Spend (${main.currency})` : "Spend", color: "hsl(var(--foreground))" },
              } satisfies ChartConfig}
              className="h-64 w-full"
            >
              <ComposedChart data={byMonth} barCategoryGap="22%">
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis yAxisId="n" width={28} axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                {hasSpend && <YAxis yAxisId="spend" orientation="right" width={56} axisLine={false} tickLine={false} tickFormatter={v => fmt(Number(v))} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />}
                <ChartTooltip content={<ChartTooltipContent />} />
                {kindsUsed.map((k, i) => (
                  <Bar key={k.key} yAxisId="n" dataKey={k.key} stackId="b" fill={`var(--color-${k.key})`} stroke="hsl(var(--card))" strokeWidth={1}
                    radius={i === kindsUsed.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={48} />
                ))}
                {hasSpend && <Line yAxisId="spend" dataKey="spend" stroke="var(--color-spend)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--color-spend)" }} type="linear" />}
              </ComposedChart>
            </ChartContainer>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4">
              {kindsUsed.map(k => {
                const KindIcon = EVENT_ICONS[k.key];
                return (
                  <span key={k.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <KindIcon className="h-3.5 w-3.5" style={{ color: k.color }} weight="bold" />{k.label}
                  </span>
                );
              })}
              {hasSpend && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-0.5 w-4 rounded-full bg-foreground" />Spend</span>}
            </div>
          </>
        )}
      </ReportCard>
    </div>
  );
}
