import type { TripMedia } from "@/types";

/** The day a photo was taken (YYYY-MM-DD), else the day it was uploaded; "" when neither is known */
export function dayKeyOf(m: Pick<TripMedia, "takenAt" | "uploadedAt">): string {
  const v = m.takenAt || m.uploadedAt || "";
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "";
}

/** "Thu 19 Nov" for a day header, "Undated" when there's no day */
export function dayLabel(key: string): string {
  if (!key) return "Undated";
  const d = new Date(key + "T12:00:00");
  return isNaN(d.getTime()) ? "Undated" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** Who shared a photo: their account when known, else the name on it */
export function sharerKeyOf(m: Pick<TripMedia, "uploaderId" | "uploadedBy">): string {
  return m.uploaderId || m.uploadedBy || "";
}

/** Items split into days, oldest first, each day in the order its photos were taken */
export function byDay<T extends Pick<TripMedia, "takenAt" | "uploadedAt">>(items: T[]): Array<{ key: string; items: T[] }> {
  const sorted = [...items].sort((a, b) => {
    const ka = dayKeyOf(a), kb = dayKeyOf(b);
    if (ka !== kb) return !ka ? 1 : !kb ? -1 : ka.localeCompare(kb);
    return (a.takenAt || a.uploadedAt || "").localeCompare(b.takenAt || b.uploadedAt || "");
  });
  const days: Array<{ key: string; items: T[] }> = [];
  for (const item of sorted) {
    const key = dayKeyOf(item);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(item);
    else days.push({ key, items: [item] });
  }
  return days;
}
