import { useMemo, useRef, useState } from "react";
import { Bed, AirplaneTilt, Hash, MagnifyingGlass, ClipboardText, Image as ImageIcon, SpinnerGap } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { AirlineMark } from "@/components/shared/AirlineMark";
import { bookableEvents, cleanTravelerRefs, connectingLegs, flightNumberOf, matchBookingRows, parseBookingTable, parseRefsPaste, peopleOnEvent, type BookingFill, type BookingMatch, type BookingRow, type RefPasteProblem, type RefPasteResult } from "@/lib/bookingRefs";
import { readBookingPictures } from "@/services/readBookings";
import { sortEvents } from "@/lib/sortEvents";
import type { TravelEvent } from "@/types";

interface Person { id: string; name: string; initials: string; avatar?: string }
type Drafts = Record<string, Record<string, string>>;
const FIELDS = ["travelerRefs", "travelerSeats", "travelerTickets"] as const;
type Field = typeof FIELDS[number];
type AllDrafts = Record<Field, Drafts>;
/** What's now saved on each changed event. A missing field means the event no longer has any. */
export type BookingRefChanges = Record<string, Partial<Record<Field, Record<string, string>>>>;

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
  const [saved] = useState<AllDrafts>(() => Object.fromEntries(FIELDS.map(field => [field, Object.fromEntries(bookable.map(e => [e.id, e[field] ?? {}]))])) as AllDrafts);
  const [allDrafts, setAllDrafts] = useState<AllDrafts>(saved);
  const drafts = allDrafts.travelerRefs;
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteResult, setPasteResult] = useState<RefPasteResult | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pictureInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  // What the last picture or pasted table held, kept so a name that didn't match can be pointed at the right person
  const [imported, setImported] = useState<{ rows: BookingRow[]; chosen: Record<string, string>; match: BookingMatch } | null>(null);

  const setField = (field: Field, eventId: string, personId: string, value: string) =>
    setAllDrafts(prev => ({ ...prev, [field]: { ...prev[field], [eventId]: { ...prev[field][eventId], [personId]: value } } }));
  const setRef = (eventId: string, personId: string, ref: string) => setField("travelerRefs", eventId, personId, ref);

  const applyFills = (fills: BookingFill[]) => setAllDrafts(prev => {
    const next: AllDrafts = { travelerRefs: { ...prev.travelerRefs }, travelerSeats: { ...prev.travelerSeats }, travelerTickets: { ...prev.travelerTickets } };
    for (const { eventId, travellerId, ref, seat, ticket } of fills) {
      if (ref) next.travelerRefs[eventId] = { ...next.travelerRefs[eventId], [travellerId]: ref };
      if (seat) next.travelerSeats[eventId] = { ...next.travelerSeats[eventId], [travellerId]: seat };
      if (ticket) next.travelerTickets[eventId] = { ...next.travelerTickets[eventId], [travellerId]: ticket };
    }
    return next;
  });

  const importRows = (rows: BookingRow[], chosen: Record<string, string> = {}) => {
    const match = matchBookingRows(rows, bookable, travellers, chosen);
    applyFills(match.filled);
    setImported({ rows, chosen, match });
  };

  const readPictures = async (files: File[]) => {
    if (!files.length || reading) return;
    setReading(true);
    setReadError(null);
    setImported(null);
    setPasteResult(null);
    setPasteOpen(true);
    try {
      const rows = await readBookingPictures(files);
      if (rows.length) importRows(rows);
      else setReadError("Couldn't find a booking table in that picture.");
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "Couldn't read that picture. Try again.");
    } finally {
      setReading(false);
    }
  };

  const people = useMemo(() => travellers.map(person => ({
    person,
    items: bookable.filter(e => peopleOnEvent(e, [person]).length > 0),
  })).filter(row => row.items.length > 0), [travellers, bookable]);

  const changes = useMemo(() => {
    const out: BookingRefChanges = {};
    const sorted = (refs?: Record<string, string>) => JSON.stringify(Object.entries(refs ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    for (const e of bookable) {
      const clean = (from: AllDrafts, field: Field) => cleanTravelerRefs({ assignedTo: e.assignedTo, travelerRefs: from[field][e.id] }, travellers);
      if (FIELDS.some(field => sorted(clean(allDrafts, field)) !== sorted(clean(saved, field)))) {
        out[e.id] = Object.fromEntries(FIELDS.map(field => [field, clean(allDrafts, field)]));
      }
    }
    return out;
  }, [bookable, allDrafts, saved, travellers]);
  const dirty = Object.keys(changes).length > 0;

  const own = (e: TravelEvent, personId: string) => drafts[e.id]?.[personId]?.trim() || "";
  const missing = (items: TravelEvent[], personId: string) => items.filter(e => !own(e, personId) && !e.confNumber?.trim()).length;
  const totalMissing = people.reduce((sum, row) => sum + missing(row.items, row.person.id), 0);
  const query = search.trim().toLowerCase();
  const shown = query ? people.filter(row => row.person.name.toLowerCase().includes(query)) : people;

  const applyPaste = () => {
    setReadError(null);
    const table = parseBookingTable(pasteText);
    if (table) {
      setPasteResult(null);
      importRows(table);
      setPasteText("");
      return;
    }
    setImported(null);
    const result = parseRefsPaste(pasteText, bookable, travellers);
    applyFills(result.filled.map(fill => ({ ...fill, seat: "", ticket: "" })));
    setPasteResult(result);
    setPasteText("");
  };

  const close = () => { if (dirty) setDiscardOpen(true); else onClose(); };
  const unknownNames = [...new Set(imported?.match.skipped.filter(s => s.problem === "person").map(s => s.row.passenger) ?? [])];
  const otherSkips = imported?.match.skipped.filter(s => s.problem !== "person") ?? [];
  const filledPeople = new Set(imported?.match.filled.map(f => f.travellerId)).size;

  return (
    <>
      <Dialog open onOpenChange={open => { if (!open) close(); }}>
        <DialogContent
          onPaste={e => { const pictures = [...e.clipboardData.files].filter(file => file.type.startsWith("image/")); if (pictures.length) { e.preventDefault(); void readPictures(pictures); } }}
          className="dialog-mobile-full flex flex-col gap-0 border-0 bg-card p-0 overflow-hidden sm:w-[calc(100vw-2rem)] max-sm:max-h-none sm:max-w-2xl sm:h-auto sm:max-h-[85vh] sm:rounded-xl sm:border sm:border-border"
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground">Booking references, seats and tickets</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {totalMissing > 0 ? `${totalMissing} still missing. ` : "Nothing missing. "}Each traveller only ever sees their own.
            </DialogDescription>
            <div className="flex items-center gap-2 pt-2">
              <div className="relative flex-1 min-w-0">
                <MagnifyingGlass className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a traveller" aria-label="Find a traveller" className="h-9 pl-8 text-sm bg-background border-border" />
              </div>
              <input
                ref={pictureInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ""; void readPictures(files); }}
              />
              <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" disabled={reading} onClick={() => pictureInput.current?.click()}>
                {reading ? <SpinnerGap className="animate-spin" /> : <ImageIcon />} {reading ? "Reading..." : "Import picture"}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" aria-expanded={pasteOpen} onClick={() => { setPasteOpen(v => !v); setPasteResult(null); setImported(null); setReadError(null); }}>
                <ClipboardText /> Paste from Excel
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {pasteOpen && (
              <div className="space-y-2 border-b border-border bg-secondary/50 px-5 py-4">
                <Label htmlFor="refs-paste" className="text-xs font-medium text-foreground">Your booking table as it is, with a seat column per flight, or three columns: person, flight number or event name, reference</Label>
                <Textarea id="refs-paste" value={pasteText} onChange={e => setPasteText(e.target.value)} rows={4} autoComplete="off" spellCheck={false} placeholder={"Laura Davies\tQR22\tZK91LM\nTom Reid\tEK18\tQR7X2P"} className="font-mono text-xs bg-background border-border" />
                <div className="flex justify-end">
                  <Button type="button" size="sm" disabled={!pasteText.trim()} onClick={applyPaste}>Fill in references</Button>
                </div>
                {reading && <p className="text-xs font-medium text-foreground" role="status">Reading your picture. This can take up to a minute.</p>}
                {readError && <p className="text-xs font-medium text-amber-700 dark:text-amber-400" role="alert">{readError}</p>}
                {imported && (
                  <div className="space-y-2 text-xs" role="status">
                    <p className="font-medium text-foreground">{filledPeople} {filledPeople === 1 ? "person" : "people"} filled in below. Check them against your table, then save.</p>
                    {unknownNames.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="font-medium text-amber-700 dark:text-amber-400">Who are these? They're not on this trip under that name:</p>
                        {unknownNames.map(name => (
                          <div key={name} className="flex items-center gap-2">
                            <span className="flex-1 min-w-0 truncate text-foreground">{name}</span>
                            <Select
                              value=""
                              items={travellers.map(t => ({ value: t.id, label: t.name }))}
                              onValueChange={id => { if (typeof id === "string" && id) importRows(imported.rows, { ...imported.chosen, [name]: id }); }}
                            >
                              <SelectTrigger aria-label={`Who is ${name}?`} className="h-8 w-44 shrink-0 text-xs"><SelectValue placeholder="Choose traveller" /></SelectTrigger>
                              <SelectContent>{travellers.map(t => <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    )}
                    {otherSkips.length > 0 && <p className="font-medium text-amber-700 dark:text-amber-400">{otherSkips.length} left out:</p>}
                    {otherSkips.map(({ row, problem }, i) => (
                      <p key={i} className="text-muted-foreground break-words"><span className="text-foreground">{row.passenger}, {row.flight || "no flight"}</span>: {PROBLEMS[problem]}</p>
                    ))}
                  </div>
                )}
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
                            {e.type === "flight" ? <AirlineMark flightNum={flightNumberOf(e)} /> : <EventIcon type={e.type} />}
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
                          {e.type === "flight" && (
                            <div className="mt-1.5 flex justify-end gap-2">
                              <Input
                                aria-label={`${person.name} seat on ${legName(e)}`}
                                value={allDrafts.travelerSeats[e.id]?.[person.id] ?? ""}
                                onChange={ev => setField("travelerSeats", e.id, person.id, ev.target.value)}
                                placeholder="Seat"
                                autoComplete="off"
                                spellCheck={false}
                                className="h-9 w-20 shrink-0 text-sm bg-background border-border text-foreground"
                              />
                              <Input
                                aria-label={`${person.name} ticket number on ${legName(e)}`}
                                value={allDrafts.travelerTickets[e.id]?.[person.id] ?? ""}
                                onChange={ev => setField("travelerTickets", e.id, person.id, ev.target.value)}
                                placeholder="Ticket number"
                                autoComplete="off"
                                spellCheck={false}
                                className="h-9 w-40 shrink-0 text-sm tabular-nums bg-background border-border text-foreground"
                              />
                            </div>
                          )}
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
            <Button type="button" size="sm" disabled={!dirty || saving} onClick={async () => { if (await onSave(changes)) onClose(); }}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard changes?"
        description="What you entered here will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={onClose}
      />
    </>
  );
}
