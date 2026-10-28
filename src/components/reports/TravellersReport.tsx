import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaretRight, EnvelopeSimple } from "@phosphor-icons/react";
import { fetchTripMembers, type TripMember } from "@/services/firebaseTrips";
import { parseTripDate } from "@/lib/dates";
import { timeAgo } from "@/lib/timeAgo";
import { Spinner } from "@/components/ui/spinner";
import type { Trip } from "@/types";
import { ReportCard, Figure, Share, EmptyNote } from "./ReportParts";
import { shortDate } from "./format";

const WEEK_MS = 7 * 86_400_000;
/** One person in the app, whichever of their docs we read */
const personOf = (m: TripMember) => m.linked_traveler_id || m.uid || m.device_id;

/** Who travellers are in the app, who has been invited, and who still needs an invite */
export function TravellersReport({ trips }: { trips: Trip[] }) {
  const navigate = useNavigate();
  const [members, setMembers] = useState<TripMember[] | null>(null);
  // Fixed when the tab opens, so "active this week" doesn't shift while it's on screen
  const [now] = useState(() => Date.now());
  const tripIds = useMemo(() => trips.map(t => t.id).sort().join(","), [trips]);

  useEffect(() => {
    let cancelled = false;
    fetchTripMembers(tripIds ? tripIds.split(",") : []).then(list => { if (!cancelled) setMembers(list); });
    return () => { cancelled = true; };
  }, [tripIds]);

  const rows = useMemo(() => {
    if (!members) return [];
    return trips.map(t => {
      const onTrip = members.filter(m => m.trip_id === t.id);
      const people = new Map<string, TripMember>();
      for (const m of onTrip) {
        const key = personOf(m);
        const kept = people.get(key);
        if (!kept || (m.last_seen_at ?? "") > (kept.last_seen_at ?? "")) people.set(key, m);
      }
      const inApp = [...people.values()];
      const travellers = t.travelers ?? [];
      return {
        trip: t,
        total: Math.max(travellers.length, inApp.length),
        invited: travellers.filter(tv => tv.invitedAt).length,
        inApp: inApp.length,
        activeWeek: inApp.filter(m => m.last_seen_at && now - Date.parse(m.last_seen_at) < WEEK_MS).length,
        ios: inApp.filter(m => m.platform === "ios").length,
        android: inApp.filter(m => m.platform === "android").length,
        lastSeen: inApp.map(m => m.last_seen_at).filter((v): v is string => !!v).sort().pop() ?? null,
        notInvited: travellers.filter(tv => !tv.invitedAt),
      };
    }).sort((a, b) => a.trip.start.localeCompare(b.trip.start));
  }, [members, trips, now]);

  if (!members) {
    return <div className="flex items-center justify-center py-24"><Spinner className="size-6 text-muted-foreground" /></div>;
  }

  const sum = (k: "total" | "invited" | "inApp" | "activeWeek" | "ios" | "android") => rows.reduce((n, r) => n + r[k], 0);
  const total = sum("total");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = rows.filter(r => parseTripDate(r.trip.end) >= today);
  const toInvite = upcoming.filter(r => r.notInvited.length > 0);
  const phones = sum("ios") + sum("android");

  return (
    <div className="space-y-6 mt-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Figure label="Invited" value={`${sum("invited")}`} sub={`of ${total} travellers`} />
        <Figure label="In the app" value={total ? `${Math.round((sum("inApp") / total) * 100)}%` : "0%"} sub={`${sum("inApp")} travellers joined`} />
        <Figure label="Active this week" value={`${sum("activeWeek")}`} sub="Opened the app in 7 days" />
        <Figure label="iPhone and Android" value={phones ? `${sum("ios")} / ${sum("android")}` : "None yet"} sub={phones ? "iPhone / Android" : "Shown once travellers open the app"} />
      </div>

      <ReportCard title="Travellers by trip" sub="Invited by email, joined in the app, and when the app was last opened">
        {rows.length === 0 ? <EmptyNote>No trips yet.</EmptyNote> : (
          <ul className="divide-y divide-border -my-3">
            {rows.map(r => (
              <li key={r.trip.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/trip/${r.trip.id}`)}
                  className="w-full grid grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 md:gap-6 py-3 text-left rounded-lg hover:bg-secondary/50 px-2 -mx-2 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{r.trip.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {shortDate(r.trip.start)} to {shortDate(r.trip.end)}
                      {r.lastSeen ? `, app last opened ${timeAgo(r.lastSeen)}` : ""}
                    </p>
                  </div>
                  <Share label="Invited" value={r.invited} total={r.total} />
                  <Share label="In the app" value={r.inApp} total={r.total} />
                  <CaretRight className="hidden md:block h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </ReportCard>

      <ReportCard
        title="Still to invite"
        sub={toInvite.length ? "Travellers on current and upcoming trips who haven't been emailed their itinerary" : undefined}
      >
        {toInvite.length === 0 ? (
          <EmptyNote>Everyone on current and upcoming trips has been invited.</EmptyNote>
        ) : (
          <div className="space-y-5">
            {toInvite.map(r => (
              <div key={r.trip.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground truncate">{r.trip.name}</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/trip/${r.trip.id}`)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-link hover:underline shrink-0"
                  >
                    <EnvelopeSimple className="h-3.5 w-3.5" /> Send invites
                  </button>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {r.notInvited.map(tv => `${tv.name}${tv.email ? "" : " (no email)"}`).join(", ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </ReportCard>
    </div>
  );
}
