import { useMemo, useState } from "react";
import { ArrowClockwise, Images, Shuffle, SpinnerGap } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildImageQueryCandidates } from "@/services/imageQuery";
import { searchImages, searchImagesProgressive } from "@/services/imageSearch";
import { sortEvents } from "@/lib/sortEvents";
import { parseTripDate } from "@/lib/dates";
import type { Trip, TravelEvent } from "@/types";

const PER_PAGE = 8;

interface Options { urls: string[]; query?: string; page: number; loading: boolean; failed?: boolean }

/**
 * Every event's photo on one screen. Repeats and missing photos come first; options are only searched
 * when asked for (the image search has a monthly allowance), and nothing is saved until Save.
 */
export function EventPhotosDialog({ trip, open, onOpenChange, onSave }: {
  trip: Trip;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (images: Record<string, string>) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, Options>>({});
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [fixing, setFixing] = useState(false);

  const events = useMemo(() => sortEvents(trip.events), [trip.events]);
  const current = (ev: TravelEvent) => picked[ev.id] ?? ev.image ?? "";
  const counts = new Map<string, number>();
  for (const ev of events) { const u = current(ev); if (u) counts.set(u, (counts.get(u) ?? 0) + 1); }
  const flag = (ev: TravelEvent) => { const u = current(ev); return !u ? "No photo" : (counts.get(u) ?? 0) > 1 ? `Same as ${(counts.get(u) ?? 1) - 1} other${(counts.get(u) ?? 1) > 2 ? "s" : ""}` : null; };
  const flagged = events.filter(ev => flag(ev));
  const shown = onlyFlagged ? flagged : events;
  const changes = Object.keys(picked).filter(id => picked[id] !== events.find(e => e.id === id)?.image).length;

  const load = async (ev: TravelEvent, more = false): Promise<string[]> => {
    const prev = options[ev.id];
    setOptions(o => ({ ...o, [ev.id]: { urls: prev?.urls ?? [], query: prev?.query, page: prev?.page ?? 0, loading: true } }));
    let next: Options;
    if (more && prev?.query) {
      const { urls } = await searchImages(prev.query, prev.page + 1, PER_PAGE);
      next = { urls: [...new Set([...prev.urls, ...urls])], query: prev.query, page: prev.page + 1, loading: false };
    } else {
      const { urls, matchedQuery } = await searchImagesProgressive(buildImageQueryCandidates({ title: ev.title, location: ev.location, type: ev.type }), PER_PAGE);
      next = { urls, query: matchedQuery, page: 1, loading: false, failed: urls.length === 0 };
    }
    setOptions(o => ({ ...o, [ev.id]: next }));
    return next.urls;
  };

  // Each flagged event takes the first option no other event on the trip is using
  const fixRepeats = async () => {
    setFixing(true);
    const taken = new Set(events.map(current).filter(Boolean));
    const next: Record<string, string> = {};
    const queue = [...flagged];
    const worker = async () => {
      for (let ev = queue.shift(); ev; ev = queue.shift()) {
        const urls = options[ev.id]?.urls.length ? options[ev.id].urls : await load(ev);
        const fresh = urls.find(u => !taken.has(u));
        if (fresh) { taken.add(fresh); next[ev.id] = fresh; }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setPicked(p => ({ ...p, ...next }));
    setFixing(false);
  };

  const close = (o: boolean) => { if (!o) { setPicked({}); setOptions({}); } onOpenChange(o); };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent initialFocus={false} className="max-w-4xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] flex flex-col gap-0 p-0 bg-card rounded-xl border border-border shadow-2xl overflow-hidden">
        <DialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-border text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">Event photos</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">Pick a photo for each event. Nothing changes on the trip until you save.</DialogDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg bg-secondary p-0.5 text-xs font-medium">
              {[[true, `Needs a photo (${flagged.length})`], [false, `All events (${events.length})`]].map(([value, label]) => (
                <button key={String(value)} type="button" onClick={() => setOnlyFlagged(value as boolean)}
                  className={`h-7 px-3 rounded-md transition-colors ${onlyFlagged === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {label as string}
                </button>
              ))}
            </div>
            {flagged.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={fixRepeats} disabled={fixing} className="ml-auto">
                {fixing ? <SpinnerGap className="animate-spin" /> : <Shuffle />} {fixing ? "Finding photos…" : `Fix ${flagged.length} for me`}
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {shown.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-medium text-foreground">Every event has its own photo</p>
              <p className="text-xs text-muted-foreground mt-1">Switch to All events to change any of them.</p>
            </div>
          ) : shown.map(ev => {
            const url = current(ev);
            const note = flag(ev);
            const opts = options[ev.id];
            return (
              <div key={ev.id} className="px-5 sm:px-6 py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
                <div className="flex items-center gap-3 md:w-72 shrink-0 min-w-0">
                  <div className="h-14 w-20 shrink-0 rounded-lg bg-secondary overflow-hidden flex items-center justify-center">
                    {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <Images className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground tabular-nums">{parseTripDate(ev.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}{ev.time ? `, ${ev.time}` : ""}</p>
                    <p className="text-sm font-medium text-foreground truncate">{ev.title || "Untitled"}</p>
                    {note && <p className="text-[11px] text-amber-600 dark:text-amber-400">{note}</p>}
                    {picked[ev.id] && picked[ev.id] !== ev.image && <p className="text-[11px] text-link">New photo picked</p>}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  {!opts ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => load(ev)}>
                      <Images /> Find photos
                    </Button>
                  ) : opts.failed && !opts.loading ? (
                    <p className="text-xs text-muted-foreground">No photos found for this event. Try Edit event to search with your own words.</p>
                  ) : (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {opts.urls.map(u => (
                        <button key={u} type="button" onClick={() => setPicked(p => ({ ...p, [ev.id]: u }))} aria-label="Use this photo"
                          className={`h-14 w-20 shrink-0 rounded-lg overflow-hidden ring-2 transition ${u === url ? "ring-foreground" : "ring-transparent hover:ring-border"}`}>
                          <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
                        </button>
                      ))}
                      <button type="button" onClick={() => load(ev, true)} disabled={opts.loading}
                        className="h-14 w-20 shrink-0 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary flex flex-col items-center justify-center gap-1 transition-colors">
                        {opts.loading ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <ArrowClockwise className="h-4 w-4" />}
                        {opts.loading ? "Loading" : "More"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="px-5 sm:px-6 py-4 border-t border-border flex flex-row items-center gap-3">
          <p className="mr-auto text-xs text-muted-foreground">{changes ? `${changes} ${changes === 1 ? "photo" : "photos"} to save` : "No changes yet"}</p>
          <Button type="button" variant="ghost" onClick={() => close(false)}>Cancel</Button>
          <Button type="button" disabled={!changes} onClick={() => { onSave(Object.fromEntries(Object.entries(picked).filter(([id, u]) => u !== events.find(e => e.id === id)?.image))); close(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
