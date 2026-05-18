/** Canonical IATA airport → IANA timezone map (single source of truth for mobile). */
export const IATA_TZ: Record<string, string> = {
  LHR: "Europe/London", LGW: "Europe/London", STN: "Europe/London", MAN: "Europe/London",
  EDI: "Europe/London",
  CDG: "Europe/Paris", ORY: "Europe/Paris", AMS: "Europe/Amsterdam",
  FRA: "Europe/Berlin", MUC: "Europe/Berlin",
  FCO: "Europe/Rome", MXP: "Europe/Rome", NAP: "Europe/Rome",
  MAD: "Europe/Madrid", BCN: "Europe/Madrid",
  LIS: "Europe/Lisbon", ZRH: "Europe/Zurich", GVA: "Europe/Zurich",
  VIE: "Europe/Vienna", PRG: "Europe/Prague", WAW: "Europe/Warsaw",
  DUB: "Europe/Dublin", BRU: "Europe/Brussels",
  ATH: "Europe/Athens", CPH: "Europe/Copenhagen",
  HEL: "Europe/Helsinki", OSL: "Europe/Oslo", ARN: "Europe/Stockholm",
  IST: "Europe/Istanbul", SAW: "Europe/Istanbul", AYT: "Europe/Istanbul",
  KEF: "Atlantic/Reykjavik",
  JFK: "America/New_York", EWR: "America/New_York", LGA: "America/New_York",
  BOS: "America/New_York", MIA: "America/New_York", FLL: "America/New_York",
  ATL: "America/New_York", CLT: "America/New_York", PHL: "America/New_York",
  IAD: "America/New_York", DCA: "America/New_York", BWI: "America/New_York",
  RDU: "America/New_York", CHS: "America/New_York", PIT: "America/New_York",
  DTW: "America/New_York", MCO: "America/New_York", TPA: "America/New_York",
  IND: "America/Indiana/Indianapolis",
  ORD: "America/Chicago", DFW: "America/Chicago", IAH: "America/Chicago",
  MSP: "America/Chicago", BNA: "America/Chicago", STL: "America/Chicago",
  MCI: "America/Chicago", AUS: "America/Chicago",
  DEN: "America/Denver", SLC: "America/Denver", PHX: "America/Phoenix",
  LAX: "America/Los_Angeles", SFO: "America/Los_Angeles", SEA: "America/Los_Angeles",
  SAN: "America/Los_Angeles", PDX: "America/Los_Angeles",
  OAK: "America/Los_Angeles", SJC: "America/Los_Angeles",
  HNL: "Pacific/Honolulu",
  YYZ: "America/Toronto", YUL: "America/Toronto", YOW: "America/Toronto",
  YVR: "America/Vancouver", YYC: "America/Edmonton",
  DXB: "Asia/Dubai", AUH: "Asia/Dubai", DOH: "Asia/Qatar",
  RUH: "Asia/Riyadh", JED: "Asia/Riyadh",
  SIN: "Asia/Singapore", HKG: "Asia/Hong_Kong", BKK: "Asia/Bangkok",
  HND: "Asia/Tokyo", NRT: "Asia/Tokyo", KIX: "Asia/Tokyo",
  CTS: "Asia/Tokyo", NGO: "Asia/Tokyo", FUK: "Asia/Tokyo",
  ICN: "Asia/Seoul", GMP: "Asia/Seoul", PUS: "Asia/Seoul",
  DPS: "Asia/Makassar", KUL: "Asia/Kuala_Lumpur",
  TPE: "Asia/Taipei", MNL: "Asia/Manila", CGK: "Asia/Jakarta",
  PEK: "Asia/Shanghai", PVG: "Asia/Shanghai",
  DEL: "Asia/Kolkata", BOM: "Asia/Kolkata",
  SYD: "Australia/Sydney", MEL: "Australia/Melbourne",
  ACC: "Africa/Accra", LOS: "Africa/Lagos", NBO: "Africa/Nairobi",
  ADD: "Africa/Addis_Ababa", CAI: "Africa/Cairo",
  JNB: "Africa/Johannesburg", CPT: "Africa/Johannesburg",
  CMN: "Africa/Casablanca", RAK: "Africa/Casablanca",
  MLE: "Indian/Maldives", MRU: "Indian/Mauritius",
  NAN: "Pacific/Fiji", AKL: "Pacific/Auckland",
  MEX: "America/Mexico_City", CUN: "America/Cancun",
  GRU: "America/Sao_Paulo", GIG: "America/Sao_Paulo",
  EZE: "America/Argentina/Buenos_Aires", BOG: "America/Bogota",
  LIM: "America/Lima", SCL: "America/Santiago",
};

/** Destination/city name → IANA timezone map. */
export const DEST_TZ: Record<string, string> = {
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
  dublin: "Europe/Dublin", brussels: "Europe/Brussels", berlin: "Europe/Berlin",
  copenhagen: "Europe/Copenhagen", oslo: "Europe/Oslo", stockholm: "Europe/Stockholm",
  helsinki: "Europe/Helsinki", athens: "Europe/Athens",
  "kuala lumpur": "Asia/Kuala_Lumpur", manila: "Asia/Manila", jakarta: "Asia/Jakarta",
  delhi: "Asia/Kolkata", mumbai: "Asia/Kolkata", india: "Asia/Kolkata",
  beijing: "Asia/Shanghai", shanghai: "Asia/Shanghai",
  taipei: "Asia/Taipei", doha: "Asia/Qatar", qatar: "Asia/Qatar",
  "sao paulo": "America/Sao_Paulo", toronto: "America/Toronto",
  "new zealand": "Pacific/Auckland", auckland: "Pacific/Auckland",
};

export function getDestinationTz(destination?: string): string | undefined {
  if (!destination) return undefined;
  const lower = destination.toLowerCase();
  for (const [key, tz] of Object.entries(DEST_TZ)) {
    if (lower.includes(key)) return tz;
  }
  return undefined;
}

export function getAirportTz(iata: string | undefined): string | undefined {
  if (!iata) return undefined;
  return IATA_TZ[iata.toUpperCase()];
}

export function getDepAirportTz(ev: { depAirport?: string; depTz?: string; location?: string }): string | undefined {
  if (ev.depTz) return ev.depTz;
  const code = ev.depAirport?.toUpperCase()
    || ev.location?.match(/^([A-Z]{3})\s+to\s+/i)?.[1]?.toUpperCase();
  return code ? IATA_TZ[code] : undefined;
}

export function getUtcOffsetMins(tz: string, dateStr: string): number {
  try {
    const d = new Date(dateStr + "T12:00:00Z");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d);
    const localH = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    const localM = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
    const localDay = parseInt(parts.find(p => p.type === "day")?.value || "0", 10);
    const utcDay = d.getUTCDate();
    let offsetMins = (localH * 60 + localM) - (12 * 60);
    if (localDay > utcDay) offsetMins += 1440;
    else if (localDay < utcDay) offsetMins -= 1440;
    return offsetMins;
  } catch { return 0; }
}

export function todayInTz(tz?: string): string {
  const now = new Date();
  if (!tz) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function tomorrowInTz(tz?: string): string {
  const tomorrow = new Date(Date.now() + 86400000);
  if (!tz) {
    return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(tomorrow);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function yesterdayInTz(tz?: string): string {
  const yesterday = new Date(Date.now() - 86400000);
  if (!tz) {
    return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(yesterday);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function nowInTz(tz?: string): { dateStr: string; minutes: number } {
  const now = new Date();
  if (!tz) {
    return {
      dateStr: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0";
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: parseInt(get("hour")) * 60 + parseInt(get("minute")),
  };
}

export function timeToMinutes(t: string): number {
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
  const m12 = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m12) return -1;
  let h = parseInt(m12[1]);
  const min = parseInt(m12[2]);
  const pm = m12[3].toUpperCase() === "PM";
  if (pm && h < 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + min;
}
