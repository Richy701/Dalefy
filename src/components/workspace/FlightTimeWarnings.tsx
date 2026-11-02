import { useEffect, useMemo, useState } from "react";
import { Warning } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { lookupFlight } from "@/services/serpapi";
import { flightCheckKey, flightTimeDiff, needsTimeCheck, pickLiveFlight, type LiveTimes } from "@/lib/flightTimeCheck";
import { parseTripDate } from "@/lib/dates";
import type { TravelEvent } from "@/types";

const CACHE_PREFIX = "daf-flight-check:v1:";
const DISMISSED_KEY = "daf-flight-check-dismissed:v1";
/** Lookups are paid and rate limited, so one trip view never asks twice in this window. */
const CACHE_MS = 12 * 60 * 60 * 1000;
const LOOKUP_GAP_MS = 1200;

function readCache(key: string): LiveTimes[] | null {
  try {
    const entry = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) ?? "null") as { at: number; results: LiveTimes[] } | null;
    return entry && Date.now() - entry.at < CACHE_MS ? entry.results : null;
  } catch {
    return null;
  }
}
function writeCache(key: string, results: LiveTimes[]) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), results })); } catch { /* quota */ }
}
function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[]; } catch { return []; }
}

const show = (t: string) => t || "no time";

/**
 * Flights more than two days out have nothing correcting them, so a wrong saved time would sit there
 * until the day before. This shows the difference and leaves the choice to the organiser: the feed can be wrong too.
 */
export function FlightTimeWarnings({ events, onUseLive }: {
  events: TravelEvent[];
  onUseLive: (ev: TravelEvent, times: { time?: string; endTime?: string }) => void;
}) {
  const [live, setLive] = useState<Record<string, LiveTimes[]>>({});
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  const [now] = useState(() => Date.now());

  const flights = useMemo(() => events.filter(ev => needsTimeCheck(ev, now)), [events, now]);
  const keys = useMemo(() => [...new Set(flights.map(flightCheckKey))].join(","), [flights]);

  useEffect(() => {
    if (!keys) return;
    let cancelled = false;
    (async () => {
      let asked = false;
      for (const key of keys.split(",")) {
        if (cancelled) return;
        const cached = readCache(key);
        if (cached) {
          setLive(prev => ({ ...prev, [key]: cached }));
          continue;
        }
        if (asked) await new Promise(r => setTimeout(r, LOOKUP_GAP_MS));
        if (cancelled) return;
        asked = true;
        const [flightNum, date] = key.split(":");
        try {
          const results: LiveTimes[] = (await lookupFlight(flightNum, date))
            .map(({ departTime, arriveTime, fromCode, toCode }) => ({ departTime, arriveTime, fromCode, toCode }));
          writeCache(key, results);
          if (!cancelled) setLive(prev => ({ ...prev, [key]: results }));
        } catch {
          // Best effort: a failed lookup shows nothing and is tried again next visit
        }
      }
    })();
    return () => { cancelled = true; };
  }, [keys]);

  const rows = flights.flatMap(ev => {
    const results = live[flightCheckKey(ev)];
    const match = results ? pickLiveFlight(ev, results) : null;
    const diff = match ? flightTimeDiff(ev, match) : null;
    if (!diff) return [];
    // A dismissal covers these exact times; if either side moves, the question comes back
    const id = [ev.id, diff.departs?.saved, diff.departs?.live, diff.arrives?.saved, diff.arrives?.live].join("|");
    return dismissed.includes(id) ? [] : [{ ev, diff, id }];
  });
  if (rows.length === 0) return null;

  const keepSaved = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch { /* quota */ }
  };

  return (
    <Alert role="status" className="mb-6 rounded-xl">
      <Warning aria-hidden="true" weight="fill" className="text-amber-700! dark:text-amber-400!" />
      <AlertTitle>{rows.length === 1 ? "A flight time doesn't match the live feed" : `${rows.length} flight times don't match the live feed`}</AlertTitle>
      <AlertDescription>
        <div>The feed can be wrong too, so check the ticket if you're unsure.</div>
        <ul className="mt-2 w-full divide-y divide-border">
          {rows.map(({ ev, diff, id }) => (
            <li key={id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium text-foreground">
                  {ev.flightNum}, {parseTripDate(ev.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                </div>
                {diff.departs && <div>Departs: saved {show(diff.departs.saved)}, live feed {diff.departs.live}</div>}
                {diff.arrives && <div>Arrives: saved {show(diff.arrives.saved)}, live feed {diff.arrives.live}</div>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" onClick={() => onUseLive(ev, { time: diff.departs?.live, endTime: diff.arrives?.live })}>Use live times</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => keepSaved(id)}>Keep saved</Button>
              </div>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
