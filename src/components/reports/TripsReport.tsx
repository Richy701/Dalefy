import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AirplaneTilt, CaretRight, Info, ListChecks, Check } from "@phosphor-icons/react";
import { fetchTripMembers, APP_MEMBERS_ERROR, type TripMember } from "@/services/firebaseTrips";
import { joinedByTrip } from "@/lib/appMembers";
import { publishedChanges } from "@/lib/tripChanges";
import { parseTripDate } from "@/lib/dates";
import { objectPosition } from "@/lib/imagePosition";
import { useComplianceRecords, useDirectoryTravelers } from "@/context/directory";
import type { Trip, TravelEvent, ComplianceDoc } from "@/types";
import { ReportCard, EmptyNote } from "./ReportParts";
import { shortDate } from "./format";

const DAY_MS = 86400000;

/** "14:30" or "2:30 PM" in minutes past midnight; null when there's no time */
function minutes(t?: string): number | null {
  const m = (t ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) h = h % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

/** How late the live flight data says a flight now leaves, in minutes */
function delayOf(ev: TravelEvent): number {
  const planned = minutes(ev.time), revised = minutes(ev.revisedTime);
  return planned == null || revised == null ? 0 : revised - planned;
}

/** Whole days from today to a date: negative when it has passed */
function daysFrom(today: Date, value: string): number {
  const d = parseTripDate(value);
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - today.getTime()) / DAY_MS);
}

const dateRange = (t: Trip) => (t.end && t.end !== t.start ? `${shortDate(t.start)} to ${shortDate(t.end)}` : shortDate(t.start));

/** One readiness check on one trip: done, needs work, or doesn't apply */
type Check = { state: "ok" | "todo" | "na"; text: string };
const CHECKS = ["Published", "Changes sent", "Invited", "In the app", "Documents", "Booking refs", "Tasks"] as const;

// Only open checks draw the eye: done is a quiet tick, not applicable is blank (still read out)
function CheckCell({ check, label }: { check: Check; label: string }) {
  if (check.state === "na") return <span className="text-xs text-muted-foreground lg:sr-only"><span className="lg:hidden">{label}, </span>{check.text}</span>;
  if (check.state === "ok") return (
    <span className="flex items-center gap-1.5 min-w-0 text-muted-foreground" title={`${label}: ${check.text}`}>
      <Check className="h-3.5 w-3.5 shrink-0" weight="bold" aria-hidden />
      <span className="text-xs truncate lg:sr-only"><span className="lg:hidden">{label}, </span>{check.text}</span>
    </span>
  );
  return (
    <span className="text-xs truncate text-amber-700 dark:text-amber-400" title={`${label}: ${check.text}`}>
      <span className="lg:hidden text-muted-foreground">{label}, </span>{check.text}
    </span>
  );
}

/** Is each current and upcoming trip ready, what's due soon, and how its flights are doing */
export function TripsReport({ trips }: { trips: Trip[] }) {
  const navigate = useNavigate();
  const [complianceOverrides] = useComplianceRecords();
  const [directory] = useDirectoryTravelers();
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const current = useMemo(() => trips.filter(t => parseTripDate(t.end || t.start) >= today)
    .sort((a, b) => (a.start || "").localeCompare(b.start || "")), [trips, today]);

  const currentIds = useMemo(() => current.map(t => t.id).sort().join(","), [current]);
  const [members, setMembers] = useState<TripMember[] | null>(null);
  const [membersError, setMembersError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchTripMembers(currentIds ? currentIds.split(",") : [])
      .then(list => { if (!cancelled) { setMembers(list); setMembersError(false); } })
      .catch(() => { if (!cancelled) setMembersError(true); });
    return () => { cancelled = true; };
  }, [currentIds]);
  const joined = useMemo(() => (members ? joinedByTrip(members) : null), [members]);

  // A traveller's documents: the saved record first, then the directory entry (matched by id, then name)
  const docsOf = useMemo(() => {
    const byId = new Map(directory.map(u => [u.id, u]));
    const byName = new Map(directory.map(u => [u.name.trim().toLowerCase(), u]));
    return (tv: { id: string; name: string }): ComplianceDoc[] =>
      complianceOverrides[tv.id] || byId.get(tv.id)?.compliance || byName.get(tv.name.trim().toLowerCase())?.compliance || [];
  }, [directory, complianceOverrides]);

  const readiness = useMemo(() => current.map(t => {
    const travellers = t.travelers ?? [];
    const draft = t.status === "Draft";
    const changes = !draft && t.publishedSnapshot
      ? publishedChanges(t.publishedSnapshot, { events: t.events, start: t.start, end: t.end, info: t.info }).length : 0;
    const invited = travellers.filter(p => p.invitedAt).length;
    const inApp = joined?.get(t.id) ?? 0;
    const required = travellers.map(p => docsOf(p).filter(d => d.status !== "Not Required"));
    const tracked = required.some(r => r.length > 0);
    const owing = required.filter(r => r.some(d => d.status !== "Signed")).length;
    const bookings = t.events.filter(e => e.type === "flight" || e.type === "hotel");
    const withRef = bookings.filter(e => e.confNumber?.trim()).length;
    const openTasks = (t.tasks ?? []).filter(k => !k.completed).length;

    const checks: Check[] = [
      draft ? { state: "todo", text: "Draft" } : { state: "ok", text: "Published" },
      draft ? { state: "na", text: "Not published" } : changes ? { state: "todo", text: `${changes} to send` } : { state: "ok", text: "Up to date" },
      !travellers.length ? { state: "na", text: "No travellers" } : invited === travellers.length ? { state: "ok", text: "All invited" } : { state: "todo", text: `${travellers.length - invited} to invite` },
      membersError ? { state: "na", text: "Unknown" } : !travellers.length ? { state: "na", text: "No travellers" } : inApp >= travellers.length ? { state: "ok", text: `${inApp} of ${travellers.length}` } : { state: "todo", text: `${inApp} of ${travellers.length}` },
      !tracked ? { state: "na", text: "Not tracked" } : owing ? { state: "todo", text: `${owing} ${owing === 1 ? "person owes" : "people owe"}` } : { state: "ok", text: "Complete" },
      !bookings.length ? { state: "na", text: "No bookings" } : withRef === bookings.length ? { state: "ok", text: "All have refs" } : { state: "todo", text: `${bookings.length - withRef} missing` },
      !(t.tasks ?? []).length ? { state: "na", text: "No tasks" } : openTasks ? { state: "todo", text: `${openTasks} open` } : { state: "ok", text: "All done" },
    ];
    return { trip: t, checks, todo: checks.filter(c => c.state === "todo").length };
  }), [current, joined, membersError, docsOf]);

  // Tasks and trip info with a date, overdue or due within a week, most overdue first
  const due = useMemo(() => {
    const items: Array<{ key: string; kind: "task" | "info"; title: string; trip: Trip; days: number; who?: string }> = [];
    for (const t of trips) {
      for (const k of t.tasks ?? []) {
        if (k.completed || !k.dueDate) continue;
        const days = daysFrom(today, k.dueDate);
        if (days <= 7) items.push({ key: `t-${t.id}-${k.id}`, kind: "task", title: k.title, trip: t, days, who: k.assignee });
      }
      for (const i of t.info ?? []) {
        if (i.completed || !i.deadline) continue;
        const days = daysFrom(today, i.deadline);
        if (days <= 7) items.push({ key: `i-${t.id}-${i.id}`, kind: "info", title: i.title, trip: t, days });
      }
    }
    const undated = trips.reduce((n, t) => n + (t.tasks ?? []).filter(k => !k.completed && !k.dueDate).length, 0);
    return { items: items.sort((a, b) => a.days - b.days), undated };
  }, [trips, today]);

  const flights = useMemo(() => {
    const list = current.flatMap(t => t.events.filter(e => e.type === "flight").map(ev => ({ trip: t, ev, delay: delayOf(ev) })));
    const status = (s?: string) => (s ?? "").toLowerCase();
    return {
      total: list.length,
      delayed: list.filter(f => f.delay >= 15 || status(f.ev.status) === "delayed"),
      cancelled: list.filter(f => ["canceled", "cancelled", "diverted"].includes(status(f.ev.status))),
      landed: list.filter(f => f.ev.arrivedAt).length,
    };
  }, [current]);

  const flightIssues = flights.cancelled.length + flights.delayed.filter(f => !flights.cancelled.includes(f)).length;
  const openTrip = (id: string) => navigate(`/trip/${id}`);
  const dueText = (days: number) => days < 0 ? `${-days} ${days === -1 ? "day" : "days"} overdue` : days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`;

  return (
    <div className="space-y-6 mt-8">

      <ReportCard title="Readiness" sub="Every current and upcoming trip against the checks that matter before departure">
        {readiness.length === 0 ? <EmptyNote>No current or upcoming trips in this selection.</EmptyNote> : (
          <div className="-mx-4 sm:-mx-6">
            <div className="hidden lg:grid grid-cols-[minmax(0,2.2fr)_repeat(7,minmax(0,1fr))] gap-3 px-4 sm:px-6 pb-2 border-b border-border text-xs text-muted-foreground">
              <span>Trip</span>
              {CHECKS.map(c => <span key={c}>{c}</span>)}
            </div>
            <ul className="divide-y divide-border">
              {readiness.map(({ trip, checks, todo }) => {
                const days = daysFrom(today, trip.start);
                return (
                  <li key={trip.id}>
                    <button type="button" onClick={() => openTrip(trip.id)}
                      className="w-full text-left px-4 sm:px-6 py-3 hover:bg-secondary/60 transition-colors grid grid-cols-1 lg:grid-cols-[minmax(0,2.2fr)_repeat(7,minmax(0,1fr))] gap-x-3 gap-y-3 items-center">
                      <span className="flex items-center gap-3 min-w-0">
                        {trip.image
                          ? <img src={trip.image} alt="" loading="lazy" className="h-10 w-14 rounded-lg object-cover shrink-0" style={{ objectPosition: objectPosition(trip.imagePosition) }} />
                          : <span className="h-10 w-14 rounded-lg bg-secondary shrink-0" />}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground truncate">{trip.name}</span>
                          <span className="block text-xs text-muted-foreground truncate">
                            {dateRange(trip)}, {days > 0 ? `in ${days} ${days === 1 ? "day" : "days"}` : "travelling now"}
                            {todo === 0 && <span className="text-emerald-700 dark:text-emerald-400">, ready</span>}
                          </span>
                        </span>
                      </span>
                      <span className="hidden lg:contents">
                        {checks.map((c, i) => <CheckCell key={CHECKS[i]} check={c} label={CHECKS[i]} />)}
                      </span>
                      {/* Narrow screens: only what still needs doing */}
                      <span className="lg:hidden flex flex-col gap-1.5">
                        {todo === 0
                          ? <CheckCell check={{ state: "ok", text: "Every check done" }} label="Ready" />
                          : checks.map((c, i) => c.state === "todo" ? <CheckCell key={CHECKS[i]} check={c} label={CHECKS[i]} /> : null)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {membersError && <p className="text-xs text-amber-700 dark:text-amber-400 mt-4">{APP_MEMBERS_ERROR} The In the app check shows Unknown until it loads.</p>}
      </ReportCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ReportCard title="Tasks and deadlines" sub="Overdue or due in the next 7 days, most overdue first">
          {due.items.length === 0 ? (
            <EmptyNote>Nothing overdue or due this week. Add due dates to tasks in the Workspace to see them here.</EmptyNote>
          ) : (
            <ul className="-mx-2">
              {due.items.map(i => {
                const KindIcon = i.kind === "task" ? ListChecks : Info;
                return (
                  <li key={i.key}>
                    <button type="button" onClick={() => openTrip(i.trip.id)} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left hover:bg-secondary transition-colors">
                      <span className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        <KindIcon className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground truncate">{i.title}</span>
                        <span className="block text-xs text-muted-foreground truncate">{i.trip.name}{i.who ? `, ${i.who}` : i.kind === "info" ? ", trip info deadline" : ", unassigned"}</span>
                      </span>
                      <span className={`text-xs font-medium shrink-0 ${i.days < 0 ? "text-red-600 dark:text-red-400" : i.days <= 1 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{dueText(i.days)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {due.undated > 0 && <p className="text-xs text-muted-foreground mt-4">{due.undated} open {due.undated === 1 ? "task has" : "tasks have"} no due date, so {due.undated === 1 ? "it isn't" : "they aren't"} listed here.</p>}
        </ReportCard>

        <ReportCard title="Flight disruption" sub={`Delays and cancellations on current and upcoming trips${flights.landed ? `, ${flights.landed} landed so far` : ""}`}>
          {flightIssues === 0 ? (
            <EmptyNote>{flights.total ? "No delays or cancellations right now." : "No flights on current or upcoming trips."}</EmptyNote>
          ) : (
            <ul className="-mx-2">
              {[...flights.cancelled, ...flights.delayed.filter(f => !flights.cancelled.includes(f))].map(({ trip, ev, delay }) => {
                const cancelled = ["canceled", "cancelled", "diverted"].includes((ev.status ?? "").toLowerCase());
                return (
                  <li key={`${trip.id}-${ev.id}`}>
                    <button type="button" onClick={() => openTrip(trip.id)} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left hover:bg-secondary transition-colors">
                      <span className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        <AirplaneTilt className={`h-4 w-4 ${cancelled ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground truncate">{[ev.airline, ev.flightNum].filter(Boolean).join(" ") || ev.title}</span>
                        <span className="block text-xs text-muted-foreground truncate">{trip.name}, {shortDate(ev.date)}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className={`block text-xs font-semibold ${cancelled ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>{cancelled ? (ev.status ?? "Cancelled") : delay >= 15 ? `${delay} min late` : ev.status}</span>
                        {ev.revisedTime && <span className="block text-[11px] text-muted-foreground tabular-nums">{ev.time} now {ev.revisedTime}</span>}
                      </span>
                      <CaretRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ReportCard>
      </div>
    </div>
  );
}
