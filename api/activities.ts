import { validateQuery, requireGoogleApi } from "./_validate.js";

const ADVANCED_FIELDS = "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.primaryType,places.currentOpeningHours,places.photos";
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
      body: JSON.stringify({ textQuery: `things to do in ${q}`, maxResultCount: 8 }),
    });
    return resp.json();
  };

  try {
    let data: any = await searchPlaces(ADVANCED_FIELDS);
    if (data.error) data = await searchPlaces(BASIC_FIELDS);
    if (data.error) return res.json({ activities: [] });

    const activities = (data.places ?? []).map((a: any) => ({
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

    res.json({ activities });
  } catch {
    res.status(500).json({ error: "Failed to fetch activities" });
  }
}
