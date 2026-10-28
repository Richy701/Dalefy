/**
 * What a traveller needs to know on arrival, by country: money, plugs and the clock.
 * Plug letters are the IEC types (A, B, C, D, E, F, G, I, L, M, N). The time zone is the
 * one most group trips land in; big countries list their main tourist zone.
 */
export interface LocalFacts { country: string; currency: string; plugs: string; timeZone: string }

const FACTS: LocalFacts[] = [
  { country: "United Kingdom", currency: "GBP", plugs: "G", timeZone: "Europe/London" },
  { country: "Ireland", currency: "EUR", plugs: "G", timeZone: "Europe/Dublin" },
  { country: "Portugal", currency: "EUR", plugs: "C, F", timeZone: "Europe/Lisbon" },
  { country: "Spain", currency: "EUR", plugs: "C, F", timeZone: "Europe/Madrid" },
  { country: "France", currency: "EUR", plugs: "C, E", timeZone: "Europe/Paris" },
  { country: "Italy", currency: "EUR", plugs: "C, F, L", timeZone: "Europe/Rome" },
  { country: "Greece", currency: "EUR", plugs: "C, F", timeZone: "Europe/Athens" },
  { country: "Germany", currency: "EUR", plugs: "C, F", timeZone: "Europe/Berlin" },
  { country: "Netherlands", currency: "EUR", plugs: "C, F", timeZone: "Europe/Amsterdam" },
  { country: "Croatia", currency: "EUR", plugs: "C, F", timeZone: "Europe/Zagreb" },
  { country: "Switzerland", currency: "CHF", plugs: "C, J", timeZone: "Europe/Zurich" },
  { country: "Iceland", currency: "ISK", plugs: "C, F", timeZone: "Atlantic/Reykjavik" },
  { country: "Turkey", currency: "TRY", plugs: "C, F", timeZone: "Europe/Istanbul" },
  { country: "Morocco", currency: "MAD", plugs: "C, E", timeZone: "Africa/Casablanca" },
  { country: "Egypt", currency: "EGP", plugs: "C, F", timeZone: "Africa/Cairo" },
  { country: "Ghana", currency: "GHS", plugs: "D, G", timeZone: "Africa/Accra" },
  { country: "Nigeria", currency: "NGN", plugs: "D, G", timeZone: "Africa/Lagos" },
  { country: "Kenya", currency: "KES", plugs: "G", timeZone: "Africa/Nairobi" },
  { country: "Tanzania", currency: "TZS", plugs: "D, G", timeZone: "Africa/Dar_es_Salaam" },
  { country: "South Africa", currency: "ZAR", plugs: "C, M, N", timeZone: "Africa/Johannesburg" },
  { country: "United Arab Emirates", currency: "AED", plugs: "G", timeZone: "Asia/Dubai" },
  { country: "Qatar", currency: "QAR", plugs: "D, G", timeZone: "Asia/Qatar" },
  { country: "Maldives", currency: "MVR", plugs: "D, G", timeZone: "Indian/Maldives" },
  { country: "India", currency: "INR", plugs: "C, D, M", timeZone: "Asia/Kolkata" },
  { country: "Sri Lanka", currency: "LKR", plugs: "D, G", timeZone: "Asia/Colombo" },
  { country: "Thailand", currency: "THB", plugs: "A, B, C, O", timeZone: "Asia/Bangkok" },
  { country: "Vietnam", currency: "VND", plugs: "A, C", timeZone: "Asia/Ho_Chi_Minh" },
  { country: "Indonesia", currency: "IDR", plugs: "C, F", timeZone: "Asia/Makassar" },
  { country: "Singapore", currency: "SGD", plugs: "G", timeZone: "Asia/Singapore" },
  { country: "Japan", currency: "JPY", plugs: "A, B", timeZone: "Asia/Tokyo" },
  { country: "Australia", currency: "AUD", plugs: "I", timeZone: "Australia/Sydney" },
  { country: "New Zealand", currency: "NZD", plugs: "I", timeZone: "Pacific/Auckland" },
  { country: "United States", currency: "USD", plugs: "A, B", timeZone: "America/New_York" },
  { country: "Canada", currency: "CAD", plugs: "A, B", timeZone: "America/Toronto" },
  { country: "Mexico", currency: "MXN", plugs: "A, B", timeZone: "America/Cancun" },
  { country: "Barbados", currency: "BBD", plugs: "A, B", timeZone: "America/Barbados" },
  { country: "Jamaica", currency: "JMD", plugs: "A, B", timeZone: "America/Jamaica" },
  { country: "Dominican Republic", currency: "DOP", plugs: "A, B", timeZone: "America/Santo_Domingo" },
  { country: "Brazil", currency: "BRL", plugs: "C, N", timeZone: "America/Sao_Paulo" },
];

/** Other ways the same country gets written */
const ALIASES: Record<string, string> = {
  "uk": "United Kingdom", "england": "United Kingdom", "scotland": "United Kingdom", "wales": "United Kingdom",
  "usa": "United States", "us": "United States", "united states of america": "United States",
  "uae": "United Arab Emirates", "dubai": "United Arab Emirates", "abu dhabi": "United Arab Emirates",
  "bali": "Indonesia", "lisbon": "Portugal", "porto": "Portugal", "phuket": "Thailand", "bangkok": "Thailand",
  "chiang mai": "Thailand", "accra": "Ghana", "nairobi": "Kenya", "cape town": "South Africa", "doha": "Qatar",
  "utah": "United States", "park city": "United States", "new york": "United States", "cancun": "Mexico",
  "marrakech": "Morocco", "tokyo": "Japan", "sydney": "Australia", "zanzibar": "Tanzania",
};

/**
 * Facts for a destination. A country or city named in the destination wins, since the geocoder
 * sometimes places a name like "Thailand (Chiang Mai & Phuket)" in the wrong country; the
 * geocoded country is the fallback.
 */
export function localFactsFor(destination: string, country?: string | null): LocalFacts | null {
  const byName = (name: string) => FACTS.find(f => f.country.toLowerCase() === name.toLowerCase()) ?? null;
  const text = destination.toLowerCase();
  const direct = FACTS.find(f => text.includes(f.country.toLowerCase()));
  if (direct) return direct;
  const alias = Object.keys(ALIASES).sort((a, b) => b.length - a.length).find(k => new RegExp(`\\b${k}\\b`).test(text));
  if (alias) return byName(ALIASES[alias]);
  if (!country) return null;
  return byName(country) ?? (ALIASES[country.toLowerCase()] ? byName(ALIASES[country.toLowerCase()]) : null);
}

/** The time there right now, e.g. "14:05" */
export function localTime(timeZone: string, now = new Date()): string {
  try {
    return now.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
