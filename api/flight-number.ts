import { validateFlightNum, validateDate, requireRapidApi } from "./_validate.js";
import type { ApiRequest, ApiResponse } from "./_rateLimit.js";
import { allowFlightLookup, sharedLookup, lookupCacheControl } from "./_flightAccess.js";
import { lookupFlightNumber } from "./_flightsCore.js";
import { errorToHttp } from "./_httpError.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const access = await allowFlightLookup(req, res, "flight-number");
  if (!access) return;

  const { number, date } = req.query as Record<string, string>;

  const err = validateFlightNum(number) || validateDate(date, "date");
  if (err) return res.status(400).json({ error: err });

  const key = requireRapidApi(res);
  if (!key) return;

  try {
    const payload = await sharedLookup(`number:${number.replace(/\s+/g, "").toUpperCase()}:${date}`, () => lookupFlightNumber(number, date, key));
    res.setHeader("Cache-Control", lookupCacheControl(access.signedIn));
    res.json(payload);
  } catch (e) {
    const { status, error } = errorToHttp(e, "Failed to fetch from AeroDataBox");
    res.status(status).json({ error });
  }
}
