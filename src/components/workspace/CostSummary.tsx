import { useMemo } from "react";
import { AirplaneTilt, Bed, Compass, ForkKnife, Car, Wallet, Warning } from "@phosphor-icons/react";
import { Progress } from "@/components/ui/progress";
import { summariseCosts, formatMoney } from "@/lib/tripCosts";
import { cn } from "@/lib/utils";
import type { Trip, TravelEvent } from "@/types";

const TYPE_LABEL: Record<TravelEvent["type"], string> = { flight: "Flights", hotel: "Stays", activity: "Activities", dining: "Dining", transfer: "Transfers" };
const TYPE_ICON: Record<TravelEvent["type"], typeof AirplaneTilt> = { flight: AirplaneTilt, hotel: Bed, activity: Compass, dining: ForkKnife, transfer: Car };

const shortDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/**
 * What the trip costs, added up from the prices typed on its events: the total against the budget, per head,
 * by kind of event, then every priced line. Prices stay free text on the event; this reads the number out.
 */
export function CostSummary({ trip, onOpenEvent, onEditBudget }: {
  trip: Trip;
  onOpenEvent: (event: TravelEvent) => void;
  onEditBudget: () => void;
}) {
  const s = useMemo(() => summariseCosts(trip), [trip]);
  const money = (n: number) => formatMoney(n, s.currency);
  const pct = s.budget ? Math.min(100, Math.round((s.total / s.budget) * 100)) : 0;
  const over = s.budget !== null && s.total > s.budget;
  const lines = [...s.lines].sort((a, b) => a.event.date.localeCompare(b.event.date) || a.event.time.localeCompare(b.event.time));

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-5 pt-5 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <Wallet className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">Costs</h2>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{s.lines.length} priced of {trip.events.length} events</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-5 space-y-5">
          <section className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">Trip total</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground tabular-nums">{money(s.total)}</p>
            {s.budget !== null ? (
              <div className="mt-3 space-y-2">
                <Progress value={pct} aria-label="Spent against budget" className={cn(over && "[&_[data-slot=progress-indicator]]:bg-red-500")} />
                <p className={cn("text-xs", over ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                  {over ? `${money(s.total - s.budget)} over the ${money(s.budget)} budget` : `${money(s.budget - s.total)} left of ${money(s.budget)}`}
                </p>
              </div>
            ) : (
              <button type="button" onClick={onEditBudget} className="mt-2 text-xs text-link hover:underline underline-offset-2">Set a budget in trip details</button>
            )}
            <div className="mt-4 pt-3 border-t border-border flex items-baseline justify-between gap-3">
              <p className="text-xs text-muted-foreground">Per traveller, {s.travellers} on the trip</p>
              <p className="text-sm font-semibold text-foreground tabular-nums">{money(s.perHead)}</p>
            </div>
          </section>

          {s.byType.length > 0 && (
            <section>
              <p className="text-xs font-medium text-muted-foreground mb-2">By kind</p>
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {s.byType.map(t => {
                  const Icon = TYPE_ICON[t.type];
                  const share = s.total ? Math.round((t.total / s.total) * 100) : 0;
                  return (
                    <div key={t.type} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="h-8 w-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0"><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{TYPE_LABEL[t.type]}</p>
                        <p className="text-xs text-muted-foreground">{t.count} priced, {share}% of total</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground tabular-nums">{money(t.total)}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <p className="text-xs font-medium text-muted-foreground mb-2">Priced events</p>
            {lines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-5 text-center">
                <p className="text-sm font-medium text-foreground">No prices yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Add a price on an event, like 1,200 per person or 450 total, and it's added up here.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {lines.map(l => (
                  <button
                    key={l.event.id}
                    type="button"
                    onClick={() => onOpenEvent(l.event)}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-secondary transition-colors first:rounded-t-xl last:rounded-b-xl"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{l.event.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {shortDate(l.event.date)}{l.perPerson ? `, ${money(l.unit)} each for ${s.travellers}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground tabular-nums shrink-0">{money(l.total)}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          {s.unpriced.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary p-3">
              <Warning className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                {s.unpriced.length === 1 ? "One price couldn't be read" : `${s.unpriced.length} prices couldn't be read`} and isn't in the total: {s.unpriced.map(e => `"${e.price}" on ${e.title}`).join(", ")}. Put a number in the price.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
