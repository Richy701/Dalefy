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
  "Singapore": [1.3521, 103.8198],
  "Singapore, Singapore": [1.3521, 103.8198],
  "DPS": [-8.7467, 115.1670],
  "ZRH": [47.4647, 8.5492],
  "JFK": [40.6413, -73.7781],
  "EWR": [40.6895, -74.1745],
  "LGA": [40.7769, -73.8740],
  "LAX": [33.9425, -118.4081],
  "SFO": [37.6213, -122.3790],
  "ORD": [41.9742, -87.9073],
  "ATL": [33.6407, -84.4277],
  "DFW": [32.8998, -97.0403],
  "DEN": [39.8561, -104.6737],
  "SEA": [47.4502, -122.3088],
  "MIA": [25.7959, -80.2870],
  "BOS": [42.3656, -71.0096],
  "IAD": [38.9531, -77.4565],
  "DCA": [38.8512, -77.0402],
  "IAH": [29.9902, -95.3368],
  "MSP": [44.8848, -93.2223],
  "DTW": [42.2124, -83.3534],
  "PHL": [39.8744, -75.2424],
  "CLT": [35.2140, -80.9431],
  "PHX": [33.4373, -112.0078],
  "SAN": [32.7338, -117.1933],
  "TPA": [27.9756, -82.5333],
  "MCO": [28.4312, -81.3081],
  "FLL": [26.0742, -80.1506],
  "BWI": [39.1754, -76.6684],
  "SLC": [40.7899, -111.9791],
  "PDX": [45.5898, -122.5951],
  "HNL": [21.3187, -157.9224],
  "AUS": [30.1975, -97.6664],
  "RDU": [35.8801, -78.7880],
  "CHS": [32.8987, -80.0405],
  "BNA": [36.1263, -86.6774],
  "STL": [38.7487, -90.3700],
  "PIT": [40.4957, -80.2328],
  "IND": [39.7173, -86.2944],
  "MCI": [39.2976, -94.7139],
  "OAK": [37.7126, -122.2197],
  "SJC": [37.3639, -121.9289],
  "PUS": [35.1795, 128.9380],

  // Canada
  "YYZ": [43.6777, -79.6248],
  "YVR": [49.1967, -123.1815],
  "YUL": [45.4706, -73.7408],
  "YOW": [45.3225, -75.6692],
  "YYC": [51.1215, -114.0076],

  // Europe (missing)
  "CDG": [49.0097, 2.5479],
  "ORY": [48.7262, 2.3652],
  "AMS": [52.3105, 4.7683],
  "FRA": [50.0379, 8.5622],
  "MUC": [48.3537, 11.7750],
  "FCO": [41.8003, 12.2389],
  "MXP": [45.6306, 8.7281],
  "MAD": [40.4983, -3.5676],
  "BCN": [41.2974, 2.0833],
  "LIS": [38.7756, -9.1354],
  "CPH": [55.6180, 12.6508],
  "OSL": [60.1976, 11.1004],
  "ARN": [59.6498, 17.9238],
  "HEL": [60.3172, 24.9633],
  "VIE": [48.1103, 16.5697],
  "PRG": [50.1008, 14.2600],
  "WAW": [52.1657, 20.9671],
  "BRU": [50.9014, 4.4844],
  "DUB": [53.4264, -6.2499],
  "EDI": [55.9508, -3.3615],
  "ATH": [37.9364, 23.9445],
  "GVA": [46.2381, 6.1080],

  // Asia-Pacific (missing)
  "BKK": [13.6900, 100.7501],
  "HKG": [22.3080, 113.9185],
  "PEK": [40.0799, 116.6031],
  "PVG": [31.1443, 121.8083],
  "TPE": [25.0797, 121.2342],
  "DEL": [28.5562, 77.1000],
  "BOM": [19.0896, 72.8656],
  "KUL": [2.7456, 101.7099],
  "MNL": [14.5086, 121.0194],
  "CTS": [42.7752, 141.6925],
  "NGO": [34.8584, 136.8125],
  "FUK": [33.5859, 130.4507],

  // Middle East / Africa (missing)
  "AUH": [24.4331, 54.6511],
  "RUH": [24.9576, 46.6988],
  "JED": [21.6796, 39.1565],
  "CAI": [30.1219, 31.4056],
  "JNB": [-26.1392, 28.2460],
  "CPT": [-33.9715, 18.6021],
  "ADD": [8.9779, 38.7993],
  "CMN": [33.3675, -7.5898],
  "ACC": [5.6052, -0.1718],
  "LOS": [6.5774, 3.3213],

  // Latin America
  "MEX": [19.4363, -99.0721],
  "CUN": [21.0365, -86.8771],
  "GRU": [-23.4356, -46.4731],
  "GIG": [-22.8100, -43.2506],
  "EZE": [-34.8222, -58.5358],
  "BOG": [4.7016, -74.1469],
  "LIM": [-12.0219, -77.1143],
  "SCL": [-33.3930, -70.7858],

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

  // South Korea
  "ICN": [37.4602, 126.4407],
  "GMP": [37.5585, 126.7906],
  "Seoul": [37.5665, 126.9780],
  "Seoul, South Korea": [37.5665, 126.9780],
  "Incheon": [37.4563, 126.7052],
  "Gangnam, Seoul": [37.4979, 127.0276],
  "Myeongdong, Seoul": [37.5636, 126.9869],
  "Bukchon, Seoul": [37.5826, 126.9831],
  "Itaewon, Seoul": [37.5345, 126.9946],
  "Hongdae, Seoul": [37.5563, 126.9237],
  "Busan": [35.1796, 129.0756],
  "Jeju": [33.4996, 126.5312],

  // Japan
  "NRT": [35.7647, 140.3864],
  "HND": [35.5494, 139.7798],
  "KIX": [34.4320, 135.2304],
  "Tokyo": [35.6762, 139.6503],
  "Tokyo, Japan": [35.6762, 139.6503],
  "Osaka": [34.6937, 135.5023],
  "Kyoto": [35.0116, 135.7681],

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
    if (key.length <= 3) continue; // skip airport codes for partial matching
    const keyLower = key.toLowerCase();
    if (lower.includes(keyLower) || keyLower.includes(lower)) {
      return coords;
    }
  }

  return null;
}
