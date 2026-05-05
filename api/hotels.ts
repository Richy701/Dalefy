import { validateQuery, validateDate, requireGoogleApi } from "./_validate.js";

const STAR_MAP: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: "2-star",
  PRICE_LEVEL_MODERATE: "3-star",
  PRICE_LEVEL_EXPENSIVE: "4-star",
  PRICE_LEVEL_VERY_EXPENSIVE: "5-star",
};

const ADVANCED_FIELDS = "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.photos,places.priceLevel";
const BASIC_FIELDS = "places.displayName,places.formattedAddress";

export default async function handler(req: any, res: any) {
  const { q, check_in, check_out } = req.query as Record<string, string>;

  const err = validateQuery(q) || validateDate(check_in, "check_in") || validateDate(check_out, "check_out");
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
      body: JSON.stringify({ textQuery: `hotels in ${q}`, maxResultCount: 8 }),
    });
    return resp.json();
  };

  try {
    let data: any = await searchPlaces(ADVANCED_FIELDS);
    if (data.error) data = await searchPlaces(BASIC_FIELDS);
    if (data.error) return res.json({ hotels: [] });

    const hotels = (data.places ?? []).map((h: any) => ({
      name: h.displayName?.text ?? "",
      rating: h.rating ?? 0,
      reviews: h.userRatingCount ?? 0,
      image: h.photos?.[0]?.name
        ? `https://places.googleapis.com/v1/${h.photos[0].name}/media?maxHeightPx=400&maxWidthPx=600&key=${key}`
        : "",
      checkin: check_in,
      checkout: check_out,
      amenities: [] as string[],
      stars: STAR_MAP[h.priceLevel] ?? "",
      address: h.formattedAddress ?? "",
    }));

    res.json({ hotels });
  } catch {
    res.status(500).json({ error: "Failed to fetch hotels" });
  }
}
