import type { TravelEvent, Trip } from "@/types";
import { travellerCount } from "@/lib/travelerSync";

export interface ParsedPrice {
  amount: number;
  /** "1,200 per person", "£85 pp", "450 each": the trip pays this once per traveller */
  perPerson: boolean;
}

const PER_PERSON = /\b(per\s*(person|head|pax|traveller|traveler|guest)|pp|p\.p\.|each)\b/i;

/** The number inside free-text prices such as "£1,200 per person", "USD 450 total" or "1.250,00" */
export function parsePrice(text: string | undefined): ParsedPrice | null {
  if (!text) return null;
  const m = text.match(/\d(?:[\d,.\s]*\d)?/);
  // "Included", "Free", "Complimentary": nothing to pay, and nothing to warn about
  if (!m) return /\b(free|included|inclusive|complimentary|no charge)\b/i.test(text) ? { amount: 0, perPerson: false } : null;
  let raw = m[0].replace(/\s/g, "");
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma > -1 && dot > -1) {
    // Both present: whichever comes last is the decimal point ("1,250.00" or "1.250,00")
    const decimal = Math.max(comma, dot);
    raw = raw.slice(0, decimal).replace(/[,.]/g, "") + "." + raw.slice(decimal + 1);
  } else if (comma > -1 || dot > -1) {
    const sep = comma > -1 ? "," : ".";
    const parts = raw.split(sep);
    // "1,250" or "1.250.000" group thousands; "12,50" or "1500.5" carry pence
    const thousands = parts.length > 2 || parts[parts.length - 1].length === 3;
    raw = thousands ? parts.join("") : `${parts[0]}.${parts[1]}`;
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return { amount, perPerson: PER_PERSON.test(text) };
}

export interface CostLine {
  event: TravelEvent;
  unit: number;
  perPerson: boolean;
  /** What the trip pays: the unit once, or once per traveller */
  total: number;
}

export interface CostSummary {
  currency: string;
  travellers: number;
  budget: number | null;
  total: number;
  perHead: number;
  lines: CostLine[];
  /** Events with a price nobody could read, so the total is known to be short */
  unpriced: TravelEvent[];
  byType: Array<{ type: TravelEvent["type"]; total: number; count: number }>;
}

const TYPE_ORDER: TravelEvent["type"][] = ["flight", "hotel", "activity", "dining", "transfer"];

/** Every priced event rolled up against the trip's budget and head count */
export function summariseCosts(trip: Trip): CostSummary {
  const travellers = Math.max(1, travellerCount(trip));
  const lines: CostLine[] = [];
  const unpriced: TravelEvent[] = [];
  for (const event of trip.events) {
    if (!event.price?.trim()) continue;
    const parsed = parsePrice(event.price);
    if (!parsed) { unpriced.push(event); continue; }
    lines.push({ event, unit: parsed.amount, perPerson: parsed.perPerson, total: parsed.perPerson ? parsed.amount * travellers : parsed.amount });
  }
  const total = lines.reduce((sum, l) => sum + l.total, 0);
  const budget = parsePrice(trip.budget)?.amount ?? null;
  const byType = TYPE_ORDER
    .map(type => {
      const ofType = lines.filter(l => l.event.type === type);
      return { type, total: ofType.reduce((s, l) => s + l.total, 0), count: ofType.length };
    })
    .filter(t => t.count > 0);
  return { currency: trip.currency || "USD", travellers, budget, total, perHead: total / travellers, lines, unpriced, byType };
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-GB")}`;
  }
}
