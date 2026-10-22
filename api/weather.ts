import { rateLimit } from "./_rateLimit.js";
import { currentWeather, dayForecast, validateWeatherQuery } from "./_weatherCore.js";
import { errorToHttp } from "./_httpError.js";

/**
 * GET /api/weather?lat=&lng=            current conditions
 * GET /api/weather?lat=&lng=&date=      that day's forecast (up to 5 days out)
 * Response: { weather } / { forecast }, null when unavailable.
 */
export default async function handler(req: any, res: any) {
  if (!rateLimit(req, res, { bucket: "weather", limit: 120, windowMs: 60_000 })) return;

  const { lat = "", lng = "", date = "" } = req.query as Record<string, string>;
  const err = validateWeatherQuery(lat, lng, date);
  if (err) return res.status(400).json({ error: err });

  const key = process.env.OPENWEATHER_KEY;
  if (!key) return res.status(500).json({ error: "OPENWEATHER_KEY not configured" });

  try {
    const payload = date
      ? { forecast: await dayForecast(Number(lat), Number(lng), date, key) }
      : { weather: await currentWeather(Number(lat), Number(lng), key) };
    // Callers round coordinates, so nearby requests share the CDN copy
    res.setHeader("Cache-Control", date ? "public, max-age=1800, s-maxage=3600" : "public, max-age=600, s-maxage=900");
    res.json(payload);
  } catch (e) {
    const { status, error } = errorToHttp(e, "Failed to fetch weather");
    res.status(status).json({ error });
  }
}
