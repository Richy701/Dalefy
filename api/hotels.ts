import { validateQuery, validateDate, requireRapidApi } from "./_validate.js";

const RAPID_HOST = "booking-com.p.rapidapi.com";

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
    // Step 1: resolve destination
    const locResp = await fetch(
      `https://${RAPID_HOST}/v1/hotels/locations?name=${encodeURIComponent(q)}&locale=en-gb`,
      { headers }
    );
    const locData = await locResp.json();
    const dest = Array.isArray(locData) ? locData[0] : null;
    if (!dest) return res.json({ hotels: [] });

    // Step 2: search hotels
    const params = new URLSearchParams({
      dest_id: dest.dest_id,
      dest_type: dest.dest_type ?? "city",
      checkin_date: check_in,
      checkout_date: check_out,
      adults_number: adults,
      room_number: "1",
      units: "metric",
      filter_by_currency: "USD",
      order_by: "popularity",
      locale: "en-gb",
    });

    const hotelResp = await fetch(
      `https://${RAPID_HOST}/v1/hotels/search?${params}`,
      { headers }
    );
    const hotelData = await hotelResp.json();

    const nights = daysBetween(check_in, check_out) || 1;
    const hotels = (hotelData.result ?? []).slice(0, 8).map((h: any) => {
      return {
        name: h.hotel_name ?? "",
        rating: h.review_score ?? 0,
        reviews: h.review_nr ?? 0,
        image: h.max_photo_url ?? "",
        checkin: h.checkin?.from ?? "",
        checkout: h.checkout?.until ?? "",
        amenities: [] as string[],
        stars: h.class ? `${h.class}-star` : "",
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
