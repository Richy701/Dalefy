/** City and country for airport codes the app meets in flight bookings, so "BGI" can read as Bridgetown, Barbados */
const AIRPORTS: Record<string, [city: string, country: string]> = {
  LHR: ["London", "United Kingdom"], LGW: ["London", "United Kingdom"], STN: ["London", "United Kingdom"], LTN: ["London", "United Kingdom"], LCY: ["London", "United Kingdom"],
  MAN: ["Manchester", "United Kingdom"], EDI: ["Edinburgh", "United Kingdom"], BHX: ["Birmingham", "United Kingdom"], GLA: ["Glasgow", "United Kingdom"], BRS: ["Bristol", "United Kingdom"],
  CDG: ["Paris", "France"], ORY: ["Paris", "France"], NCE: ["Nice", "France"], AMS: ["Amsterdam", "Netherlands"],
  FRA: ["Frankfurt", "Germany"], MUC: ["Munich", "Germany"], BER: ["Berlin", "Germany"],
  FCO: ["Rome", "Italy"], MXP: ["Milan", "Italy"], NAP: ["Naples", "Italy"], VCE: ["Venice", "Italy"],
  MAD: ["Madrid", "Spain"], BCN: ["Barcelona", "Spain"], AGP: ["Málaga", "Spain"], PMI: ["Palma de Mallorca", "Spain"],
  LIS: ["Lisbon", "Portugal"], OPO: ["Porto", "Portugal"], FAO: ["Faro", "Portugal"],
  ZRH: ["Zurich", "Switzerland"], GVA: ["Geneva", "Switzerland"], VIE: ["Vienna", "Austria"], PRG: ["Prague", "Czechia"], WAW: ["Warsaw", "Poland"],
  DUB: ["Dublin", "Ireland"], BRU: ["Brussels", "Belgium"], ATH: ["Athens", "Greece"], CPH: ["Copenhagen", "Denmark"],
  HEL: ["Helsinki", "Finland"], OSL: ["Oslo", "Norway"], ARN: ["Stockholm", "Sweden"],
  IST: ["Istanbul", "Türkiye"], SAW: ["Istanbul", "Türkiye"], AYT: ["Antalya", "Türkiye"], DLM: ["Dalaman", "Türkiye"], KEF: ["Reykjavík", "Iceland"],
  JFK: ["New York", "United States"], EWR: ["New York", "United States"], LGA: ["New York", "United States"],
  BOS: ["Boston", "United States"], MIA: ["Miami", "United States"], FLL: ["Fort Lauderdale", "United States"], ATL: ["Atlanta", "United States"],
  CLT: ["Charlotte", "United States"], PHL: ["Philadelphia", "United States"], IAD: ["Washington", "United States"], DCA: ["Washington", "United States"],
  BWI: ["Baltimore", "United States"], RDU: ["Raleigh", "United States"], CHS: ["Charleston", "United States"], PIT: ["Pittsburgh", "United States"],
  DTW: ["Detroit", "United States"], MCO: ["Orlando", "United States"], TPA: ["Tampa", "United States"], IND: ["Indianapolis", "United States"],
  ORD: ["Chicago", "United States"], DFW: ["Dallas", "United States"], IAH: ["Houston", "United States"], MSP: ["Minneapolis", "United States"],
  BNA: ["Nashville", "United States"], STL: ["St. Louis", "United States"], MCI: ["Kansas City", "United States"], AUS: ["Austin", "United States"],
  DEN: ["Denver", "United States"], SLC: ["Salt Lake City", "United States"], PHX: ["Phoenix", "United States"], LAS: ["Las Vegas", "United States"],
  LAX: ["Los Angeles", "United States"], SFO: ["San Francisco", "United States"], SEA: ["Seattle", "United States"], SAN: ["San Diego", "United States"],
  PDX: ["Portland", "United States"], OAK: ["Oakland", "United States"], SJC: ["San Jose", "United States"], HNL: ["Honolulu", "United States"],
  YYZ: ["Toronto", "Canada"], YUL: ["Montreal", "Canada"], YOW: ["Ottawa", "Canada"], YVR: ["Vancouver", "Canada"], YYC: ["Calgary", "Canada"],
  DXB: ["Dubai", "United Arab Emirates"], AUH: ["Abu Dhabi", "United Arab Emirates"], DOH: ["Doha", "Qatar"], RUH: ["Riyadh", "Saudi Arabia"], JED: ["Jeddah", "Saudi Arabia"],
  SIN: ["Singapore", "Singapore"], HKG: ["Hong Kong", "Hong Kong"], BKK: ["Bangkok", "Thailand"], DMK: ["Bangkok", "Thailand"], HKT: ["Phuket", "Thailand"], CNX: ["Chiang Mai", "Thailand"],
  HND: ["Tokyo", "Japan"], NRT: ["Tokyo", "Japan"], KIX: ["Osaka", "Japan"], CTS: ["Sapporo", "Japan"], NGO: ["Nagoya", "Japan"], FUK: ["Fukuoka", "Japan"],
  ICN: ["Seoul", "South Korea"], GMP: ["Seoul", "South Korea"], PUS: ["Busan", "South Korea"],
  DPS: ["Bali", "Indonesia"], CGK: ["Jakarta", "Indonesia"], KUL: ["Kuala Lumpur", "Malaysia"], TPE: ["Taipei", "Taiwan"], MNL: ["Manila", "Philippines"],
  PEK: ["Beijing", "China"], PVG: ["Shanghai", "China"], DEL: ["Delhi", "India"], BOM: ["Mumbai", "India"],
  SYD: ["Sydney", "Australia"], MEL: ["Melbourne", "Australia"], AKL: ["Auckland", "New Zealand"], NAN: ["Nadi", "Fiji"],
  ACC: ["Accra", "Ghana"], LOS: ["Lagos", "Nigeria"], NBO: ["Nairobi", "Kenya"], ADD: ["Addis Ababa", "Ethiopia"], CAI: ["Cairo", "Egypt"],
  JNB: ["Johannesburg", "South Africa"], CPT: ["Cape Town", "South Africa"], CMN: ["Casablanca", "Morocco"], RAK: ["Marrakesh", "Morocco"],
  MLE: ["Malé", "Maldives"], MRU: ["Mauritius", "Mauritius"], SEZ: ["Mahé", "Seychelles"],
  MEX: ["Mexico City", "Mexico"], CUN: ["Cancún", "Mexico"], GRU: ["São Paulo", "Brazil"], GIG: ["Rio de Janeiro", "Brazil"], EZE: ["Buenos Aires", "Argentina"],
  BOG: ["Bogotá", "Colombia"], LIM: ["Lima", "Peru"], SCL: ["Santiago", "Chile"],
  BGI: ["Bridgetown", "Barbados"], ANU: ["St John's", "Antigua and Barbuda"], UVF: ["St Lucia", "Saint Lucia"], GND: ["Grenada", "Grenada"],
  MBJ: ["Montego Bay", "Jamaica"], KIN: ["Kingston", "Jamaica"], NAS: ["Nassau", "Bahamas"], PUJ: ["Punta Cana", "Dominican Republic"],
  POS: ["Port of Spain", "Trinidad and Tobago"], TAB: ["Tobago", "Trinidad and Tobago"], AUA: ["Aruba", "Aruba"],
};

/** "Bridgetown, Barbados" for "BGI"; null when the text isn't a code we know */
export function airportPlace(code: string): { city: string; country: string; label: string } | null {
  const hit = AIRPORTS[code.trim().toUpperCase()];
  if (!hit || !/^[A-Za-z]{3}$/.test(code.trim())) return null;
  const [city, country] = hit;
  return { city, country, label: city === country ? city : `${city}, ${country}` };
}
