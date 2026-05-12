export function tzAbbr(iana: string | undefined, date: string): string {
  if (!iana) return "";
  try {
    const d = new Date(date + "T12:00:00Z");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: iana,
      timeZoneName: "short",
    }).formatToParts(d);
    return parts.find(p => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}
