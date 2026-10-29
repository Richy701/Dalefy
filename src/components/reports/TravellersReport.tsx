import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EnvelopeSimple, At, DeviceMobile, UserCircleCheck, Users, Phone, ForkKnife, FirstAid, Crown, type Icon } from "@phosphor-icons/react";
import { fetchTripMembers, APP_MEMBERS_ERROR, type TripMember } from "@/services/firebaseTrips";
import { personOf } from "@/lib/appMembers";
import { useDirectoryTravelers } from "@/context/directory";
import { Button } from "@/components/ui/button";
import { parseTripDate } from "@/lib/dates";
import { timeAgo } from "@/lib/timeAgo";
import { objectPosition } from "@/lib/imagePosition";
import { Spinner } from "@/components/ui/spinner";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import type { Trip, TravelerProfile } from "@/types";
import { ReportCard, EmptyNote } from "./ReportParts";
import { shortDate } from "./format";

const WEEK_MS = 7 * 86_400_000;
const NAMES_SHOWN = 5;
const DETAIL_KINDS: Array<{ key: "emergency" | "dietary" | "phone"; label: string; icon: Icon }> = [
  { key: "emergency", label: "emergency contact", icon: FirstAid },
  { key: "dietary", label: "dietary needs", icon: ForkKnife },
  { key: "phone", label: "phone", icon: Phone },
];
const PEOPLE_PAGE = 12;
// Raw buttons drop the browser's default border and get the app's focus ring
const LINK_BTN = "text-xs font-medium text-link hover:underline outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-sm";
type Listed = NonNullable<Trip["travelers"]>[number];

const dateRange = (t: Trip) => (t.end && t.end !== t.start ? `${shortDate(t.start)} to ${shortDate(t.end)}` : shortDate(t.start));
const platformName = (p?: string | null) => (p === "ios" ? "iPhone" : p === "android" ? "Android" : null);

function Thumb({ trip }: { trip: Trip }) {
  return trip.image
    ? <img src={trip.image} alt="" loading="lazy" className="h-10 w-10 rounded-lg object-cover shrink-0" style={{ objectPosition: objectPosition(trip.imagePosition) }} />
    : <div className="h-10 w-10 rounded-lg bg-secondary shrink-0" />;
}

/** One kind of gap on a trip: who, and the one place to fix it */
function Gap({ icon: Icon, label, names, action, onAction }: { icon: Icon; label: string; names: string[]; action: string; onAction: () => void }) {
  if (!names.length) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-amber-700 dark:text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-foreground"><span className="font-semibold tabular-nums">{names.length}</span> {label}</p>
          <button type="button" onClick={onAction} className={`${LINK_BTN} shrink-0`}>{action}</button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{names.join(", ")}</p>
      </div>
    </div>
  );
}

/**
 * Who is ready to travel and who isn't, what's missing from their details, who leads each group,
 * and everyone's history. Only from data the app holds: trip lists, the directory and app joins.
 */
export function TravellersReport({ trips }: { trips: Trip[] }) {
  const navigate = useNavigate();
  const [directory] = useDirectoryTravelers();
  const [members, setMembers] = useState<TripMember[] | null>(null);
  // Fixed when the tab opens, so "this week" and "upcoming" don't shift while it's on screen
  const [now] = useState(() => Date.now());
  const [showAll, setShowAll] = useState(false);
  const [openTrips, setOpenTrips] = useState<Set<string>>(() => new Set());
  const tripIds = useMemo(() => trips.map(t => t.id).sort().join(","), [trips]);

  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchTripMembers(tripIds ? tripIds.split(",") : [])
      .then(list => { if (!cancelled) setMembers(list); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [tripIds, reload]);

  const profiles = useMemo(() => new Map<string, TravelerProfile | undefined>(directory.map(u => [u.id, u.profile])), [directory]);

  const data = useMemo(() => {
    if (!members) return null;
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const byTrip = new Map<string, TripMember[]>();
    for (const m of members) byTrip.set(m.trip_id, [...(byTrip.get(m.trip_id) ?? []), m]);
    // App joins that picked a name from the trip's list, by traveller id
    const linked = new Map<string, TripMember[]>();
    for (const m of members) if (m.linked_traveler_id) linked.set(m.linked_traveler_id, [...(linked.get(m.linked_traveler_id) ?? []), m]);

    const isCurrent = (t: Trip) => parseTripDate(t.end || t.start) >= today;
    const sorted = [...trips].sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    const upcoming = sorted.filter(isCurrent);

    const tripRows = sorted.map(t => {
      const listed = t.travelers ?? [];
      const onTrip = byTrip.get(t.id) ?? [];
      const inAppPeople = new Set(onTrip.map(personOf));
      const linkedIds = new Set(onTrip.map(m => m.linked_traveler_id).filter(Boolean));
      const leaders = [...new Map(onTrip.filter(m => m.role === "leader").map(m => [personOf(m), m])).values()];
      return {
        trip: t,
        size: Math.max(listed.length, inAppPeople.size),
        noEmail: listed.filter(p => !p.email?.trim()),
        notInvited: listed.filter(p => p.email?.trim() && !p.invitedAt),
        invitedNotJoined: listed.filter(p => p.invitedAt && !linkedIds.has(p.id)),
        // Joins that never picked a name from this trip's list can't be matched to a traveller
        unmatched: new Set(onTrip.filter(m => !m.linked_traveler_id || !listed.some(p => p.id === m.linked_traveler_id)).map(personOf)).size,
        leaders,
        current: isCurrent(t),
      };
    });

    // Everyone listed on these trips, once, with their history
    const people = new Map<string, { traveller: Listed; trips: Trip[]; invitedForNext: boolean }>();
    for (const t of sorted) for (const p of t.travelers ?? []) {
      const row = people.get(p.id) ?? { traveller: p, trips: [], invitedForNext: false };
      row.trips.push(t);
      people.set(p.id, row);
    }
    const personRows = [...people.values()].map(({ traveller, trips: theirs }) => {
      const joins = linked.get(traveller.id) ?? [];
      const latest = joins.filter(m => m.last_seen_at).sort((a, b) => (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? ""))[0];
      const next = theirs.find(isCurrent) ?? null;
      return {
        traveller,
        trips: theirs,
        next,
        invitedForNext: !!next?.travelers?.find(x => x.id === traveller.id)?.invitedAt,
        invitedAny: theirs.some(t => t.travelers?.find(x => x.id === traveller.id)?.invitedAt),
        lastSeen: latest?.last_seen_at ?? null,
        platform: platformName(latest?.platform ?? joins.find(m => m.platform)?.platform),
        inApp: joins.length > 0,
      };
    }).sort((a, b) => (a.next?.start ?? "9999").localeCompare(b.next?.start ?? "9999") || a.traveller.name.localeCompare(b.traveller.name));

    // Details the team chases before departure, summed per current or upcoming trip
    const lacks = (id: string, key: "emergency" | "dietary" | "phone") => {
      const pr = profiles.get(id);
      if (key === "emergency") return !pr?.emergencyName?.trim() || !pr?.emergencyPhone?.trim();
      if (key === "dietary") return !pr?.dietary?.trim();
      return !pr?.phone?.trim();
    };
    const missing = upcoming.map(t => {
      const listed = t.travelers ?? [];
      const byKind = Object.fromEntries(DETAIL_KINDS.map(k => [k.key, listed.filter(p => lacks(p.id, k.key)).map(p => p.name)])) as Record<"emergency" | "dietary" | "phone", string[]>;
      return { trip: t, listed: listed.length, byKind };
    }).filter(r => r.listed && DETAIL_KINDS.some(k => r.byKind[k.key].length));
    const onUpcoming = personRows.filter(p => p.next);

    // In the app = listed travellers who picked their name; joins that never did are counted apart
    const allInApp = personRows.filter(p => p.inApp).length;
    const unmatchedJoins = new Set(members.filter(m => !m.linked_traveler_id || !people.has(m.linked_traveler_id)).map(personOf)).size;
    const activeWeek = new Set(members.filter(m => m.last_seen_at && now - Date.parse(m.last_seen_at) < WEEK_MS).map(personOf)).size;
    const ready = onUpcoming.filter(p => p.traveller.email?.trim() && p.invitedForNext && p.inApp).length;
    return { tripRows, upcoming, personRows, missing, allInApp, unmatchedJoins, activeWeek, upcomingListed: onUpcoming.length, ready };
  }, [members, trips, now, profiles]);

  if (error) {
    return (
      <div className="mt-8 flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5">
        <p className="text-sm text-amber-700 dark:text-amber-400">{APP_MEMBERS_ERROR} Check your connection and try again.</p>
        <Button variant="outline" size="sm" onClick={() => { setError(false); setMembers(null); setReload(n => n + 1); }}>Try again</Button>
      </div>
    );
  }

  if (!data) {
    return <div className="flex items-center justify-center py-24"><Spinner className="size-6 text-muted-foreground" /></div>;
  }

  const notReady = data.tripRows.filter(r => r.current && (r.noEmail.length || r.notInvited.length || r.invitedNotJoined.length));
  const groups = data.tripRows.filter(r => r.current);
  const shownPeople = showAll ? data.personRows : data.personRows.slice(0, PEOPLE_PAGE);

  return (
    <div className="space-y-6 mt-8">

      <ReportCard title="Who's not ready" sub="Current and upcoming trips: what's stopping each traveller getting the itinerary">
        {data.upcoming.length === 0 ? <EmptyNote>No current or upcoming trips in this selection.</EmptyNote>
          : notReady.length === 0 ? <EmptyNote>Everyone on current and upcoming trips has an email, an invite and the app.</EmptyNote> : (
          <div className="divide-y divide-border -my-4">
            {notReady.map(r => (
              <div key={r.trip.id} className="py-4 space-y-3">
                <button type="button" onClick={() => navigate(`/trip/${r.trip.id}`)} className="flex items-center gap-3 text-left group rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                  <Thumb trip={r.trip} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate group-hover:underline">{r.trip.name}</p>
                    <p className="text-xs text-muted-foreground">{dateRange(r.trip)}, {r.size} {r.size === 1 ? "traveller" : "travellers"}</p>
                  </div>
                </button>
                <div className="space-y-3 sm:pl-[52px]">
                  <Gap icon={At} label={r.noEmail.length === 1 ? "has no email" : "have no email"} names={r.noEmail.map(p => p.name)} action="Add emails" onAction={() => navigate("/travelers")} />
                  <Gap icon={EnvelopeSimple} label="not invited yet" names={r.notInvited.map(p => p.name)} action="Send invites" onAction={() => navigate(`/trip/${r.trip.id}`)} />
                  <Gap icon={DeviceMobile} label="invited, not in the app" names={r.invitedNotJoined.map(p => p.name)} action="Open trip" onAction={() => navigate(`/trip/${r.trip.id}`)} />
                  {r.unmatched > 0 && r.invitedNotJoined.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {r.unmatched} {r.unmatched === 1 ? "person joined" : "people joined"} the app without picking their name, so some of these may already be in.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ReportCard>

      <ReportCard title="Missing details" sub="On current and upcoming trips, from each traveller's details in Travellers">
        {data.upcoming.length === 0 ? <EmptyNote>No current or upcoming trips in this selection.</EmptyNote>
          : data.missing.length === 0 ? <EmptyNote>Everyone travelling soon has an emergency contact, dietary needs and a phone on file.</EmptyNote>
          // Nobody has any details on file yet: say it once instead of a row of "N of N missing" per trip
          : data.missing.every(r => DETAIL_KINDS.every(k => r.byKind[k.key].length === r.listed)) ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-4">
              <p className="text-sm text-muted-foreground">No emergency contacts, dietary needs or phone numbers are on file yet for the {data.missing.reduce((n, r) => n + r.listed, 0)} travellers on upcoming trips.</p>
              <button type="button" onClick={() => navigate("/travelers")} className={`${LINK_BTN} shrink-0`}>Add details in Travellers</button>
            </div>
          ) : (
          <div className="-mx-4 sm:-mx-6 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left font-medium px-4 sm:px-6 pb-2">Trip</th>
                  {DETAIL_KINDS.map(k => <th key={k.key} className="text-right font-medium px-3 pb-2 whitespace-nowrap">No {k.label}</th>)}
                  <th className="w-28 pr-4 sm:pr-6" />
                </tr>
              </thead>
              <tbody>
                {data.missing.map(r => {
                  const open = openTrips.has(r.trip.id);
                  return (
                    <Fragment key={r.trip.id}>
                      <tr className="border-b border-border last:border-0">
                        <td className="px-4 sm:px-6 py-2.5">
                          <button type="button" onClick={() => navigate(`/trip/${r.trip.id}`)} className="flex items-center gap-3 text-left group min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                            <Thumb trip={r.trip} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate group-hover:underline">{r.trip.name}</p>
                              <p className="text-xs text-muted-foreground">{shortDate(r.trip.start)}, {r.listed} {r.listed === 1 ? "traveller" : "travellers"}</p>
                            </div>
                          </button>
                        </td>
                        {DETAIL_KINDS.map(k => {
                          const n = r.byKind[k.key].length;
                          return (
                            <td key={k.key} className="px-3 py-2.5 text-right tabular-nums">
                              {n ? <span className="text-amber-700 dark:text-amber-400">{n}<span className="text-muted-foreground"> of {r.listed}</span></span> : <span className="sr-only">None missing</span>}
                            </td>
                          );
                        })}
                        <td className="pr-4 sm:pr-6 py-2.5 text-right">
                          <button type="button" onClick={() => setOpenTrips(prev => { const next = new Set(prev); if (next.has(r.trip.id)) next.delete(r.trip.id); else next.add(r.trip.id); return next; })} className={LINK_BTN}>
                            {open ? "Hide people" : "Show people"}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border">
                          <td colSpan={DETAIL_KINDS.length + 2} className="px-4 sm:px-6 pb-3 pt-0">
                            <div className="sm:pl-[52px] space-y-1.5">
                              {DETAIL_KINDS.filter(k => r.byKind[k.key].length).map(k => {
                                const names = r.byKind[k.key];
                                return (
                                  <p key={k.key} className="text-xs text-muted-foreground">
                                    <span className="text-foreground font-medium">No {k.label}:</span> {names.slice(0, NAMES_SHOWN).join(", ")}{names.length > NAMES_SHOWN ? ` +${names.length - NAMES_SHOWN} more` : ""}
                                  </p>
                                );
                              })}
                              <button type="button" onClick={() => navigate("/travelers")} className={LINK_BTN}>Add details in Travellers</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data.missing.length > 0 && <p className="text-xs text-muted-foreground mt-4">A blank dietary field may just mean none. Add "None" in their details to clear it.</p>}
      </ReportCard>

      <ReportCard title="Leaders and groups" sub="Who leads each group on the ground, and how big it is">
          {groups.length === 0 ? <EmptyNote>No current or upcoming trips in this selection.</EmptyNote> : (
            <ul className="divide-y divide-border -my-3">
              {groups.map(r => {
                const organiser = r.trip.organizer;
                const leaderNames = r.leaders.map(m => m.name).filter(Boolean);
                return (
                  <li key={r.trip.id} className="py-3 flex items-start gap-3">
                    <Thumb trip={r.trip} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <button type="button" onClick={() => navigate(`/trip/${r.trip.id}`)} className="text-sm font-semibold text-foreground truncate text-left hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40">{r.trip.name}</button>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0 inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{r.size}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{dateRange(r.trip)}</p>
                      <div className="mt-1.5 space-y-1 text-xs">
                        {leaderNames.length > 0 && (
                          <p className="text-foreground flex items-center gap-1.5"><Crown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />Leader in the app: {leaderNames.join(", ")}</p>
                        )}
                        {organiser?.name && (
                          <p className="text-foreground flex items-center gap-1.5 min-w-0">
                            <UserCircleCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">Organiser: {organiser.name}{organiser.role ? `, ${organiser.role}` : ""}{organiser.phone ? `, ${organiser.phone}` : ""}</span>
                          </p>
                        )}
                        {!leaderNames.length && !organiser?.name && <p className="text-amber-700 dark:text-amber-400">No leader or organiser set</p>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ReportCard>

      <ReportCard title="Everyone" sub="Each traveller on these trips: how often they've travelled with you, what's next, and the app">
        {data.personRows.length === 0 ? <EmptyNote>No travellers on these trips yet. Add them on a trip or in Travellers.</EmptyNote> : (
          <>
            <ul className="divide-y divide-border -my-2">
              {shownPeople.map(p => {
                const status = p.inApp
                  ? { tone: "text-foreground", text: p.lastSeen ? `Opened ${timeAgo(p.lastSeen)}` : "Joined", device: p.platform }
                  : p.invitedAny
                    ? { tone: "text-muted-foreground", text: "Invited, not joined", device: null }
                    : { tone: "text-muted-foreground", text: "Not invited", device: null };
                return (
                  <li key={p.traveller.id} className="py-2.5 flex items-start sm:items-center gap-3">
                    <PersonAvatar avatar={p.traveller.avatar} initials={p.traveller.initials || p.traveller.name.slice(0, 2)} name={p.traveller.name} className="size-8" />
                    <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-6">
                      <div className="min-w-0 sm:w-[38%]">
                        <p className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                          <span className="truncate">{p.traveller.name}</span>
                          <span className="shrink-0 rounded-md bg-secondary px-1.5 py-px text-[11px] font-medium text-muted-foreground tabular-nums">{p.trips.length} {p.trips.length === 1 ? "trip" : "trips"}</span>
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{p.traveller.email || <span className="text-amber-700 dark:text-amber-400">No email</span>}</p>
                      </div>
                      <div className="min-w-0 flex-1 mt-1 sm:mt-0">
                        {p.next ? (
                          <button type="button" onClick={() => navigate(`/trip/${p.next!.id}`)} className="text-xs sm:text-sm text-foreground truncate max-w-full text-left hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                            {p.next.name}, {shortDate(p.next.start)}
                          </button>
                        ) : <span className="text-xs sm:text-sm text-muted-foreground">No trip booked</span>}
                      </div>
                      <span className={`mt-1 sm:mt-0 inline-flex items-center gap-1.5 text-xs shrink-0 sm:w-44 sm:justify-end ${status.tone}`}>
                        {status.device && <DeviceMobile className="h-3.5 w-3.5 text-muted-foreground" />}{status.text}{status.device ? `, ${status.device === "ios" ? "iPhone" : status.device === "android" ? "Android" : status.device}` : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {data.personRows.length > PEOPLE_PAGE && (
              <div className="mt-4 flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setShowAll(v => !v)} className="text-muted-foreground">{showAll ? "Show fewer" : `Show all ${data.personRows.length}`}</Button>
              </div>
            )}
          </>
        )}
      </ReportCard>
    </div>
  );
}
