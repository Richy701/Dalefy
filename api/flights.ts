import { validateIata, validateDate, requireRapidApi } from "./_validate.js";
import { rateLimit } from "./_rateLimit.js";
import { searchFlights } from "./_flightsCore.js";
import { errorToHttp } from "./_httpError.js";

export default async function handler(req: any, res: any) {
  if (!rateLimit(req, res, { bucket: "flights", limit: 40, windowMs: 60_000 })) return;

  const { from, to, date } = req.query as Record<string, string>;

  const err = validateIata(from, "from") || validateIata(to, "to") || validateDate(date, "date");
  if (err) return res.status(400).json({ error: err });

  const key = requireRapidApi(res);
  if (!key) return;

  try {
    const payload = await searchFlights(from, to, date, key);
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120");
    res.json(payload);
  } catch (e) {
    const { status, error } = errorToHttp(e, "Failed to fetch from AeroDataBox");
    res.status(status).json({ error });
  }
}
