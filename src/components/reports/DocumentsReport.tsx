import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, WarningCircle, CheckCircle, CaretRight, PaperPlaneTilt, type Icon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { MessageDialog } from "@/components/shared/MessageDialog";
import { fetchTripMembers, type TripMember } from "@/services/firebaseTrips";
import { usePermissions } from "@/hooks/usePermissions";
import { parseTripDate } from "@/lib/dates";
import type { ComplianceDoc, Trip, User } from "@/types";
import { ReportCard, EmptyNote } from "./ReportParts";
import { shortDate } from "./format";

type Person = User & { compliance: ComplianceDoc[] };
export interface ComplianceSummary {
  travelers: Person[];
  signed: number;
  pending: number;
  expired: number;
  total: number;
  rate: number;
  byDocType: Array<{ name: string; signed: number; pending: number; expired: number }>;
}

const DOC_NAMES = ["Passport", "Travel Insurance", "Behavioural Agreement", "Code of Conduct Review", "Risk Assessment"];
const DOC_SHORT: Record<string, string> = { Passport: "Passport", "Travel Insurance": "Insurance", "Behavioural Agreement": "Behaviour", "Code of Conduct Review": "Conduct", "Risk Assessment": "Risk" };

const STATUS: Record<"Signed" | "Pending" | "Expired", { icon: Icon; text: string; chip: string; bar: string }> = {
  Signed: { icon: CheckCircle, text: "text-emerald-600 dark:text-emerald-400", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500" },
  Pending: { icon: Clock, text: "text-amber-600 dark:text-amber-400", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400", bar: "bg-amber-400" },
  Expired: { icon: WarningCircle, text: "text-red-600 dark:text-red-400", chip: "bg-red-500/10 text-red-700 dark:text-red-400", bar: "bg-red-400" },
};


const owing = (p: Person) => p.compliance.filter(d => d.status === "Pending" || d.status === "Expired");
const onTrip = (t: Trip, p: Person) => (t.travelers ?? []).some(tv => tv.id === p.id || tv.name.trim().toLowerCase() === p.name.trim().toLowerCase());
const dateRange = (t: Trip) => (t.end && t.end !== t.start ? `${shortDate(t.start)} to ${shortDate(t.end)}` : shortDate(t.start));

/** Who owes which document, trip by trip; one chase list; each trip's own files; then the full grid */
export function DocumentsReport({ data, trips }: { data: ComplianceSummary; trips: Trip[] }) {
  const navigate = useNavigate();
  const { isViewer } = usePermissions();
  const [today] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const ahead = useMemo(() => trips.filter(t => parseTripDate(t.end || t.start) >= today).sort((a, b) => (a.start || "").localeCompare(b.start || "")), [trips, today]);

  // App accounts linked to listed travellers, so a reminder can go straight to their phone
  const aheadIds = useMemo(() => ahead.map(t => t.id).sort().join(","), [ahead]);
  const [members, setMembers] = useState<TripMember[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!aheadIds) { queueMicrotask(() => { if (!cancelled) setMembers([]); }); return () => { cancelled = true; }; }
    fetchTripMembers(aheadIds.split(","))
      .then(list => { if (!cancelled) setMembers(list); })
      .catch(() => { if (!cancelled) setMembers([]); });
    return () => { cancelled = true; };
  }, [aheadIds]);
  const appKey = (tripId: string, personId: string) => {
    const m = members.find(x => x.trip_id === tripId && x.linked_traveler_id === personId);
    return m ? m.uid || m.device_id : null;
  };
  const [remind, setRemind] = useState<{ trip: Trip; key: string } | null>(null);

  const byTrip = useMemo(() => ahead.map(t => ({
    trip: t,
    people: data.travelers.filter(p => onTrip(t, p) && owing(p).length > 0).map(p => ({ person: p, docs: owing(p) })),
  })), [ahead, data.travelers]);

  const chase = useMemo(() => data.travelers.flatMap(p => owing(p).map(doc => ({
    person: p,
    doc,
    trips: ahead.filter(t => onTrip(t, p)),
  }))).sort((a, b) => (a.doc.date || "9999").localeCompare(b.doc.date || "9999") || a.person.name.localeCompare(b.person.name)), [data.travelers, ahead]);

  const tripFiles = useMemo(() => ahead.map(t => {
    const bookings = (type: "flight" | "hotel") => {
      const list = t.events.filter(e => e.type === type);
      return { total: list.length, withFile: list.filter(e => (e.documents?.length ?? 0) > 0).length };
    };
    return {
      trip: t,
      tripDocs: t.documents?.length ?? 0,
      infoDocs: (t.info ?? []).reduce((s, i) => s + (i.documents?.length ?? 0), 0),
      flights: bookings("flight"),
      stays: bookings("hotel"),
    };
  }), [ahead]);

  const waiting = data.pending + data.expired;

  const bookingFiles = (
      <ReportCard title="Booking files" sub="Vouchers and tickets attached to flights and stays on current and upcoming trips">
        {(() => {
          if (tripFiles.length === 0) return <EmptyNote>No current or upcoming trips in this selection.</EmptyNote>;
          const anyFile = tripFiles.some(r => r.flights.withFile + r.stays.withFile + r.tripDocs + r.infoDocs > 0);
          const booked = tripFiles.reduce((s, r) => s + r.flights.total + r.stays.total, 0);
          if (!anyFile) return (
            <EmptyNote>No files attached yet on {tripFiles.length} upcoming {tripFiles.length === 1 ? "trip" : "trips"} ({booked} flights and stays). Attach vouchers and tickets to bookings in the Workspace and progress shows here.</EmptyNote>
          );
          return (
            <ul className="-mx-2">
              {tripFiles.map(r => {
                const total = r.flights.total + r.stays.total, withFile = r.flights.withFile + r.stays.withFile;
                const pct = total ? Math.round((withFile / total) * 100) : 0;
                const extras = [r.tripDocs && `${r.tripDocs} trip ${r.tripDocs === 1 ? "file" : "files"}`, r.infoDocs && `${r.infoDocs} in trip info`].filter(Boolean).join(", ");
                return (
                  <li key={r.trip.id}>
                    <button onClick={() => navigate(`/trip/${r.trip.id}`)} className="w-full flex items-center gap-4 px-2 py-2.5 rounded-lg text-left hover:bg-secondary transition-colors">
                      <div className="min-w-0 w-48 shrink-0">
                        <p className="text-sm font-medium text-foreground truncate">{r.trip.name}</p>
                        <p className="text-xs text-muted-foreground">{dateRange(r.trip)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <span className={total && withFile < total ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>{total ? `${withFile} of ${total} bookings have a file` : "No flights or stays booked"}</span>
                          {extras && <span className="text-muted-foreground truncate">{extras}</span>}
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden" role="img" aria-label={`${withFile} of ${total} bookings have a file`}>
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <CaretRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          );
        })()}
      </ReportCard>
  );

  // Nothing tracked yet: say how to start instead of a page of zeros
  if (data.total === 0) return (
    <div className="space-y-6 mt-8">
      <ReportCard title="Traveller documents" sub="Passports, insurance, agreements and anything else travellers need to sign">
        <EmptyNote>No documents are tracked for these {data.travelers.length} travellers yet. On the Travellers page, use Assign a document to ask people for what they need to sign, and progress shows here.</EmptyNote>
      </ReportCard>
      {bookingFiles}
    </div>
  );

  return (
    <div className="space-y-6 mt-8">

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [&>section]:h-full">
        <ReportCard title="Outstanding by trip" sub="Current and upcoming trips, and who still owes what">
          {ahead.length === 0 ? <EmptyNote>No current or upcoming trips in this selection.</EmptyNote>
            : byTrip.every(r => r.people.length === 0) ? <EmptyNote>Everyone on current and upcoming trips is up to date.</EmptyNote> : (
            <ul className="space-y-5">
              {byTrip.filter(r => r.people.length > 0).map(({ trip, people }) => (
                <li key={trip.id}>
                  <button onClick={() => navigate(`/trip/${trip.id}`)} className="w-full flex items-baseline justify-between gap-3 text-left group">
                    <span className="text-sm font-medium text-foreground truncate group-hover:underline underline-offset-2">{trip.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{shortDate(trip.start)}, {people.length} {people.length === 1 ? "person" : "people"}</span>
                  </button>
                  <ul className="mt-2 space-y-2">
                    {people.map(({ person, docs }) => (
                      <li key={person.id} className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-[11px] font-semibold text-foreground shrink-0">{person.initials}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground truncate">{person.name}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {docs.map(d => {
                              const s = STATUS[d.status as "Pending" | "Expired"];
                              return <span key={d.name} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${s.chip}`}><s.icon className="h-3 w-3" />{d.name}</span>;
                            })}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </ReportCard>

        <ReportCard title="Chase list" sub="Every waiting or expired document, oldest first">
          {chase.length === 0 ? <EmptyNote>Nothing to chase. Every required document is signed.</EmptyNote> : (
            <ul className="-mx-2">
              {chase.slice(0, 12).map(({ person, doc, trips: theirs }) => {
                const s = STATUS[doc.status as "Pending" | "Expired"];
                const reach = theirs.map(t => ({ trip: t, key: appKey(t.id, person.id) })).find(r => r.key);
                return (
                  <li key={`${person.id}-${doc.name}`} className="flex items-center gap-3 px-2 py-2.5 rounded-lg">
                    <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0"><s.icon className={`h-4 w-4 ${s.text}`} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate"><span className="font-medium">{person.name}</span>, {doc.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {doc.status === "Expired" ? "Expired" : "Waiting"}{doc.date ? ` since ${shortDate(doc.date)}` : ""}{theirs.length ? `, ${theirs.map(t => t.name).join(", ")}` : ", no upcoming trip"}
                      </p>
                    </div>
                    {!isViewer && (reach
                      ? <Button variant="outline" size="sm" onClick={() => setRemind({ trip: reach.trip, key: reach.key! })}><PaperPlaneTilt className="h-3.5 w-3.5" /> Remind</Button>
                      : <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/travelers")} title="Not on the app for an upcoming trip: contact them from Travellers">Contact<CaretRight className="h-3.5 w-3.5" /></Button>)}
                  </li>
                );
              })}
            </ul>
          )}
          {chase.length > 12 && <p className="text-xs text-muted-foreground mt-3">And {chase.length - 12} more. Export the CSV for the full list.</p>}
        </ReportCard>
      </div>

      {bookingFiles}

      <ReportCard title="By document" sub={`${waiting} waiting or expired across ${data.byDocType.length} documents`}>
        <ul className="space-y-4">
          {data.byDocType.map(d => {
            const n = d.signed + d.pending + d.expired;
            return (
              <li key={d.name}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-foreground">{d.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{n ? `${d.signed} of ${n} signed` : "Not required"}</span>
                </div>
                <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden bg-secondary gap-px" role="img" aria-label={`${d.name}: ${d.signed} signed, ${d.pending} waiting, ${d.expired} expired`}>
                  {(["Signed", "Pending", "Expired"] as const).map(k => {
                    const v = k === "Signed" ? d.signed : k === "Pending" ? d.pending : d.expired;
                    return v ? <div key={k} className={STATUS[k].bar} style={{ width: `${(v / n) * 100}%` }} /> : null;
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </ReportCard>

      <ReportCard title="Everyone" sub="Each person and document">
        <div className="overflow-x-auto -mx-4 sm:-mx-6">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left font-medium px-4 sm:px-6 pb-2">Person</th>
                {DOC_NAMES.map(n => <th key={n} className="text-center font-medium px-2 pb-2">{DOC_SHORT[n]}</th>)}
                <th className="text-right font-medium px-4 sm:px-6 pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.travelers.map(p => {
                const owed = owing(p);
                const nExpired = owed.filter(d => d.status === "Expired").length;
                const nWaiting = owed.length - nExpired;
                const state = owed.length === 0 ? { label: "Complete", cls: "text-muted-foreground" } : nExpired ? { label: `${nExpired} expired${nWaiting ? `, ${nWaiting} waiting` : ""}`, cls: "text-red-600 dark:text-red-400" } : { label: `${nWaiting} waiting`, cls: "text-amber-700 dark:text-amber-400" };
                return (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 sm:px-6 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-[11px] font-semibold text-foreground shrink-0">{p.initials}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                          {p.role && <p className="text-xs text-muted-foreground truncate">{p.role}</p>}
                        </div>
                      </div>
                    </td>
                    {DOC_NAMES.map(n => {
                      const doc = p.compliance.find(d => d.name === n);
                      const status = doc?.status ?? "Not Required";
                      // Words for what needs doing, a quiet tick when signed, nothing when it isn't required
                      return (
                        <td key={n} className="text-center px-2 py-2.5 text-xs" title={`${n}: ${status}`}>
                          {status === "Signed" ? <CheckCircle className="inline h-4 w-4 text-muted-foreground" aria-label="Signed" />
                            : status === "Expired" ? <span className="font-medium text-red-600 dark:text-red-400">Expired</span>
                            : status === "Pending" ? <span className="text-amber-700 dark:text-amber-400">Waiting</span>
                            : <span className="sr-only">Not required</span>}
                        </td>
                      );
                    })}
                    <td className={`text-right px-4 sm:px-6 py-2.5 text-xs whitespace-nowrap ${state.cls}`}>{state.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ReportCard>

      {remind && (
        <MessageDialog
          open
          onOpenChange={o => { if (!o) setRemind(null); }}
          trips={[remind.trip]}
          initialTripId={remind.trip.id}
          initialPeople={[remind.key]}
        />
      )}
    </div>
  );
}
