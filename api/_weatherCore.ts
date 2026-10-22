/**
 * Shared core for weather (OpenWeather, key kept server-side). Imported by
 * BOTH api/weather.ts (Vercel) and vite.config.ts (local dev) so response
 * shapes can never drift. Callers send coordinates, never place names.
 *
 * Responses use a provider-neutral `condition`, so the app's icons don't
 * depend on OpenWeather's codes and the provider can change behind this file.
 */
import { HttpError } from "./_httpError.js";

export type Condition = "clear" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "storm";
export interface CurrentWeather { temp: number; condition: Condition; isDay: boolean; description: string }
export interface DayForecast { temp: number; high: number; low: number; condition: Condition; description: string; rainChance: number }

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** OpenWeather icon codes ("01d", "10n"): 01 clear, 02 few clouds, 03/04 clouds, 09/10 rain, 11 storm, 13 snow, 50 mist */
function condition(icon: string | undefined): Condition {
  switch ((icon ?? "").slice(0, 2)) {
    case "01": return "clear";
    case "02": return "partly";
    case "09": case "10": return "rain";
    case "11": return "storm";
    case "13": return "snow";
    case "50": return "fog";
    default: return "cloudy";
  }
}

async function owFetch(path: string, lat: number, lng: number, key: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let resp: Response;
  try {
    resp = await fetch(`https://api.openweathermap.org/data/2.5/${path}?lat=${lat}&lon=${lng}&units=metric&appid=${key}`, { signal: controller.signal });
  } catch {
    throw new HttpError(502, "Failed to fetch weather");
  } finally {
    clearTimeout(timeout);
  }
  if (!resp.ok) throw new HttpError(502, "Weather service error");
  return resp.json();
}

export async function currentWeather(lat: number, lng: number, key: string): Promise<CurrentWeather | null> {
  const json = await owFetch("weather", lat, lng, key);
  const w = json?.weather?.[0];
  if (typeof json?.main?.temp !== "number" || !w) return null;
  return {
    temp: Math.round(json.main.temp),
    condition: condition(w.icon),
    isDay: !String(w.icon ?? "").endsWith("n"),
    description: w.description ?? "",
  };
}

/** One day's forecast (local date at the place, up to 5 days out); null when the date isn't covered */
export async function dayForecast(lat: number, lng: number, date: string, key: string): Promise<DayForecast | null> {
  const json = await owFetch("forecast", lat, lng, key);
  const offset = Number(json?.city?.timezone ?? 0); // seconds from UTC
  const localDate = (dt: number) => new Date((dt + offset) * 1000).toISOString().slice(0, 10);
  const localHour = (dt: number) => new Date((dt + offset) * 1000).getUTCHours();
  const entries = (json?.list ?? []).filter((e: any) => typeof e?.dt === "number" && localDate(e.dt) === date);
  if (!entries.length) return null;
  const midday = [...entries].sort((a: any, b: any) => Math.abs(localHour(a.dt) - 12) - Math.abs(localHour(b.dt) - 12))[0];
  return {
    temp: Math.round(midday.main.temp),
    high: Math.round(Math.max(...entries.map((e: any) => e.main.temp_max))),
    low: Math.round(Math.min(...entries.map((e: any) => e.main.temp_min))),
    condition: condition(midday.weather?.[0]?.icon),
    description: midday.weather?.[0]?.description ?? "",
    rainChance: Math.round(Math.max(...entries.map((e: any) => (e.pop ?? 0) * 100))),
  };
}

/** Validates query params; returns an error message or null */
export function validateWeatherQuery(lat: string, lng: string, date: string): string | null {
  const la = Number(lat), ln = Number(lng);
  if (!lat || !lng || !Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return "lat and lng required";
  if (date && !DATE_RE.test(date)) return "date must be YYYY-MM-DD";
  return null;
}
