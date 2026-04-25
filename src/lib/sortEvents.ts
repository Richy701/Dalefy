import type { TravelEvent } from "@/types";

/** Parse event time ("HH:MM" or "H:MM AM/PM") into total minutes from midnight */
function timeToMinutes(time: string): number {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + mins;
}

/** Sort events chronologically by date then time */
export function sortEvents(events: TravelEvent[]): TravelEvent[] {
  return [...events].sort((a, b) => {
    const dateCmp = (a.date || "").localeCompare(b.date || "");
    if (dateCmp !== 0) return dateCmp;
    return timeToMinutes(a.time || "") - timeToMinutes(b.time || "");
  });
}
