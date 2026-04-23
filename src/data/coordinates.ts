// Location name → [lat, lng] lookup for dynamic map rendering
export const LOCATION_COORDS: Record<string, [number, number]> = {
  // Airports
  "MAN": [53.3537, -2.275],
  "DOH": [25.2731, 51.6080],
  "NBO": [-1.3192, 36.9278],
  "LHR": [51.4700, -0.4543],
  "NRT": [35.7720, 140.3929],
  "HND": [35.5494, 139.7798],
  "KIX": [34.4347, 135.2440],
  "DXB": [25.2532, 55.3657],
  "MLE": [4.1918, 73.5292],
  "NAP": [40.8860, 14.2908],
  "KEF": [63.9850, -22.6056],
  "SIN": [1.3644, 103.9915],
  "DPS": [-8.7467, 115.1670],
  "ZRH": [47.4647, 8.5492],
  "JFK": [40.6413, -73.7781],

  // Kenya
  "Karen, Nairobi": [-1.3177, 36.7126],
  "Langata Road, Nairobi": [-1.3282, 36.7556],
  "Wilson Airport": [-1.3214, 36.8147],
  "Masai Mara": [-1.4833, 35.1500],
  "Masai Mara National Reserve": [-1.4833, 35.1500],
  "Mara River, Masai Mara": [-1.5200, 35.0300],
  "Maasai Community, Masai Mara": [-1.4600, 35.1800],
  "Amboseli National Park": [-2.6527, 37.2606],
  "Amboseli Conservancy": [-2.6527, 37.2606],
  "Angama Mara Private Site": [-1.4200, 35.1200],

  // Japan
  "Shinjuku, Tokyo": [35.6938, 139.7034],
  "Tsukiji, Tokyo": [35.6654, 139.7707],
  "Asakusa, Tokyo": [35.7148, 139.7967],
  "Ginza, Tokyo": [35.6717, 139.7649],
  "Kamogawa, Kyoto": [35.0116, 135.7681],
  "Fushimi, Kyoto": [34.9671, 135.7727],
  "Gion District, Kyoto": [35.0036, 135.7756],

  // Maldives
  "Baa Atoll": [5.2900, 72.9800],
  "Baa Atoll, Maldives": [5.2900, 72.9800],
  "UNESCO Biosphere Reserve": [5.3200, 73.0000],
  "Private sandbank, Baa Atoll": [5.2800, 72.9600],
  "Soneva Fushi Spa": [5.2900, 72.9800],

  // Amalfi Coast
  "Ravello, Amalfi Coast": [40.6492, 14.6118],
  "Amalfi Marina": [40.6340, 14.6027],
  "Positano": [40.6280, 14.4843],
  "Ravello": [40.6492, 14.6118],
  "Agerola to Positano": [40.6374, 14.5378],
  "Belmond Hotel Caruso Terrace": [40.6492, 14.6118],

  // Iceland
  "Grindavik, Iceland": [63.8424, -22.4348],
  "Blue Lagoon, Grindavik": [63.8804, -22.4495],
  "Thingvellir, Geysir, Gullfoss": [64.2558, -20.5222],
  "South Coast": [63.5320, -19.5109],
  "Reykjavik": [64.1466, -21.9426],
  "Reykjavik Harbour": [64.1525, -21.9507],

  // Bali
  "Ubud, Bali": [-8.5069, 115.2625],
  "Tegallalang, Ubud": [-8.4312, 115.2782],
  "Ubud Village": [-8.5069, 115.2625],
  "Kintamani, Bali": [-8.2416, 115.3749],
  "Ayung River, Ubud": [-8.4453, 115.3117],
  "Jimbaran, Bali": [-8.7900, 115.1650],
  "Uluwatu, Bali": [-8.8291, 115.0849],
  "AYANA Resort, Jimbaran": [-8.7900, 115.1650],
  "AYANA Grand Ballroom": [-8.7900, 115.1650],

  // Switzerland
  "Zurich HB to Interlaken Ost": [46.6863, 7.8632],
  "Interlaken, Switzerland": [46.6863, 7.8632],
  "Jungfrau Region": [46.5365, 7.9630],
  "Grindelwald First": [46.6588, 8.0679],
  "Interlaken Old Town": [46.6863, 7.8632],
  "Interlaken": [46.6863, 7.8632],
  "Lauterbrunnen": [46.5934, 7.9087],
  "Schilthorn Summit, 2,970m": [46.5587, 7.8356],

  // Turkey
  "AYT": [36.8987, 30.8005],
  "IST": [41.2753, 28.7519],
  "SAW": [40.8986, 29.3092],
  "Antalya": [36.8969, 30.7133],
  "Antalya, Turkey": [36.8969, 30.7133],
  "Belek, Antalya": [36.8593, 31.0561],
  "Belek": [36.8593, 31.0561],
  "Regnum Carya, Belek": [36.8530, 31.0680],
  "Regnum Carya": [36.8530, 31.0680],
  "Lotus Hotel, Belek": [36.8550, 31.0600],
  "Kaleici, Antalya": [36.8841, 30.7056],
  "Lara Beach, Antalya": [36.8560, 30.7580],
  "Side, Antalya": [36.7676, 31.3886],
  "Kemer, Antalya": [36.5977, 30.5563],
  "Istanbul": [41.0082, 28.9784],
  "Cappadocia": [38.6431, 34.8289],
  "Pamukkale": [37.9204, 29.1187],

  // New York
  "Meatpacking District, NYC": [40.7397, -74.0077],
  "Chelsea, Manhattan": [40.7465, -74.0014],
  "Brooklyn Bridge, NYC": [40.7061, -73.9969],
  "Midtown West, Manhattan": [40.7614, -73.9776],
  "Liberty Island, NYC": [40.6892, -74.0445],
  "Rockefeller Center, Manhattan": [40.7587, -73.9787],
  "Broadway Theatre, Manhattan": [40.7590, -73.9845],
  "Central Park, Manhattan": [40.7829, -73.9654],
};

export function resolveCoords(location: string): [number, number] | null {
  // Direct match
  if (LOCATION_COORDS[location]) return LOCATION_COORDS[location];

  // Try matching airport codes from "XXX to YYY" patterns
  const codeMatch = location.match(/^([A-Z]{3})\s+to\s+([A-Z]{3})$/);
  if (codeMatch) {
    return LOCATION_COORDS[codeMatch[1]] || LOCATION_COORDS[codeMatch[2]] || null;
  }

  // Case-insensitive exact match
  const lower = location.toLowerCase();
  for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
    if (key.toLowerCase() === lower) return coords;
  }

  // Partial match — only match if the location contains a full key or vice versa,
  // but skip short keys (3 chars or fewer like airport codes) to avoid false matches
  for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
    if (key.length <= 3) continue;
    const keyLower = key.toLowerCase();
    if (lower.includes(keyLower) || keyLower.includes(lower)) {
      return coords;
    }
  }

  return null;
}
