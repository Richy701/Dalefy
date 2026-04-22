const RAPID_HOST = "tripadvisor16.p.rapidapi.com";

export default async function handler(req: any, res: any) {
  const { q } = req.query as Record<string, string>;

  if (!q) return res.status(400).json({ error: "Missing param: q" });

  const key = process.env.RAPIDAPI_KEY;
  if (!key) return res.status(500).json({ error: "RAPIDAPI_KEY not configured" });

  const headers = {
    "x-rapidapi-key": key,
    "x-rapidapi-host": RAPID_HOST,
  };

  try {
    // Step 1: resolve location ID
    const locResp = await fetch(
      `https://${RAPID_HOST}/api/v1/restaurant/searchLocation?query=${encodeURIComponent(q)}`,
      { headers }
    );
    const locData = await locResp.json();
    const loc = locData.data?.[0];
    if (!loc) return res.json({ restaurants: [] });

    // Step 2: search restaurants
    const resp = await fetch(
      `https://${RAPID_HOST}/api/v1/restaurant/searchRestaurants?locationId=${loc.locationId}`,
      { headers }
    );
    const data = await resp.json();

    const restaurants = (data.data?.data ?? []).slice(0, 8).map((r: any) => ({
      name: r.name ?? "",
      rating: r.averageRating ?? 0,
      reviews: r.userReviewCount ?? 0,
      image: r.heroImgUrl ?? "",
      address: r.parentGeoName ?? "",
      priceTag: r.priceTag ?? "",
      cuisines: (r.establishmentTypeAndCuisineTags ?? []).slice(0, 3),
      openStatus: r.currentOpenStatusText ?? "",
    }));

    res.json({ restaurants });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch restaurants" });
  }
}
