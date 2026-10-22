/**
 * Weather through our own /api/weather, which holds the provider key server-side.
 * Callers pass the coordinates the map already resolved (the hotel, a stop, the
 * destination), so multi-city names like "Chiang Mai & Phuket" never need a lookup.
 */

const API_BASE = (process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app").replace(/\/$/, "");

export type Condition = "clear" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "storm";
export interface Weather { temp: number; condition: Condition; isDay: boolean; description: string }
export interface DayForecast { temp: number; high: number; low: number; condition: Condition; description: string; rainChance: number }

/** Two decimals (about 1 km) is plenty for weather and lets nearby requests share the server's cache */
const q = ([lng, lat]: [number, number]) => `lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}`;

/** Current conditions at [lng, lat] */
export async function fetchCurrentWeather(coord: [number, number]): Promise<Weather | null> {
  try {
    const res = await fetch(`${API_BASE}/api/weather?${q(coord)}`);
    if (!res.ok) return null;
    return (await res.json())?.weather ?? null;
  } catch {
    return null;
  }
}

/** One day's forecast at [lng, lat], date YYYY-MM-DD at the place (up to 5 days out) */
export async function fetchDayForecast(coord: [number, number], date: string): Promise<DayForecast | null> {
  try {
    const res = await fetch(`${API_BASE}/api/weather?${q(coord)}&date=${date}`);
    if (!res.ok) return null;
    return (await res.json())?.forecast ?? null;
  } catch {
    return null;
  }
}
