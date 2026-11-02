import type { TravelEvent } from "@/types";
import type { FlightResult } from "@/services/serpapi";
import { parseTimeInput } from "@/lib/timeInput";

/** Within this window the workspace's own refresh updates the flight, so there is nothing to ask about. */
const AUTO_REFRESH_MS = 48 * 60 * 60 * 1000;

export type LiveTimes = Pick<FlightResult, "departTime" | "arriveTime" | "fromCode" | "toCode">;

export interface FlightTimeDiff {
  departs?: { saved: string; live: string };
  arrives?: { saved: string; live: string };
}

export const flightCheckKey = (ev: Pick<TravelEvent, "flightNum" | "date">) =>
  `${(ev.flightNum ?? "").replace(/\s+/g, "").toUpperCase()}:${ev.date.slice(0, 10)}`;

/** Flights far enough ahead that nothing else will correct them yet. */
export function needsTimeCheck(ev: TravelEvent, now: number): boolean {
  if (ev.type !== "flight" || !ev.flightNum?.trim() || !ev.date) return false;
  if ((ev.status ?? "").toLowerCase().startsWith("cancel")) return false;
  const start = Date.parse(`${ev.date.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(start) && start - now > AUTO_REFRESH_MS;
}

/** The feed's entry for this flight's route. Several legs can share a number, so an ambiguous answer counts as none. */
export function pickLiveFlight(ev: TravelEvent, results: LiveTimes[]): LiveTimes | null {
  const dep = ev.depAirport?.trim().toUpperCase();
  const arr = ev.arrAirport?.trim().toUpperCase();
  if (dep && arr) return results.find(r => r.fromCode?.toUpperCase() === dep && r.toCode?.toUpperCase() === arr) ?? null;
  return results.length === 1 ? results[0] : null;
}

/** Compares by clock time, so "3:10 PM" and "15:10" are the same. A missing saved time counts as different. */
export function flightTimeDiff(ev: TravelEvent, live: LiveTimes): FlightTimeDiff | null {
  const differs = (saved: string | undefined, feed: string) => !!feed && (parseTimeInput(saved) || saved?.trim() || "") !== feed;
  const diff: FlightTimeDiff = {};
  if (differs(ev.time, live.departTime)) diff.departs = { saved: ev.time?.trim() || "", live: live.departTime };
  if (differs(ev.endTime, live.arriveTime)) diff.arrives = { saved: ev.endTime?.trim() || "", live: live.arriveTime };
  return diff.departs || diff.arrives ? diff : null;
}
