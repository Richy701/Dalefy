import { validateQuery, requireGoogleApi } from "./_validate.js";

const PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

const ADVANCED_FIELDS = "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.primaryType,places.currentOpeningHours,places.photos,places.priceLevel";
const BASIC_FIELDS = "places.displayName,places.formattedAddress,places.primaryType";

export default async function handler(req: any, res: any) {
  const { q } = req.query as Record<string, string>;

  const err = validateQuery(q);
  if (err) return res.status(400).json({ error: err });

  const key = requireGoogleApi(res);
  if (!key) return;

  const searchPlaces = async (fields: string) => {
    const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": fields,
      },
      body: JSON.stringify({ textQuery: `restaurants in ${q}`, maxResultCount: 8 }),
    });
    return resp.json();
  };

  try {
    let data: any = await searchPlaces(ADVANCED_FIELDS);
    if (data.error) data = await searchPlaces(BASIC_FIELDS);
    if (data.error) return res.json({ restaurants: [] });

    const restaurants = (data.places ?? []).map((r: any) => ({
      name: r.displayName?.text ?? "",
      rating: r.rating ?? 0,
      reviews: r.userRatingCount ?? 0,
      image: r.photos?.[0]?.name
        ? `https://places.googleapis.com/v1/${r.photos[0].name}/media?maxHeightPx=400&maxWidthPx=600&key=${key}`
        : "",
      address: r.formattedAddress ?? "",
      priceTag: PRICE_MAP[r.priceLevel] ?? "",
      cuisines: r.primaryType ? [(r.primaryType as string).replace(/_/g, " ")] : [],
      openStatus: r.currentOpeningHours?.openNow ? "Open" : "",
    }));

    res.json({ restaurants });
  } catch {
    res.status(500).json({ error: "Failed to fetch restaurants" });
  }
}
