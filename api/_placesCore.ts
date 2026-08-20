/**
 * Shared core for Google Places text search (activities / dining / hotels).
 * Imported by BOTH api/places.ts (Vercel) and vite.config.ts (local dev) so
 * response shapes can never drift.
 */
import { HttpError } from "./_httpError.js";

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

const ADVANCED_FIELDS: Record<string, string> = {
  activities: "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.primaryType,places.currentOpeningHours,places.photos",
  dining: "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.primaryType,places.currentOpeningHours,places.photos,places.priceLevel",
  hotels: "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.photos,places.priceLevel",
};

const BASIC_FIELDS = "places.displayName,places.formattedAddress,places.primaryType";

export async function searchPlaces(
  type: string,
  q: string,
  check_in: string | undefined,
  check_out: string | undefined,
  key: string,
): Promise<Record<string, any[]>> {
  const queryMap: Record<string, string> = {
    activities: `things to do in ${q}`,
    dining: `restaurants in ${q}`,
    hotels: `hotels in ${q}`,
  };

  const searchText = async (fields: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": fields,
        },
        body: JSON.stringify({ textQuery: queryMap[type], maxResultCount: 8 }),
        signal: controller.signal,
      });
      return resp.json();
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    let data: any = await searchText(ADVANCED_FIELDS[type]);
    if (data.error) data = await searchText(BASIC_FIELDS);
    if (data.error) return { [type === "dining" ? "restaurants" : type]: [] };

    const places = data.places ?? [];

    const photoUrl = (photoName: string) =>
      `/api/image-proxy?photo=${encodeURIComponent(photoName)}`;

    if (type === "activities") {
      const activities = places.map((a: any) => ({
        name: a.displayName?.text ?? "",
        rating: a.rating ?? 0,
        reviews: a.userRatingCount ?? 0,
        image: a.photos?.[0]?.name ? photoUrl(a.photos[0].name) : "",
        address: a.formattedAddress ?? "",
        type: (a.primaryType ?? "").replace(/_/g, " "),
        openStatus: a.currentOpeningHours?.openNow ? "Open" : "",
      }));
      return { activities };
    }

    if (type === "dining") {
      const restaurants = places.map((r: any) => ({
        name: r.displayName?.text ?? "",
        rating: r.rating ?? 0,
        reviews: r.userRatingCount ?? 0,
        image: r.photos?.[0]?.name ? photoUrl(r.photos[0].name) : "",
        address: r.formattedAddress ?? "",
        priceTag: PRICE_MAP[r.priceLevel] ?? "",
        cuisines: r.primaryType ? [(r.primaryType as string).replace(/_/g, " ")] : [],
        openStatus: r.currentOpeningHours?.openNow ? "Open" : "",
      }));
      return { restaurants };
    }

    // hotels
    const hotels = places.map((h: any) => ({
      name: h.displayName?.text ?? "",
      rating: h.rating ?? 0,
      reviews: h.userRatingCount ?? 0,
      image: h.photos?.[0]?.name ? photoUrl(h.photos[0].name) : "",
      checkin: check_in,
      checkout: check_out,
      amenities: [] as string[],
      stars: STAR_MAP[h.priceLevel] ?? "",
      address: h.formattedAddress ?? "",
    }));
    return { hotels };
  } catch {
    throw new HttpError(500, `Failed to fetch ${type}`);
  }
}
