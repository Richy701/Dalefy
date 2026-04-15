export default async function handler(req: any, res: any) {
  const { q, check_in, check_out, adults = "2" } = req.query as Record<string, string>;

  if (!q || !check_in || !check_out) {
    return res.status(400).json({ error: "Missing params: q, check_in, check_out" });
  }

  const key = process.env.SERPAPI_KEY;
  if (!key) return res.status(500).json({ error: "SERPAPI_KEY not configured" });

  const params = new URLSearchParams({
    engine: "google_hotels",
    q,
    check_in_date: check_in,
    check_out_date: check_out,
    adults,
    currency: "USD",
    api_key: key,
  });

  try {
    const resp = await fetch(`https://serpapi.com/search?${params}`);
    const data = await resp.json();

    const hotels = (data.properties ?? []).slice(0, 8).map((h: any) => ({
      name: h.name ?? "",
      rating: h.overall_rating ?? 0,
      reviews: h.reviews ?? 0,
      pricePerNight: h.rate_per_night?.lowest ?? "",
      image: h.images?.[0]?.thumbnail ?? "",
      checkin: h.check_in_time ?? "",
      checkout: h.check_out_time ?? "",
      amenities: (h.amenities ?? []).slice(0, 4) as string[],
      stars: h.hotel_class ?? "",
    }));

    res.json({ hotels });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch from SerpApi" });
  }
}
