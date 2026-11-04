import { useMemo, useState } from "react";
import { Bed, AirplaneTilt, Hash, MagnifyingGlass, ClipboardText } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { bookableEvents, cleanTravelerRefs, connectingLegs, parseRefsPaste, peopleOnEvent, type RefPasteProblem, type RefPasteResult } from "@/lib/bookingRefs";
import { sortEvents } from "@/lib/sortEvents";
import type { TravelEvent } from "@/types";

interface Person { id: string; name: string; initials: string; avatar?: string }
type Drafts = Record<string, Record<string, string>>;
/** The references that changed, by event id. Undefined means the event no longer has any. */
export type BookingRefChanges = Record<string, Record<string, string> | undefined>;

const PROBLEMS: Record<RefPasteProblem, string> = {
  person: "No traveller with that name",
  event: "No flight or event with that name",
  "not-on-event": "This traveller isn't on that event",
  ambiguous: "More than one match",
  format: "Needs person, flight and reference",
};

const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const legName = (e: TravelEvent) => e.flightNum?.trim() || e.title;
const EventIcon = ({ type }: { type: TravelEvent["type"] }) => {
  const Icon = type === "flight" ? AirplaneTilt : type === "hotel" ? Bed : Hash;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;
};

/** Everyone's booking references on one screen, grouped by person, instead of one event dialog at a time */
export function BookingRefsDialog({ events, travellers, saving, onClose, onSave }: {
  events: TravelEvent[];
  travellers: Person[];
  saving: boolean;
  onClose: () => void;
  onSave: (changes: BookingRefChanges) => Promise<boolean>;
}) {
  const bookable = useMemo(() => sortEvents(bookableEvents(events)), [events]);
  const [saved] = useState<Drafts>(() => Object.fromEntries(bookable.map(e => [e.id, e.travelerRefs ?? {}])));
  const [drafts, setDrafts] = useState<Drafts>(saved);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteResult, setPasteResult] = useState<RefPasteResult | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const setRef = (eventId: string, personId: string, ref: string) =>
    setDrafts(prev => ({ ...prev, [eventId]: { ...prev[eventId], [personId]: ref } }));

  const people = useMemo(() => travellers.map(person => ({
    person,
    items: bookable.filter(e => peopleOnEvent(e, [person]).length > 0),
  })).filter(row => row.items.length > 0), [travellers, bookable]);

  const changes = useMemo(() => {
    const out: BookingRefChanges = {};
    for (const e of bookable) {
      const next = cleanTravelerRefs({ assignedTo: e.assignedTo, travelerRefs: drafts[e.id] }, travellers);
      const before = cleanTravelerRefs({ assignedTo: e.assignedTo, travelerRefs: saved[e.id] }, travellers);
      const sorted = (refs?: Record<string, string>) => JSON.stringify(Object.entries(refs ?? {}).sort(([a], [b]) => a.localeCompare(b)));
      if (sorted(next) !== sorted(before)) out[e.id] = next;
    }
    return out;
  }, [bookable, drafts, saved, travellers]);
  const dirty = Object.keys(changes).length > 0;

  const own = (e: TravelEvent, personId: string) => drafts[e.id]?.[personId]?.trim() || "";
  const missing = (items: TravelEvent[], personId: string) => items.filter(e => !own(e, personId) && !e.confNumber?.trim()).length;
  const totalMissing = people.reduce((sum, row) => sum + missing(row.items, row.person.id), 0);
  const query = search.trim().toLowerCase();
  const shown = query ? people.filter(row => row.person.name.toLowerCase().includes(query)) : people;

  const applyPaste = () => {
    const result = parseRefsPaste(pasteText, bookable, travellers);
    setDrafts(prev => {
      const next = { ...prev };
      for (const { eventId, travellerId, ref } of result.filled) next[eventId] = { ...next[eventId], [travellerId]: ref };
      return next;
    });
    setPasteResult(result);
    setPasteText("");
  };

  const close = () => { if (dirty) setDiscardOpen(true); else onClose(); };

  return (
    <>
      <Dialog open onOpenChange={open => { if (!open) close(); }}>
        <DialogContent className="dialog-mobile-full flex flex-col gap-0 border-0 bg-card p-0 overflow-hidden sm:w-[calc(100vw-2rem)] max-sm:max-h-none sm:max-w-2xl sm:h-auto sm:max-h-[85vh] sm:rounded-xl sm:border sm:border-border">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground">Booking references</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {totalMissing > 0 ? `${totalMissing} still missing. ` : "Nothing missing. "}Each traveller only ever sees their own.
            </DialogDescription>
            <div className="flex items-center gap-2 pt-2">
              <div className="relative flex-1 min-w-0">
                <MagnifyingGlass className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a traveller" aria-label="Find a traveller" className="h-9 pl-8 text-sm bg-background border-border" />
              </div>
              <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" aria-expanded={pasteOpen} onClick={() => { setPasteOpen(v => !v); setPasteResult(null); }}>
                <ClipboardText /> Paste from Excel
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {pasteOpen && (
              <div className="space-y-2 border-b border-border bg-secondary/50 px-5 py-4">
                <Label htmlFor="refs-paste" className="text-xs font-medium text-foreground">Three columns: person, flight number or event name, reference</Label>
                <Textarea id="refs-paste" value={pasteText} onChange={e => setPasteText(e.target.value)} rows={4} autoComplete="off" spellCheck={false} placeholder={"Laura Davies\tQR22\tZK91LM\nTom Reid\tEK18\tQR7X2P"} className="font-mono text-xs bg-background border-border" />
                <div className="flex justify-end">
                  <Button type="button" size="sm" disabled={!pasteText.trim()} onClick={applyPaste}>Fill in references</Button>
                </div>
                {pasteResult && (
                  <div className="space-y-1 text-xs" role="status">
                    <p className="font-medium text-foreground">{pasteResult.filled.length} filled in below. Check them, then save.</p>
                    {pasteResult.skipped.length > 0 && <p className="font-medium text-amber-700 dark:text-amber-400">{pasteResult.skipped.length} left out:</p>}
                    {pasteResult.skipped.map(({ line, problem }, i) => (
                      <p key={i} className="text-muted-foreground break-words"><span className="text-foreground">{line.replace(/\t/g, ", ")}</span>: {PROBLEMS[problem]}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {shown.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                {query ? "No traveller by that name" : "Add travellers and flights or hotels first"}
              </p>
            )}

            {shown.map(({ person, items }) => {
              const flights = items.filter(e => e.type === "flight");
              const gaps = missing(items, person.id);
              return (
                <section key={person.id} aria-label={person.name} className="border-b border-border px-5 py-4 last:border-b-0">
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <PersonAvatar avatar={person.avatar} initials={person.initials} name={person.name} className="h-7 w-7 shrink-0" fallbackClassName="text-[9px] font-black" />
                    <h4 className="flex-1 min-w-0 truncate text-sm font-semibold text-foreground">{person.name}</h4>
                    {gaps > 0 && <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-400">{gaps} missing</span>}
                  </div>
                  <div className="space-y-2">
                    {items.map(e => {
                      const cell = `${person.id}:${e.id}`;
                      const value = drafts[e.id]?.[person.id] ?? "";
                      const legs = e.type === "flight" && value.trim() && focused !== cell
                        ? connectingLegs(flights, e.id).filter(leg => !own(leg, person.id)) : [];
                      const route = [e.depAirport, e.arrAirport].filter(Boolean).join(" to ");
                      return (
                        <div key={e.id}>
                          <div className="flex items-center gap-2.5">
                            <EventIcon type={e.type} />
                            <Label htmlFor={`refs-${cell}`} className="block flex-1 min-w-0 font-normal">
                              <span className="block truncate text-xs font-medium text-foreground">{e.flightNum?.trim() ? `${e.flightNum.trim()}${route ? `, ${route}` : ""}` : e.title}</span>
                              <span className="block text-[11px] text-muted-foreground tabular-nums">{shortDate(e.date)}</span>
                            </Label>
                            <Input
                              id={`refs-${cell}`}
                              value={value}
                              onChange={ev => setRef(e.id, person.id, ev.target.value)}
                              onFocus={() => setFocused(cell)}
                              onBlur={() => setFocused(null)}
                              placeholder={e.confNumber?.trim() ? `Uses ${e.confNumber.trim()}` : "No reference"}
                              autoComplete="off"
                              spellCheck={false}
                              className="h-9 w-32 sm:w-40 shrink-0 text-sm font-semibold bg-background border-border text-foreground"
                            />
                          </div>
                          {legs.length > 0 && (
                            <div className="mt-1 text-right">
                              <Button
                                type="button"
                                variant="link"
                                size="xs"
                                className="h-auto px-0 text-xs font-medium text-foreground underline"
                                onClick={() => legs.forEach(leg => setRef(leg.id, person.id, value.trim()))}
                              >
                                Also use on {legs.map(legName).join(", ")}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="ghost" size="sm" onClick={close}>Cancel</Button>
            <Button type="button" size="sm" disabled={!dirty || saving} onClick={async () => { if (await onSave(changes)) onClose(); }}>Save references</Button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard changes?"
        description="The references you entered here will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={onClose}
      />
    </>
  );
}
