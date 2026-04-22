import { validateQuery, requireRapidApi } from "./_validate.js";

const RAPID_HOST = "tripadvisor16.p.rapidapi.com";

export default async function handler(req: any, res: any) {
  const { q } = req.query as Record<string, string>;

  const err = validateQuery(q);
  if (err) return res.status(400).json({ error: err });

  const key = requireRapidApi(res);
  if (!key) return;

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
