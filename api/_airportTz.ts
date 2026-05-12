const IATA_TZ: Record<string, string> = {
  LHR: "Europe/London", LGW: "Europe/London", STN: "Europe/London", MAN: "Europe/London",
  CDG: "Europe/Paris", ORY: "Europe/Paris", AMS: "Europe/Amsterdam", FRA: "Europe/Berlin",
  FCO: "Europe/Rome", NAP: "Europe/Rome", MAD: "Europe/Madrid", BCN: "Europe/Madrid",
  LIS: "Europe/Lisbon", ZRH: "Europe/Zurich", VIE: "Europe/Vienna", DUB: "Europe/Dublin",
  IST: "Europe/Istanbul", SAW: "Europe/Istanbul", AYT: "Europe/Istanbul",
  KEF: "Atlantic/Reykjavik",
  JFK: "America/New_York", EWR: "America/New_York", LGA: "America/New_York",
  BOS: "America/New_York", MIA: "America/New_York", ATL: "America/New_York",
  ORD: "America/Chicago", DFW: "America/Chicago",
  DEN: "America/Denver",
  LAX: "America/Los_Angeles", SFO: "America/Los_Angeles", SEA: "America/Los_Angeles",
  DXB: "Asia/Dubai", DOH: "Asia/Qatar",
  SIN: "Asia/Singapore", HKG: "Asia/Hong_Kong", BKK: "Asia/Bangkok",
  HND: "Asia/Tokyo", NRT: "Asia/Tokyo", KIX: "Asia/Tokyo",
  ICN: "Asia/Seoul", DPS: "Asia/Makassar",
  SYD: "Australia/Sydney", MEL: "Australia/Melbourne",
  ACC: "Africa/Accra", LOS: "Africa/Lagos", NBO: "Africa/Nairobi",
  JNB: "Africa/Johannesburg", CPT: "Africa/Johannesburg",
  CMN: "Africa/Casablanca", RAK: "Africa/Casablanca",
  MLE: "Indian/Maldives", MRU: "Indian/Mauritius",
  NAN: "Pacific/Fiji", AKL: "Pacific/Auckland",
  CUN: "America/Cancun", MEX: "America/Mexico_City",
  GRU: "America/Sao_Paulo", YYZ: "America/Toronto",
  DEL: "Asia/Kolkata", BOM: "Asia/Kolkata",
  PEK: "Asia/Shanghai", PVG: "Asia/Shanghai",
  TPE: "Asia/Taipei", KUL: "Asia/Kuala_Lumpur",
  MNL: "Asia/Manila", CGK: "Asia/Jakarta",
  ATH: "Europe/Athens", BRU: "Europe/Brussels",
  CPH: "Europe/Copenhagen", HEL: "Europe/Helsinki",
  OSL: "Europe/Oslo", ARN: "Europe/Stockholm",
};

export function airportTz(iata: string): string | undefined {
  if (!iata) return undefined;
  return IATA_TZ[iata.toUpperCase()];
}
