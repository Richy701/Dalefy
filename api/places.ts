import { validateQuery, validateDate, requireGoogleApi } from "./_validate.js";

const PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

const STAR_MAP: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: "2-star",
  PRICE_LEVEL_MODERATE: "3-star",
  PRICE_LEVEL_EXPENSIVE: "4-star",
  PRICE_LEVEL_VERY_EXPENSIVE: "5-star",
};

export default async function handler(req: any, res: any) {
  const { type, q, check_in, check_out } = req.query as Record<string, string>;

  if (!type || !["activities", "dining", "hotels"].includes(type)) {
    return res.status(400).json({ error: "type must be activities, dining, or hotels" });
  }

  const err = validateQuery(q)
    || (type === "hotels" ? validateDate(check_in, "check_in") || validateDate(check_out, "check_out") : null);
  if (err) return res.status(400).json({ error: err });

  const key = requireGoogleApi(res);
  if (!key) return;

  const queryMap: Record<string, string> = {
    activities: `things to do in ${q}`,
    dining: `restaurants in ${q}`,
    hotels: `hotels in ${q}`,
  };

  const advancedFields: Record<string, string> = {
    activities: "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.primaryType,places.currentOpeningHours,places.photos",
    dining: "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.primaryType,places.currentOpeningHours,places.photos,places.priceLevel",
    hotels: "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.photos,places.priceLevel",
  };

  const basicFields = "places.displayName,places.formattedAddress,places.primaryType";

  const searchPlaces = async (fields: string) => {
    const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": fields,
      },
      body: JSON.stringify({ textQuery: queryMap[type], maxResultCount: 8 }),
    });
    return resp.json();
  };

  try {
    let data: any = await searchPlaces(advancedFields[type]);
    if (data.error) data = await searchPlaces(basicFields);
    if (data.error) return res.json({ [type === "dining" ? "restaurants" : type]: [] });

    const places = data.places ?? [];

    if (type === "activities") {
      const activities = places.map((a: any) => ({
        name: a.displayName?.text ?? "",
        rating: a.rating ?? 0,
        reviews: a.userRatingCount ?? 0,
        image: a.photos?.[0]?.name
          ? `https://places.googleapis.com/v1/${a.photos[0].name}/media?maxHeightPx=400&maxWidthPx=600&key=${key}`
          : "",
        address: a.formattedAddress ?? "",
        type: (a.primaryType ?? "").replace(/_/g, " "),
        openStatus: a.currentOpeningHours?.openNow ? "Open" : "",
      }));
      return res.json({ activities });
    }

    if (type === "dining") {
      const restaurants = places.map((r: any) => ({
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
      return res.json({ restaurants });
    }

    // hotels
    const hotels = places.map((h: any) => ({
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
    return res.json({ hotels });
  } catch {
    res.status(500).json({ error: `Failed to fetch ${type}` });
  }
}
