import { validateQuery, validateDate, requireRapidApi } from "./_validate.js";

const RAPID_HOST = "booking-com15.p.rapidapi.com";

export default async function handler(req: any, res: any) {
  const { q, check_in, check_out, adults = "2" } = req.query as Record<string, string>;

  const err = validateQuery(q) || validateDate(check_in, "check_in") || validateDate(check_out, "check_out");
  if (err) return res.status(400).json({ error: err });

  const key = requireRapidApi(res);
  if (!key) return;

  const headers = {
    "x-rapidapi-key": key,
    "x-rapidapi-host": RAPID_HOST,
  };

  try {
    // Step 1: resolve destination ID
    const destResp = await fetch(
      `https://${RAPID_HOST}/api/v1/hotels/searchDestination?query=${encodeURIComponent(q)}`,
      { headers }
    );
    const destData = await destResp.json();
    const dest = destData.data?.[0];
    if (!dest) return res.json({ hotels: [] });

    // Step 2: search hotels
    const params = new URLSearchParams({
      dest_id: dest.dest_id,
      search_type: dest.search_type ?? "city",
      arrival_date: check_in,
      departure_date: check_out,
      adults,
      room_qty: "1",
      currency_code: "USD",
    });

    const hotelResp = await fetch(
      `https://${RAPID_HOST}/api/v1/hotels/searchHotels?${params}`,
      { headers }
    );
    const hotelData = await hotelResp.json();

    const hotels = (hotelData.data?.hotels ?? []).slice(0, 8).map((h: any) => {
      const p = h.property ?? {};
      const price = p.priceBreakdown?.grossPrice?.value;
      const nights = daysBetween(check_in, check_out) || 1;
      const perNight = price ? Math.round(price / nights) : 0;

      return {
        name: p.name ?? "",
        rating: p.reviewScore ?? 0,
        reviews: p.reviewCount ?? 0,
        pricePerNight: perNight > 0 ? `$${perNight}` : "",
        image: p.photoUrls?.[0] ?? "",
        checkin: p.checkin?.fromTime ?? "",
        checkout: p.checkout?.untilTime ?? "",
        amenities: [] as string[],
        stars: p.propertyClass ? `${p.propertyClass}-star` : "",
      };
    });

    res.json({ hotels });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch from Booking.com" });
  }
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}
