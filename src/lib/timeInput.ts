export const TIME_INPUT_ERROR = "Enter a time like 11:00 or 4pm, or leave blank if not confirmed.";

/** Empty means unscheduled; never invent an appointment for an unknown time. */
export function parseTimeInput(raw: string | undefined): string | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value || /^(tbc|tbd|to be confirmed|to be decided)$/.test(value)) return "";
  const compact = value.replace(/([ap])\.?\s*m\.?$/, "$1m").replace(/\s+/g, "");
  const match = compact.match(/^(\d{1,2})(?:[:.](\d{2}))?(am|pm)?$/)
    ?? compact.match(/^(\d{1,2})(\d{2})(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3];
  if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (meridiem) hour = (hour % 12) + (meridiem === "pm" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTimeInput(raw: string): string {
  return parseTimeInput(raw) ?? raw.trim();
}

export function isValidTimeInput(raw: string | undefined): boolean {
  return parseTimeInput(raw) !== null;
}
