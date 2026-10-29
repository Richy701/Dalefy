import type { Trip } from "@/types";
import { parseTripDate } from "@/lib/dates";

export type ReportPeriod =
  | "all" | "upcoming" | "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-year" | "last-year" | "custom";

export interface ReportFilters {
  period: ReportPeriod;
  /** yyyy-mm-dd, used when period is "custom" */
  from: string;
  to: string;
  tripId: string;
  status: "all" | Trip["status"];
}

export const DEFAULT_REPORT_FILTERS: ReportFilters = { period: "all", from: "", to: "", tripId: "all", status: "all" };

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  all: "All time",
  upcoming: "Upcoming",
  "this-month": "This month",
  "last-month": "Last month",
  "this-quarter": "This quarter",
  "last-quarter": "Last quarter",
  "this-year": "This year",
  "last-year": "Last year",
  custom: "Custom dates",
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** The calendar window a period covers, or null when it has no bounds */
export function periodRange(filters: Pick<ReportFilters, "period" | "from" | "to">, today = new Date()): { from: Date | null; to: Date | null } | null {
  const y = today.getFullYear(), m = today.getMonth(), q = Math.floor(m / 3) * 3;
  switch (filters.period) {
    case "all": return null;
    case "upcoming": return { from: startOfDay(today), to: null };
    case "this-month": return { from: new Date(y, m, 1), to: endOfDay(new Date(y, m + 1, 0)) };
    case "last-month": return { from: new Date(y, m - 1, 1), to: endOfDay(new Date(y, m, 0)) };
    case "this-quarter": return { from: new Date(y, q, 1), to: endOfDay(new Date(y, q + 3, 0)) };
    case "last-quarter": return { from: new Date(y, q - 3, 1), to: endOfDay(new Date(y, q, 0)) };
    case "this-year": return { from: new Date(y, 0, 1), to: endOfDay(new Date(y, 11, 31)) };
    case "last-year": return { from: new Date(y - 1, 0, 1), to: endOfDay(new Date(y - 1, 11, 31)) };
    case "custom": {
      const from = filters.from ? startOfDay(parseTripDate(filters.from)) : null;
      const to = filters.to ? endOfDay(parseTripDate(filters.to)) : null;
      return from || to ? { from, to } : null;
    }
  }
}

/** Trips that touch the period (any overlap), match the status and, when one is picked, the trip */
export function filterReportTrips<T extends Pick<Trip, "id" | "start" | "end" | "status">>(trips: T[], filters: ReportFilters, today = new Date()): T[] {
  const range = periodRange(filters, today);
  return trips.filter(t => {
    if (filters.tripId !== "all" && t.id !== filters.tripId) return false;
    if (filters.status !== "all" && t.status !== filters.status) return false;
    if (!range) return true;
    const start = parseTripDate(t.start), end = parseTripDate(t.end || t.start);
    if (Number.isNaN(start.getTime())) return false;
    const tripEnd = Number.isNaN(end.getTime()) ? start : end;
    if (range.from && tripEnd < range.from) return false;
    if (range.to && start > range.to) return false;
    return true;
  });
}

/** One line describing what the filters select, for headings and the PDF */
export function describeFilters(filters: ReportFilters, tripName?: string): string {
  const parts: string[] = [];
  if (tripName) parts.push(tripName);
  if (filters.period === "custom") {
    const fmt = (v: string) => parseTripDate(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    if (filters.from && filters.to) parts.push(`${fmt(filters.from)} to ${fmt(filters.to)}`);
    else if (filters.from) parts.push(`From ${fmt(filters.from)}`);
    else if (filters.to) parts.push(`Until ${fmt(filters.to)}`);
    else parts.push("All time");
  } else parts.push(PERIOD_LABELS[filters.period]);
  if (filters.status !== "all") parts.push(filters.status);
  return parts.join(", ");
}
