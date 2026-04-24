import { validateQuery, requireRapidApi } from "./_validate.js";

const RAPID_HOST = "local-business-data.p.rapidapi.com";

export default async function handler(req: any, res: any) {
  const { q } = req.query as Record<string, string>;

  const err = validateQuery(q);
  if (err) return res.status(400).json({ error: err });

  const key = requireRapidApi(res);
  if (!key) return;

  try {
    const params = new URLSearchParams({
      query: `restaurants in ${q}`,
      limit: "8",
    });

    const resp = await fetch(`https://${RAPID_HOST}/search?${params}`, {
      headers: {
        "x-rapidapi-key": key,
        "x-rapidapi-host": RAPID_HOST,
      },
    });
    const data = await resp.json();

    const restaurants = (data.data ?? []).slice(0, 8).map((r: any) => ({
      name: r.name ?? "",
      rating: r.rating ?? 0,
      reviews: r.review_count ?? 0,
      image: r.photos_sample?.[0]?.photo_url_large ?? "",
      address: r.full_address ?? "",
      priceTag: r.price_level ?? "",
      cuisines: r.type ? [r.type] : [],
      openStatus: r.opening_status ?? "",
    }));

    res.json({ restaurants });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch restaurants" });
  }
}
