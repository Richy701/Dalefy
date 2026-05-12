const DEST_TZ: Record<string, string> = {
  seoul: "Asia/Seoul", korea: "Asia/Seoul",
  tokyo: "Asia/Tokyo", japan: "Asia/Tokyo",
  bangkok: "Asia/Bangkok", thailand: "Asia/Bangkok",
  bali: "Asia/Makassar", singapore: "Asia/Singapore",
  dubai: "Asia/Dubai", "abu dhabi": "Asia/Dubai",
  istanbul: "Europe/Istanbul", turkey: "Europe/Istanbul", antalya: "Europe/Istanbul",
  london: "Europe/London", paris: "Europe/Paris", rome: "Europe/Rome",
  nairobi: "Africa/Nairobi", kenya: "Africa/Nairobi",
  accra: "Africa/Accra", ghana: "Africa/Accra",
  lagos: "Africa/Lagos", nigeria: "Africa/Lagos",
  "new york": "America/New_York", "los angeles": "America/Los_Angeles",
  sydney: "Australia/Sydney", melbourne: "Australia/Melbourne",
  amalfi: "Europe/Rome", milan: "Europe/Rome", florence: "Europe/Rome",
  iceland: "Atlantic/Reykjavik", reykjavik: "Atlantic/Reykjavik",
  "cape town": "Africa/Johannesburg", johannesburg: "Africa/Johannesburg",
  marrakech: "Africa/Casablanca", morocco: "Africa/Casablanca",
  cancun: "America/Cancun", mexico: "America/Mexico_City",
  "hong kong": "Asia/Hong_Kong", maldives: "Indian/Maldives",
  mauritius: "Indian/Mauritius", fiji: "Pacific/Fiji",
  amsterdam: "Europe/Amsterdam", barcelona: "Europe/Madrid", madrid: "Europe/Madrid",
  lisbon: "Europe/Lisbon", zurich: "Europe/Zurich", vienna: "Europe/Vienna",
  dublin: "Europe/Dublin", edinburgh: "Europe/London", glasgow: "Europe/London",
  manchester: "Europe/London", birmingham: "Europe/London", bristol: "Europe/London",
  liverpool: "Europe/London", leeds: "Europe/London", cardiff: "Europe/London",
  belfast: "Europe/London",
  heathrow: "Europe/London", gatwick: "Europe/London", stansted: "Europe/London", luton: "Europe/London",
  "st pancras": "Europe/London", "kings cross": "Europe/London", "king's cross": "Europe/London",
  euston: "Europe/London", paddington: "Europe/London", waterloo: "Europe/London",
  "victoria station": "Europe/London",
  brussels: "Europe/Brussels", berlin: "Europe/Berlin",
  copenhagen: "Europe/Copenhagen", oslo: "Europe/Oslo", stockholm: "Europe/Stockholm",
  helsinki: "Europe/Helsinki", athens: "Europe/Athens",
  "kuala lumpur": "Asia/Kuala_Lumpur", manila: "Asia/Manila", jakarta: "Asia/Jakarta",
  delhi: "Asia/Kolkata", mumbai: "Asia/Kolkata", india: "Asia/Kolkata",
  beijing: "Asia/Shanghai", shanghai: "Asia/Shanghai",
  taipei: "Asia/Taipei", doha: "Asia/Qatar", qatar: "Asia/Qatar",
  "sao paulo": "America/Sao_Paulo", toronto: "America/Toronto",
  "new zealand": "Pacific/Auckland", auckland: "Pacific/Auckland",
};

export function destinationTz(dest: string | undefined): string | undefined {
  if (!dest) return undefined;
  const lower = dest.toLowerCase();
  for (const [key, tz] of Object.entries(DEST_TZ)) {
    if (lower.includes(key)) return tz;
  }
  return undefined;
}

/**
 * Resolve timezone for a single event by checking its own location fields
 * before falling back to the trip-level destination timezone.
 */
export function eventTz(
  ev: { type: string; location?: string; depAirport?: string; arrAirport?: string; depTz?: string; arrTz?: string },
  tripTz?: string,
  which: "dep" | "arr" = "dep"
): string | undefined {
  const isRoute = ev.type === "flight" || ev.type === "transfer";
  if (isRoute) {
    const locParts = ev.location?.split(/\s+to\s+|→/i);
    if (which === "arr") return ev.arrTz || destinationTz(ev.arrAirport) || destinationTz(locParts?.[1]?.trim()) || tripTz;
    return ev.depTz || destinationTz(ev.depAirport) || destinationTz(locParts?.[0]?.trim()) || tripTz;
  }
  const routeParts = ev.location?.split(/\s+to\s+|→/i);
  if (routeParts && routeParts.length > 1) {
    const tz = which === "arr" ? destinationTz(routeParts[1]?.trim()) : destinationTz(routeParts[0]?.trim());
    if (tz) return tz;
  }
  return destinationTz(ev.location) || tripTz;
}

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
