import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaretRight } from "@phosphor-icons/react";
import { formatMoney, summariseCosts } from "@/lib/tripCosts";
import { moneyByCurrency } from "@/lib/reportMoney";
import type { Trip, TravelEvent } from "@/types";
import { ReportCard, Figure, EmptyNote } from "./ReportParts";
import { shortDate } from "./format";

// Words typed into the supplier box that name a kind of booking, not a company
const GENERIC_SUPPLIER = /^(hotels?|flights?|activit(y|ies)|dining|restaurants?|transfers?|transport|tbc|tba|n\/?a|none|other|various)$/i;

const TYPE_LABEL: Record<TravelEvent["type"], string> = { flight: "Flights", hotel: "Stays", activity: "Activities", dining: "Dining", transfer: "Transfers" };

/** Spend against budget across the filtered trips, one currency at a time: amounts in different currencies never add up */
export function MoneyReport({ trips }: { trips: Trip[] }) {
  const navigate = useNavigate();
  const { rows, currencies } = useMemo(() => moneyByCurrency(trips), [trips]);
  const [picked, setPicked] = useState<string | null>(null);
  const current = currencies.find(c => c.currency === picked) ?? currencies[0];

  if (!current || rows.every(r => r.priced === 0 && r.budget === null)) {
    return <div className="mt-8"><EmptyNote>No prices or budgets on these trips yet. Add a price to events and a budget to the trip in the Workspace, and they add up here.</EmptyNote></div>;
  }

  const money = (n: number) => formatMoney(n, current.currency);
  // Per head is a guide, not an invoice: whole amounts read better
  const perHead = (n: number) => money(Math.round(n));
  const byType = current.byType.filter(t => t.total > 0);
  const tripRows = rows.filter(r => r.currency === current.currency).sort((a, b) => (a.trip.start || "").localeCompare(b.trip.start || ""));
  const maxType = Math.max(1, ...byType.map(t => t.total));
  const budgetUsed = current.budget ? Math.round((current.spendOnBudgeted / current.budget) * 100) : null;

  // Who the money goes to: spend per supplier on this currency's trips, each priced booking counted once
  const suppliers = (() => {
    const by = new Map<string, { name: string; spend: number; trips: Set<string>; priced: boolean }>();
    for (const r of tripRows) {
      const priced = new Set(summariseCosts(r.trip).lines.map(l => l.event.id));
      for (const l of summariseCosts(r.trip).lines) {
        const name = l.event.supplier?.trim();
        if (!name || GENERIC_SUPPLIER.test(name)) continue;
        const row = by.get(name.toLowerCase()) ?? { name, spend: 0, trips: new Set<string>(), priced: false };
        row.spend += l.total; row.trips.add(r.trip.id); row.priced = true;
        by.set(name.toLowerCase(), row);
      }
      for (const e of r.trip.events) {
        const name = e.supplier?.trim();
        if (!name || GENERIC_SUPPLIER.test(name) || priced.has(e.id)) continue;
        const row = by.get(name.toLowerCase()) ?? { name, spend: 0, trips: new Set<string>(), priced: false };
        row.trips.add(r.trip.id);
        by.set(name.toLowerCase(), row);
      }
    }
    const all = [...by.values()];
    return { top: all.filter(x => x.priced).sort((a, b) => b.spend - a.spend).slice(0, 8), unpriced: all.filter(x => !x.priced).length };
  })();
  const maxSupplier = Math.max(1, ...suppliers.top.map(x => x.spend));

  return (
    <div className="space-y-6 mt-8">
      {currencies.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Currency" className="flex items-center bg-secondary p-0.5 rounded-lg">
            {currencies.map(c => (
              <button key={c.currency} role="tab" aria-selected={c.currency === current.currency} onClick={() => setPicked(c.currency)}
                className={`px-3 h-8 rounded-md text-sm font-medium transition-colors ${c.currency === current.currency ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {c.currency}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">These trips are priced in {currencies.length} currencies, so each is totalled on its own.</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Figure label="Spend" value={money(current.spend)} sub={`${current.trips} ${current.trips === 1 ? "trip" : "trips"}`} />
        <Figure label="Budget" value={current.budget ? money(current.budget) : "None set"} sub={budgetUsed !== null ? `${budgetUsed}% used on budgeted trips` : "Add budgets in the Workspace"} />
        <Figure label="Per head" value={perHead(current.perHead)} sub={`${current.travellers} ${current.travellers === 1 ? "traveller" : "travellers"}`} />
        <Figure label="Over budget" value={`${current.overBudget}`} sub={current.unpriced ? `${current.unpriced} ${current.unpriced === 1 ? "price" : "prices"} couldn't be read` : "All prices read"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <ReportCard title="Spend by type" sub="What the money goes on">
          {byType.length === 0 ? <EmptyNote>No priced events yet.</EmptyNote> : (
            <ul className="space-y-3">
              {byType.map(t => (
                <li key={t.type}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-foreground">{TYPE_LABEL[t.type]}</span>
                    <span className="font-medium text-foreground tabular-nums">{money(t.total)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden" role="img" aria-label={`${TYPE_LABEL[t.type]}: ${money(t.total)}`}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((t.total / maxType) * 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{t.count} {t.count === 1 ? "booking" : "bookings"}, {current.spend ? Math.round((t.total / current.spend) * 100) : 0}% of spend</p>
                </li>
              ))}
            </ul>
          )}
        </ReportCard>

        <div className="lg:col-span-2">
          <ReportCard title="Budget by trip" sub="Spend from event prices against each trip's budget">
            <div className="overflow-x-auto -mx-4 sm:-mx-6">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="font-medium px-4 sm:px-6 pb-2">Trip</th>
                    <th className="font-medium pb-2 text-right">Budget</th>
                    <th className="font-medium pb-2 text-right">Spend</th>
                    <th className="font-medium pb-2 text-right">Left</th>
                    <th className="font-medium pb-2 text-right">Per head</th>
                    <th className="font-medium pb-2 pr-4 sm:pr-6 text-right">No price</th>
                  </tr>
                </thead>
                <tbody>
                  {tripRows.map(r => {
                    const gaps = r.missing + r.unpriced.length;
                    return (
                      <tr key={r.trip.id} onClick={() => navigate(`/trip/${r.trip.id}`)} className="border-b border-border last:border-0 hover:bg-secondary/60 cursor-pointer">
                        <td className="px-4 sm:px-6 py-3">
                          <p className="font-medium text-foreground truncate max-w-[16rem]">{r.trip.name}</p>
                          <p className="text-xs text-muted-foreground">{shortDate(r.trip.start)}</p>
                        </td>
                        <td className="py-3 text-right tabular-nums text-muted-foreground">{r.budget !== null ? money(r.budget) : "None"}</td>
                        <td className="py-3 text-right tabular-nums text-foreground">{money(r.spend)}</td>
                        <td className={`py-3 text-right tabular-nums font-medium ${r.left === null ? "text-muted-foreground" : r.left < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                          {r.left === null ? "" : r.left < 0 ? `${money(-r.left)} over` : money(r.left)}
                        </td>
                        <td className="py-3 text-right tabular-nums text-muted-foreground">{r.priced ? perHead(r.perHead) : ""}</td>
                        <td className="py-3 pr-4 sm:pr-6 text-right tabular-nums">
                          <span className={gaps ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>{gaps || "None"}</span>
                          <CaretRight className="inline h-3 w-3 ml-2 text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-4">"No price" counts events with no price typed or a price that couldn't be read, so those trips may cost more than shown.</p>
          </ReportCard>
        </div>
      </div>

      <ReportCard title="Top suppliers" sub="By spend, from the supplier and price on each booking">
        {suppliers.top.length === 0 ? <EmptyNote>No priced bookings name a supplier yet. Add the supplier on bookings in the Workspace.</EmptyNote> : (
          <ul className="space-y-3">
            {suppliers.top.map(x => (
              <li key={x.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 items-baseline">
                <span className="text-sm text-foreground truncate">{x.name}</span>
                <span className="text-sm font-medium text-foreground tabular-nums">{money(x.spend)}</span>
                <div className="col-span-2 mt-1.5 flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden" role="img" aria-label={`${x.name}: ${money(x.spend)}`}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((x.spend / maxSupplier) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-14 text-right">{x.trips.size} {x.trips.size === 1 ? "trip" : "trips"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {suppliers.unpriced > 0 && <p className="text-xs text-muted-foreground mt-4">{suppliers.unpriced} more {suppliers.unpriced === 1 ? "supplier has" : "suppliers have"} no prices yet.</p>}
      </ReportCard>
    </div>
  );
}
