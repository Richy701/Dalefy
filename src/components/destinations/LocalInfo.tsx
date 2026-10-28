import { useEffect, useMemo, useState } from "react";
import { Clock, CurrencyCircleDollar, Plug, ThermometerSimple } from "@phosphor-icons/react";
import { parseTripDate } from "@/lib/dates";
import { ReportCard, EmptyNote } from "@/components/reports/ReportParts";
import { shortDate } from "@/components/reports/format";
import type { Trip } from "@/types";
import { localFactsFor, localTime } from "./localFacts";

interface Weather { temp: number; description: string }
interface Forecast { high: number; low: number; description: string; rainChance: number }

export interface UpcomingPlace { trip: Trip; destination: string; country: string | null; lngLat?: [number, number] }

const FORECAST_DAYS = 5;

/** Weather now and on arrival (once it's within the forecast), local time, money and plugs */
function PlaceCard({ place, now }: { place: UpcomingPlace; now: Date }) {
  // What the organiser typed wins: the page's own label can be an airport code like "BGI", which the geocoder misplaces
  const label = place.trip.destination?.trim() || place.destination;
  const facts = localFactsFor([place.trip.destination, place.destination, place.trip.name].filter(Boolean).join(" "), place.country);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const daysOut = Math.round((parseTripDate(place.trip.start).getTime() - now.getTime()) / 86_400_000);

  useEffect(() => {
    if (!place.lngLat) return;
    let cancelled = false;
    // Rounded so nearby lookups share the cached copy
    const q = `lat=${place.lngLat[1].toFixed(2)}&lng=${place.lngLat[0].toFixed(2)}`;
    fetch(`/api/weather?${q}`).then(r => (r.ok ? r.json() : null)).then(j => { if (!cancelled && j?.weather) setWeather(j.weather); }).catch(() => {});
    if (daysOut >= 0 && daysOut <= FORECAST_DAYS) {
      fetch(`/api/weather?${q}&date=${place.trip.start}`).then(r => (r.ok ? r.json() : null)).then(j => { if (!cancelled && j?.forecast) setForecast(j.forecast); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [place.lngLat, place.trip.start, daysOut]);

  return (
    <li className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-foreground truncate">{label}</p>
        <p className="text-xs text-muted-foreground shrink-0">{daysOut > 0 ? `Departs ${shortDate(place.trip.start)}` : "On now"}</p>
      </div>
      <p className="text-xs text-muted-foreground truncate">{place.trip.name}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
        <div className="flex items-start gap-2 min-w-0">
          <ThermometerSimple className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <dt className="text-muted-foreground">Weather</dt>
            <dd className="text-foreground truncate">
              {forecast ? `${forecast.high}° / ${forecast.low}° on arrival, ${forecast.rainChance}% rain`
                : weather ? `${Math.round(weather.temp)}° now, ${weather.description}`
                : place.lngLat ? "Loading" : "No location yet"}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2 min-w-0">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <dt className="text-muted-foreground">Local time</dt>
            <dd className="text-foreground tabular-nums">{facts ? localTime(facts.timeZone, now) : "Unknown"}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2 min-w-0">
          <CurrencyCircleDollar className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <dt className="text-muted-foreground">Currency</dt>
            <dd className="text-foreground">{facts?.currency ?? "Unknown"}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2 min-w-0">
          <Plug className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <dt className="text-muted-foreground">Plugs</dt>
            <dd className="text-foreground">{facts ? `Type ${facts.plugs}` : "Unknown"}</dd>
          </div>
        </div>
      </dl>
    </li>
  );
}

/** Local info for the next few places groups are going */
export function LocalInfo({ places }: { places: UpcomingPlace[] }) {
  const [now] = useState(() => new Date());
  const next = useMemo(() => places.slice(0, 4), [places]);
  return (
    <ReportCard title="Local info" sub="For the next trips out: weather, local time, money and plugs">
      {next.length === 0 ? <EmptyNote>No upcoming trips.</EmptyNote> : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {next.map(p => <PlaceCard key={p.trip.id} place={p} now={now} />)}
        </ul>
      )}
    </ReportCard>
  );
}
