import { useState } from "react";
import { format } from "date-fns";
import { CalendarBlank, X } from "@phosphor-icons/react";
import type { DateRange } from "react-day-picker";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { parseTripDate } from "@/lib/dates";
import { DEFAULT_REPORT_FILTERS, PERIOD_LABELS, type ReportFilters, type ReportPeriod } from "@/lib/reportFilters";
import type { Trip } from "@/types";

const STATUS_ITEMS = [
  { value: "all", label: "Any status" },
  { value: "Draft", label: "Draft" },
  { value: "Published", label: "Published" },
  { value: "In Progress", label: "In progress" },
];
const PERIOD_ITEMS = (Object.keys(PERIOD_LABELS) as ReportPeriod[]).map(value => ({ value, label: PERIOD_LABELS[value] }));
const toIso = (d: Date) => format(d, "yyyy-MM-dd");

/** Period, trip and status: one bar above the tabs, applied to every report */
export function ReportFiltersBar({ trips, filters, onChange }: { trips: Trip[]; filters: ReportFilters; onChange: (next: ReportFilters) => void }) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const tripItems = [{ value: "all", label: "All trips" }, ...[...trips].sort((a, b) => (b.start || "").localeCompare(a.start || "")).map(t => ({ value: t.id, label: t.name }))];
  const range: DateRange | undefined = filters.from ? { from: parseTripDate(filters.from), to: filters.to ? parseTripDate(filters.to) : undefined } : undefined;
  const filtered = filters.period !== "all" || filters.tripId !== "all" || filters.status !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2 pt-5">
      <Select value={filters.period} items={PERIOD_ITEMS} onValueChange={v => {
        const period = (v ?? "all") as ReportPeriod;
        onChange({ ...filters, period });
        if (period === "custom") setRangeOpen(true);
      }}>
        <SelectTrigger className="w-40 bg-card" aria-label="Period"><SelectValue /></SelectTrigger>
        <SelectContent align="start">{PERIOD_ITEMS.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
      </Select>

      {filters.period === "custom" && (
        <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
          <PopoverTrigger className="h-9 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground hover:bg-secondary transition-colors" aria-label="Choose dates">
            <CalendarBlank className="h-4 w-4 text-muted-foreground" />
            {range?.from ? `${format(range.from, "d MMM yyyy")}${range.to ? ` to ${format(range.to, "d MMM yyyy")}` : ""}` : "Pick dates"}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2 gap-0">
            <Calendar
              mode="range"
              defaultMonth={range?.from ?? new Date()}
              selected={range}
              onSelect={r => onChange({ ...filters, from: r?.from ? toIso(r.from) : "", to: r?.to ? toIso(r.to) : "" })}
              numberOfMonths={1}
            />
          </PopoverContent>
        </Popover>
      )}

      <Select value={filters.tripId} items={tripItems} onValueChange={v => onChange({ ...filters, tripId: v ?? "all" })}>
        <SelectTrigger className="w-56 bg-card" aria-label="Trip"><SelectValue /></SelectTrigger>
        <SelectContent align="start" className="w-[min(28rem,var(--available-width))]">{tripItems.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
      </Select>

      <Select value={filters.status} items={STATUS_ITEMS} onValueChange={v => onChange({ ...filters, status: (v ?? "all") as ReportFilters["status"] })}>
        <SelectTrigger className="w-36 bg-card" aria-label="Status"><SelectValue /></SelectTrigger>
        <SelectContent align="start">{STATUS_ITEMS.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
      </Select>

      {filtered && (
        <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_REPORT_FILTERS)} className="text-muted-foreground">
          <X className="h-3.5 w-3.5" /> Clear filters
        </Button>
      )}
    </div>
  );
}
