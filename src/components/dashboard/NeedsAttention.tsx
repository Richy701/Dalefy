import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { objectPosition } from "@/lib/imagePosition";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  AirplaneTilt, CalendarCheck, CaretRight, CheckCircle, EnvelopeSimple, Flag, ListChecks, PaperPlaneTilt, Warning,
} from "@phosphor-icons/react";
import { firebaseDb, isFirebaseConfigured } from "@/services/firebase";
import { publishedChanges } from "@/lib/tripChanges";
import { parseTripDate } from "@/lib/dates";
import type { Trip } from "@/types";

/** Something on a trip that's waiting on the organiser, with where to go to sort it */
export interface AttentionItem {
  key: string;
  tripId: string;
  tripName: string;
  message: string;
  action: string;
  to: string;
  icon: typeof Warning;
  urgent?: boolean;
  /** Not urgent yet, but the trip is close: shown in amber above the rest */
  soon?: boolean;
}

const DAY = 86_400_000;

/** "14:30" or "2:30 PM" in minutes; null when there's no time */
function minutes(t?: string): number | null {
  const m = (t ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) h = h % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const dayMonth = (iso: string) => parseTripDate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Everything waiting on the organiser across trips: drafts leaving soon, unpublished changes,
 * travellers not invited, tasks and deadlines, flight problems and photo reports.
 * `extra` carries the page's own checks (documents, empty trips) so they sit in the same list.
 */
export function NeedsAttention({ trips, extra = [] }: { trips: Trip[]; extra?: AttentionItem[] }) {
  const navigate = useNavigate();
  const [now] = useState(() => Date.now());
  const [reports, setReports] = useState<Array<{ trip_id: string; media_id: string }>>([]);
  const tripIds = useMemo(() => trips.map(t => t.id).sort().join(","), [trips]);

  // Photo reports, a trip at a time the way the rules allow; a refusal just means none are shown
  useEffect(() => {
    if (!isFirebaseConfigured() || !tripIds) return;
    let cancelled = false;
    Promise.all(tripIds.split(",").map(id =>
      getDocs(query(collection(firebaseDb(), "media_reports"), where("trip_id", "==", id)))
        .then(s => s.docs.map(d => d.data() as { trip_id: string; media_id: string })).catch(() => []),
    )).then(lists => { if (!cancelled) setReports(lists.flat()); });
    return () => { cancelled = true; };
  }, [tripIds]);

  const items = useMemo(() => {
    const out: AttentionItem[] = [];
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    for (const t of trips) {
      const start = parseTripDate(t.start), end = parseTripDate(t.end);
      if (end < today) continue;
      const daysOut = Math.ceil((start.getTime() - today.getTime()) / DAY);
      const live = daysOut <= 0;
      const open = `/trip/${t.id}`;

      if (t.status === "Draft" && daysOut >= 0 && daysOut <= 14) {
        out.push({ key: `${t.id}-draft`, tripId: t.id, tripName: t.name, icon: PaperPlaneTilt, urgent: daysOut <= 7, to: `${open}?do=publish`, action: "Publish",
          message: "Still a draft" });
      }
      if (t.status !== "Draft" && t.publishedSnapshot) {
        const changes = publishedChanges(t.publishedSnapshot, { events: t.events, start: t.start, end: t.end, info: t.info });
        if (changes.length) out.push({ key: `${t.id}-changes`, tripId: t.id, tripName: t.name, icon: PaperPlaneTilt, to: `${open}?do=publish`, action: "Publish",
          message: changes.length === 1 ? `Not published yet: ${changes[0].toLowerCase()}` : `${plural(changes.length, "unpublished change")}` });
      }
      const notInvited = (t.travelers ?? []).filter(tv => !tv.invitedAt);
      if (t.status !== "Draft" && notInvited.length) {
        const noEmail = notInvited.filter(tv => !tv.email).length;
        const canEmail = notInvited.length - noEmail;
        // Two different jobs, so two rows: emailing those we can reach, and finding addresses for those we can't
        if (canEmail) out.push({ key: `${t.id}-invite`, tripId: t.id, tripName: t.name, icon: EnvelopeSimple, to: `${open}?do=email`, soon: daysOut <= 14, action: "Email them",
          message: `${plural(canEmail, "traveller")} not emailed` });
        if (noEmail) out.push({ key: `${t.id}-no-email`, tripId: t.id, tripName: t.name, icon: EnvelopeSimple, to: `${open}?do=add-emails`, soon: daysOut <= 14, action: "Add emails",
          message: `${plural(noEmail, "traveller")} with no email` });
      }
      const dueTasks = (t.tasks ?? []).filter(task => !task.completed && task.dueDate && parseTripDate(task.dueDate).getTime() - today.getTime() <= 7 * DAY);
      if (dueTasks.length) {
        const overdue = dueTasks.filter(task => parseTripDate(task.dueDate!) < today).length;
        out.push({ key: `${t.id}-tasks`, tripId: t.id, tripName: t.name, icon: ListChecks, urgent: overdue > 0, to: `${open}?panel=tasks`, action: "Tasks",
          message: overdue ? `${plural(overdue, "task")} overdue${dueTasks.length > overdue ? `, ${dueTasks.length - overdue} due this week` : ""}` : `${plural(dueTasks.length, "task")} due this week` });
      }
      const deadlines = (t.info ?? []).filter(i => !i.completed && i.deadline && parseTripDate(i.deadline).getTime() - today.getTime() <= 14 * DAY)
        .sort((a, b) => a.deadline!.localeCompare(b.deadline!));
      if (deadlines.length) {
        out.push({ key: `${t.id}-deadline`, tripId: t.id, tripName: t.name, icon: CalendarCheck, urgent: parseTripDate(deadlines[0].deadline!) < today, to: open, action: "Open",
          message: `${deadlines[0].title}, due ${dayMonth(deadlines[0].deadline!)}${deadlines.length > 1 ? `, plus ${deadlines.length - 1} more` : ""}` });
      }
      if (live || daysOut <= 1) {
        for (const ev of t.events) {
          if (ev.type !== "flight") continue;
          const status = (ev.status ?? "").toLowerCase();
          const planned = minutes(ev.time), revised = minutes(ev.revisedTime);
          const late = planned != null && revised != null ? revised - planned : 0;
          const flight = [ev.airline, ev.flightNum].filter(Boolean).join(" ") || ev.title;
          if (["canceled", "cancelled", "diverted"].includes(status)) {
            out.push({ key: `${t.id}-${ev.id}`, tripId: t.id, tripName: t.name, icon: AirplaneTilt, urgent: true, to: `${open}?event=${ev.id}`, action: "View",
              message: `${flight} is ${status === "diverted" ? "diverted" : "cancelled"}` });
          } else if (late >= 15 || status === "delayed") {
            out.push({ key: `${t.id}-${ev.id}`, tripId: t.id, tripName: t.name, icon: AirplaneTilt, urgent: late >= 60, to: `${open}?event=${ev.id}`, action: "View",
              message: late >= 15 ? `${flight} is ${late} min late, now ${ev.revisedTime}` : `${flight} is delayed` });
          }
        }
      }
      const reported = new Set(reports.filter(r => r.trip_id === t.id && (t.media ?? []).some(m => m.id === r.media_id)).map(r => r.media_id)).size;
      if (reported) out.push({ key: `${t.id}-reports`, tripId: t.id, tripName: t.name, icon: Flag, urgent: true, to: "/media", action: "Review",
        message: `${plural(reported, "photo")} reported by travellers` });
    }
    return [...out.filter(i => i.urgent), ...out.filter(i => !i.urgent && i.soon), ...extra, ...out.filter(i => !i.urgent && !i.soon)];
  }, [trips, reports, extra, now]);

  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, 6);

  // One block per trip: trips with something urgent first, then the soonest to leave
  const groups = useMemo(() => {
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const startOf = (id: string) => { const t = trips.find(trip => trip.id === id); return t ? parseTripDate(t.start).getTime() : Infinity; };
    const when = (id: string) => {
      const t = trips.find(trip => trip.id === id);
      if (!t) return "";
      if (parseTripDate(t.end) < today) return "Ended";
      const days = Math.ceil((parseTripDate(t.start).getTime() - today.getTime()) / DAY);
      return days <= 0 ? "On now" : days === 1 ? "Departs tomorrow" : `Departs in ${days} days`;
    };
    const byTrip = new Map<string, AttentionItem[]>();
    for (const item of shown) byTrip.set(item.tripId, [...(byTrip.get(item.tripId) ?? []), item]);
    return [...byTrip.entries()]
      .map(([tripId, rows]) => ({ tripId, tripName: rows[0].tripName, trip: trips.find(t => t.id === tripId), when: when(tripId), rows, urgent: rows.some(r => r.urgent) }))
      .sort((a, b) => Number(b.urgent) - Number(a.urgent) || startOf(a.tripId) - startOf(b.tripId));
  }, [shown, trips, now]);

  return (
    <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        {items.length > 0 && (
          <span className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${items.some(i => i.urgent) ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
            <Warning className="h-5 w-5" weight="fill" />
          </span>
        )}
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
            {items.length ? `${plural(items.length, "thing")} ${items.length === 1 ? "needs" : "need"} you` : "Needs attention"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {items.length ? "Most urgent trips first, then the soonest to leave." : "Drafts, invites, tasks, flights and photo reports"}
          </p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="mx-5 mb-5 flex items-center gap-3 rounded-xl bg-secondary/60 px-4 py-3.5">
          <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" weight="fill" />
          <p className="text-sm text-foreground">All caught up. Nothing is waiting on you.</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border border-t border-border">
            {groups.map(group => (
              <section key={group.tripId} aria-label={group.tripName} className="px-5 py-3.5">
                <div className="flex items-center gap-3 pb-1.5">
                  <span className="h-9 w-12 shrink-0 overflow-hidden rounded-lg bg-secondary">
                    {group.trip?.image && <img src={group.trip.image} alt="" loading="lazy" style={{ objectPosition: objectPosition(group.trip.imagePosition) }} className="h-full w-full object-cover" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground truncate">{group.tripName}</h3>
                    {group.when && <p className="text-xs text-muted-foreground">{group.when}</p>}
                  </div>
                </div>
                <ul>
                  {group.rows.map(item => {
                    const Icon = item.icon;
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => navigate(item.to)}
                          className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-secondary/50 transition-colors"
                        >
                          <Icon aria-hidden="true" weight={item.urgent || item.soon ? "bold" : "regular"} className={`h-4 w-4 shrink-0 ${
                            item.urgent ? "text-red-600 dark:text-red-400"
                              : item.soon ? "text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground"}`} />
                          <span className="min-w-0 flex-1 text-sm text-foreground">{item.message}</span>
                          <span className={`inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                            item.urgent ? "bg-primary text-primary-foreground group-hover:opacity-90"
                              : "border border-border bg-card text-foreground group-hover:bg-secondary"}`}>
                            {item.action}<CaretRight className="h-3 w-3" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          {items.length > 6 && (
            <button type="button" onClick={() => setShowAll(s => !s)} className="w-full border-t border-border px-5 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
              {showAll ? "Show fewer" : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

