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

export async function searchHotels(
  q: string,
  check_in: string,
  check_out: string,
  adults = 2
): Promise<HotelResult[]> {
  const params = new URLSearchParams({ q, check_in, check_out, adults: String(adults) });
  const res = await fetch(`/api/hotels?${params}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.hotels ?? [];
}
