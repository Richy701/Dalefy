import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useTrips } from "@/context/TripsContext";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { firebaseDb, isFirebaseConfigured } from "@/services/firebase";
import { fetchTripMembers, type TripMember } from "@/services/firebaseTrips";
import { personOf } from "@/lib/appMembers";
import { parseTripDate } from "@/lib/dates";
import type { Trip } from "@/types";

export type ActivityKind = "edit" | "joined" | "reported" | "flight" | "team";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** Epoch ms */
  at: number;
  title: string;
  detail: string;
  trip?: Trip;
  /** Where clicking the item goes */
  href: string;
  unread: boolean;
}

const WINDOW_MS = 30 * 86400000;
const minutesLate = (time?: string, revised?: string) => {
  const m = (v?: string) => { const x = /^(\d{1,2}):(\d{2})/.exec(v ?? ""); return x ? +x[1] * 60 + +x[2] : null; };
  const a = m(time), b = m(revised);
  return a !== null && b !== null ? b - a : 0;
};

/**
 * What happened on your trips that you didn't do yourself: teammates' edits, travellers joining the app,
 * photos reported, flights in trouble and people joining the team. Read state is kept per account.
 */
export function useActivityFeed() {
  const { trips } = useTrips();
  const { user } = useAuth();
  const { orgMembers } = useOrg();
  const seenKey = user?.id ? `daf-activity-seen-${user.id}` : null;
  const [seenAt, setSeenAt] = useState<number>(() => {
    try { return seenKey ? Number(localStorage.getItem(seenKey)) || 0 : 0; } catch { return 0; }
  });
  const clearKey = user?.id ? `daf-activity-cleared-${user.id}` : null;
  const [clearedAt, setClearedAt] = useState<number>(() => {
    try { return clearKey ? Number(localStorage.getItem(clearKey)) || 0 : 0; } catch { return 0; }
  });
  const [now] = useState(() => Date.now());

  const live = useMemo(() => trips.filter(t => !t.archivedAt), [trips]);
  const current = useMemo(() => live.filter(t => parseTripDate(t.end || t.start).getTime() >= now - 7 * 86400000), [live, now]);
  const ids = useMemo(() => current.map(t => t.id).sort().join(","), [current]);

  const [members, setMembers] = useState<TripMember[]>([]);
  const [reports, setReports] = useState<Array<{ trip_id: string; reported_at?: string }>>([]);
  useEffect(() => {
    if (!isFirebaseConfigured() || !ids) return;
    let cancelled = false;
    const list = ids.split(",");
    fetchTripMembers(list).then(m => { if (!cancelled) setMembers(m); }).catch(() => {});
    Promise.all(list.map(id =>
      getDocs(query(collection(firebaseDb(), "media_reports"), where("trip_id", "==", id)))
        .then(s => s.docs.map(d => d.data() as { trip_id: string; reported_at?: string })).catch(() => []),
    )).then(r => { if (!cancelled) setReports(r.flat()); });
    return () => { cancelled = true; };
  }, [ids]);

  const items = useMemo(() => {
    const out: Omit<ActivityItem, "unread">[] = [];
    const byId = new Map(live.map(t => [t.id, t]));
    const recent = (ms: number) => Number.isFinite(ms) && ms > now - WINDOW_MS && ms <= now + 60_000;

    // Teammates' edits, from each trip's history (your own changes are left out)
    for (const t of live) for (const h of t.history ?? []) {
      const at = Date.parse(h.at);
      if (!recent(at) || !h.by || h.by === user?.name) continue;
      out.push({ id: `edit-${t.id}-${h.id}`, kind: "edit", at, title: `${h.by} ${h.summary.charAt(0).toLowerCase()}${h.summary.slice(1)}`, detail: t.name, trip: t, href: `/trip/${t.id}` });
    }

    // Travellers joining the app, one line per trip per day
    const joins = new Map<string, { trip: Trip; at: number; people: Set<string> }>();
    for (const m of members) {
      const at = Date.parse(m.joined_at), trip = byId.get(m.trip_id);
      if (!trip || !recent(at)) continue;
      const key = `${m.trip_id}-${new Date(at).toDateString()}`;
      const j = joins.get(key) ?? { trip, at, people: new Set<string>() };
      j.people.add(personOf(m)); j.at = Math.max(j.at, at);
      joins.set(key, j);
    }
    for (const [key, j] of joins) {
      const n = j.people.size;
      out.push({ id: `joined-${key}`, kind: "joined", at: j.at, title: `${n} ${n === 1 ? "traveller" : "travellers"} joined the app`, detail: j.trip.name, trip: j.trip, href: `/trip/${j.trip.id}` });
    }

    // Photos travellers reported
    const reported = new Map<string, { trip: Trip; at: number; count: number }>();
    for (const r of reports) {
      const at = Date.parse(r.reported_at ?? ""), trip = byId.get(r.trip_id);
      if (!trip || !recent(at)) continue;
      const x = reported.get(r.trip_id) ?? { trip, at, count: 0 };
      x.count += 1; x.at = Math.max(x.at, at);
      reported.set(r.trip_id, x);
    }
    for (const [id, x] of reported) out.push({ id: `reported-${id}-${x.at}`, kind: "reported", at: x.at, title: `${x.count} ${x.count === 1 ? "photo" : "photos"} reported by travellers`, detail: x.trip.name, trip: x.trip, href: "/media" });

    // Flights in trouble within a day either side of now
    for (const t of current) for (const e of t.events) {
      if (e.type !== "flight") continue;
      const dep = parseTripDate(e.date).getTime();
      if (!Number.isFinite(dep) || Math.abs(dep - now) > 2 * 86400000) continue;
      const status = (e.status ?? "").toLowerCase();
      const late = minutesLate(e.time, e.revisedTime);
      const bad = ["cancelled", "canceled", "diverted"].includes(status);
      if (!bad && late < 15 && status !== "delayed") continue;
      const name = [e.airline, e.flightNum].filter(Boolean).join(" ") || e.title;
      out.push({ id: `flight-${t.id}-${e.id}-${status}-${e.revisedTime ?? ""}`, kind: "flight", at: Math.min(dep, now), title: bad ? `${name} ${status}` : `${name} delayed${late >= 15 ? ` ${late} min` : ""}`, detail: t.name, trip: t, href: `/trip/${t.id}` });
    }

    // People joining the team
    for (const m of orgMembers) {
      const at = Date.parse(m.joinedAt);
      if (!recent(at) || m.userId === user?.id) continue;
      out.push({ id: `team-${m.userId}`, kind: "team", at, title: `${m.profile?.name || "Someone"} joined the team`, detail: m.role.charAt(0).toUpperCase() + m.role.slice(1), href: "/settings" });
    }

    // Cleared items stay gone; only newer activity shows
    return out.filter(i => i.at > clearedAt).sort((a, b) => b.at - a.at).slice(0, 40).map(i => ({ ...i, unread: i.at > seenAt }));
  }, [live, current, members, reports, orgMembers, user?.id, user?.name, now, seenAt, clearedAt]);

  const markAllRead = useCallback(() => {
    const t = Date.now();
    setSeenAt(t);
    try { if (seenKey) localStorage.setItem(seenKey, String(t)); } catch { /* storage unavailable */ }
  }, [seenKey]);

  const clearAll = useCallback(() => {
    const t = Date.now();
    setClearedAt(t); setSeenAt(t);
    try {
      if (clearKey) localStorage.setItem(clearKey, String(t));
      if (seenKey) localStorage.setItem(seenKey, String(t));
    } catch { /* storage unavailable */ }
  }, [clearKey, seenKey]);

  return { items, unreadCount: items.filter(i => i.unread).length, markAllRead, clearAll };
}
