export interface FlightResult {
  airline: string;
  flightNum: string;
  from: string;
  fromCode: string;
  to: string;
  toCode: string;
  departTime: string;
  arriveTime: string;
  durationMins: number;
  price: number;
  stops: number;
  logo: string;
  status?: string;
  terminal?: string;
}

export interface HotelResult {
  name: string;
  rating: number;
  reviews: number;
  pricePerNight: string;
  image: string;
  checkin: string;
  checkout: string;
  amenities: string[];
  stars: string;
}

export async function searchFlights(
  from: string,
  to: string,
  date: string,
  adults = 1
): Promise<FlightResult[]> {
  const params = new URLSearchParams({ from, to, date, adults: String(adults) });
  const res = await fetch(`/api/flights?${params}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.flights ?? [];
}

export async function lookupFlight(
  flightNum: string,
  date: string
): Promise<FlightResult[]> {
  const params = new URLSearchParams({ number: flightNum.replace(/\s+/g, ""), date });
  const res = await fetch(`/api/flight-number?${params}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.flights ?? [];
}

export interface ActivityResult {
  name: string;
  rating: number;
  reviews: number;
  image: string;
  address: string;
  type: string;
  openStatus: string;
}

export interface DiningResult {
  name: string;
  rating: number;
  reviews: number;
  image: string;
  address: string;
  priceTag: string;
  cuisines: string[];
  openStatus: string;
}

export async function searchActivities(
  q: string
): Promise<ActivityResult[]> {
  const params = new URLSearchParams({ q });
  const res = await fetch(`/api/activities?${params}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.activities ?? [];
}

export async function searchDining(
  q: string
): Promise<DiningResult[]> {
  const params = new URLSearchParams({ q });
  const res = await fetch(`/api/dining?${params}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.restaurants ?? [];
}

export async function searchHotels(
  q: string,
  check_in: string,
  check_out: string,
  adults = 2
): Promise<HotelResult[]> {
  // Booking.com API rejects past dates — use future stand-in dates for the search
  // while preserving the original dates for the event
  let apiCheckIn = check_in;
  let apiCheckOut = check_out;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(check_in) < today) {
    const nights = Math.max(1, Math.round((new Date(check_out).getTime() - new Date(check_in).getTime()) / 86400000));
    const futureIn = new Date(today);
    futureIn.setDate(futureIn.getDate() + 7);
    const futureOut = new Date(futureIn);
    futureOut.setDate(futureOut.getDate() + nights);
    apiCheckIn = futureIn.toISOString().slice(0, 10);
    apiCheckOut = futureOut.toISOString().slice(0, 10);
  }
  const params = new URLSearchParams({ q, check_in: apiCheckIn, check_out: apiCheckOut, adults: String(adults) });
  const res = await fetch(`/api/hotels?${params}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.hotels ?? [];
}
