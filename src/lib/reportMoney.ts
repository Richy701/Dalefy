import type { TravelEvent, Trip } from "@/types";
import { summariseCosts } from "@/lib/tripCosts";

export interface TripMoney {
  trip: Trip;
  currency: string;
  budget: number | null;
  spend: number;
  /** Budget minus spend; negative when over */
  left: number | null;
  travellers: number;
  perHead: number;
  priced: number;
  unpriced: TravelEvent[];
  /** Events with no price typed at all */
  missing: number;
}

export interface CurrencyMoney {
  currency: string;
  trips: number;
  budget: number;
  /** Spend on the trips that have a budget, so it can be set against the budget */
  spendOnBudgeted: number;
  spend: number;
  travellers: number;
  perHead: number;
  overBudget: number;
  unpriced: number;
  byType: Array<{ type: TravelEvent["type"]; total: number; count: number }>;
}

const TYPE_ORDER: TravelEvent["type"][] = ["flight", "hotel", "activity", "dining", "transfer"];

export function tripMoney(trip: Trip): TripMoney {
  const c = summariseCosts(trip);
  return {
    trip,
    currency: c.currency,
    budget: c.budget,
    spend: c.total,
    left: c.budget === null ? null : c.budget - c.total,
    travellers: c.travellers,
    perHead: c.perHead,
    priced: c.lines.length,
    unpriced: c.unpriced,
    missing: trip.events.filter(e => !e.price?.trim()).length,
  };
}

/** Money across trips, one block per currency: amounts in different currencies are never added together */
export function moneyByCurrency(trips: Trip[]): { rows: TripMoney[]; currencies: CurrencyMoney[] } {
  const rows = trips.map(tripMoney);
  const groups = new Map<string, { rows: TripMoney[]; byType: Map<TravelEvent["type"], { total: number; count: number }> }>();
  for (const row of rows) {
    const g = groups.get(row.currency) ?? { rows: [] as TripMoney[], byType: new Map<TravelEvent["type"], { total: number; count: number }>() };
    g.rows.push(row);
    for (const line of summariseCosts(row.trip).lines) {
      const t = g.byType.get(line.event.type) ?? { total: 0, count: 0 };
      t.total += line.total; t.count += 1;
      g.byType.set(line.event.type, t);
    }
    groups.set(row.currency, g);
  }
  const currencies = [...groups.entries()].map(([currency, g]) => {
    const budgeted = g.rows.filter(r => r.budget !== null);
    const spend = g.rows.reduce((s, r) => s + r.spend, 0);
    const travellers = g.rows.reduce((s, r) => s + r.travellers, 0);
    return {
      currency,
      trips: g.rows.length,
      budget: budgeted.reduce((s, r) => s + (r.budget ?? 0), 0),
      spendOnBudgeted: budgeted.reduce((s, r) => s + r.spend, 0),
      spend,
      travellers,
      perHead: travellers ? spend / travellers : 0,
      overBudget: g.rows.filter(r => r.left !== null && r.left < 0).length,
      unpriced: g.rows.reduce((s, r) => s + r.unpriced.length, 0),
      byType: TYPE_ORDER.flatMap(type => { const t = g.byType.get(type); return t ? [{ type, ...t }] : []; }),
    };
  }).sort((a, b) => b.spend - a.spend || b.trips - a.trips);
  return { rows, currencies };
}
