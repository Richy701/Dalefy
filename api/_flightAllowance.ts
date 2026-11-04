/**
 * How much of the AeroDataBox allowance is left, read from the headers RapidAPI puts on every response.
 * A lookup that fails for lack of allowance looks like "no flight found" everywhere else, so this is the
 * one place that notices: the flight job logs it each run and warns once per level per billing period.
 */
export interface Allowance { limit: number; remaining: number; resetsInSeconds: number }
export type AllowanceLevel = "low" | "very-low" | "exhausted";

const LEVELS: AllowanceLevel[] = ["low", "very-low", "exhausted"];

export function readAllowance(headers: { get(name: string): string | null }): Allowance | null {
  const num = (name: string) => {
    const raw = headers.get(name);
    const n = raw === null || raw.trim() === "" ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const limit = num("x-ratelimit-api-units-limit");
  const remaining = num("x-ratelimit-api-units-remaining");
  if (limit === null || remaining === null || limit <= 0) return null;
  return { limit, remaining, resetsInSeconds: num("x-ratelimit-api-units-reset") ?? 0 };
}

/** RapidAPI's refusals when a plan has run out or the key isn't allowed */
export const isAllowanceRefusal = (status: number) => status === 429 || status === 403;

export function allowanceLevel(allowance: Allowance | null, refused = false): AllowanceLevel | null {
  if (refused) return "exhausted";
  if (!allowance) return null;
  const left = allowance.remaining / allowance.limit;
  if (allowance.remaining <= 0) return "exhausted";
  if (left <= 0.05) return "very-low";
  if (left <= 0.2) return "low";
  return null;
}

/** Whether this level is news: a higher level than already warned about, or a new billing period */
export function shouldWarn(level: AllowanceLevel | null, warned: { level?: unknown; period?: unknown }, period: string): boolean {
  if (!level) return false;
  if (warned.period !== period) return true;
  return LEVELS.indexOf(level) > LEVELS.indexOf(warned.level as AllowanceLevel);
}
