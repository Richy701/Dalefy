import { validateQuery, validateDate, requireGoogleApi } from "./_validate.js";
import { rateLimit } from "./_rateLimit.js";
import { searchPlaces } from "./_placesCore.js";
import { errorToHttp } from "./_httpError.js";

export default async function handler(req: any, res: any) {
  if (!rateLimit(req, res, { bucket: "places", limit: 60, windowMs: 60_000 })) return;

  const { type, q, check_in, check_out } = req.query as Record<string, string>;

  if (!type || !["activities", "dining", "hotels"].includes(type)) {
    return res.status(400).json({ error: "type must be activities, dining, or hotels" });
  }

  const err = validateQuery(q)
    || (type === "hotels" ? validateDate(check_in, "check_in") || validateDate(check_out, "check_out") : null);
  if (err) return res.status(400).json({ error: err });

  const key = requireGoogleApi(res);
  if (!key) return;

  try {
    const payload = await searchPlaces(type, q, check_in, check_out, key);
    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600");
    res.json(payload);
  } catch (e) {
    const { status, error } = errorToHttp(e, `Failed to fetch ${type}`);
    res.status(status).json({ error });
  }
}
