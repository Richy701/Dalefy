import { validateQuery, requireRapidApi } from "./_validate";

const RAPID_HOST = "local-business-data.p.rapidapi.com";

export default async function handler(req: any, res: any) {
  const { q } = req.query as Record<string, string>;

  const err = validateQuery(q);
  if (err) return res.status(400).json({ error: err });

  const key = requireRapidApi(res);
  if (!key) return;

  try {
    const params = new URLSearchParams({
      query: `things to do in ${q}`,
      limit: "8",
    });

    const resp = await fetch(`https://${RAPID_HOST}/search?${params}`, {
      headers: {
        "x-rapidapi-key": key,
        "x-rapidapi-host": RAPID_HOST,
      },
    });
    const data = await resp.json();

    const activities = (data.data ?? []).slice(0, 8).map((a: any) => ({
      name: a.name ?? "",
      rating: a.rating ?? 0,
      reviews: a.review_count ?? 0,
      image: a.photos_sample?.[0]?.photo_url_large ?? "",
      address: a.full_address ?? "",
      type: a.type ?? "",
      openStatus: a.opening_status ?? "",
    }));

    res.json({ activities });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch activities" });
  }
}
