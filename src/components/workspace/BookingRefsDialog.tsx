import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, Bed, AirplaneTilt, CaretRight, Check, FilePdf, Hash, MagnifyingGlass, SpinnerGap, UploadSimple, X } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { AirlineMark } from "@/components/shared/AirlineMark";
import { bookableEvents, cleanTravelerRefs, connectingLegs, flightNumberOf, matchBookingRows, matchStays, parseBookingTable, parseRefsPaste, peopleOnEvent, suggestTraveller, type BookingFill, type BookingRow, type StayFile, type StayProblem } from "@/lib/bookingRefs";
import { readBookingPictures, readStayPdfs } from "@/services/readBookings";
import { sortEvents } from "@/lib/sortEvents";
import type { EventDocument, TravelEvent } from "@/types";

interface Person { id: string; name: string; initials: string; avatar?: string; email?: string }
type Drafts = Record<string, Record<string, string>>;
const FIELDS = ["travelerRefs", "travelerSeats", "travelerTickets"] as const;
type Field = typeof FIELDS[number];
type AllDrafts = Record<Field, Drafts>;
/** A saved confirmation, or a PDF picked here that uploads on Save */
export type DocDraft = EventDocument | File;
/** What's now saved on each changed event. A missing field means the event no longer has any. */
export type BookingRefChanges = Record<string, Partial<Record<Field, Record<string, string>>> & { travelerDocs?: Record<string, DocDraft> }>;

const PROBLEMS: Record<StayProblem, string> = {
  person: "No traveller with that name",
  event: "No flight or event with that name",
  "not-on-event": "This traveller isn't on that event",
  ambiguous: "More than one match",
  format: "Needs person, flight and reference",
  guests: "Names more than one guest, add it by hand",
  duplicate: "Another PDF is already for this stay",
  unread: "No guest name found",
};
const STAY_PROBLEMS: Partial<Record<StayProblem, string>> = {
  event: "No hotel checked into on that date",
  "not-on-event": "This traveller isn't on that hotel stay",
};
const MAX_PDFS = 100;

/** Files dropped from Finder, with a dropped folder opened up. Entries are taken before any await, while the drop is still readable. */
async function droppedFiles(transfer: DataTransfer): Promise<File[]> {
  const entries = [...transfer.items].map(item => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => !!entry);
  if (!entries.some(entry => entry.isDirectory)) return [...transfer.files];
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) { out.push(await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))); return; }
    if (!entry.isDirectory) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child);
    }
  };
  for (const entry of entries) await walk(entry);
  return out;
}
const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** What an import found, shown for checking before any of it goes into the list */
interface Review {
  rows: BookingRow[] | null;
  stays: StayFile[] | null;
  /** PDFs that couldn't be read at all, kept when the organiser picks who someone is, and tried again on request */
  errors: ReadError[];
  chosen: Record<string, string>;
  filled: BookingFill[];
  docs: { eventId: string; travellerId: string; key: string }[];
  unknown: string[];
  problems: { label: string; reason: string }[];
}

interface ReadError { key: string; label: string; reason: string }
/** What went wrong reading a PDF, in words: a dropped or slow read is worth trying again, so it says so */
const readReason = (message: string) =>
  /timed? ?out|TIMEOUT|deployment|Network error|temporarily unavailable|Request failed \(5\d\d\)/i.test(message) ? "The reader didn't answer in time"
  : /too many requests|busy/i.test(message) ? "The reader was busy"
  : message;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const legName = (e: TravelEvent) => e.flightNum?.trim() || e.title;
const EventIcon = ({ type }: { type: TravelEvent["type"] }) => {
  const Icon = type === "flight" ? AirplaneTilt : type === "hotel" ? Bed : Hash;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;
};

/** Files or table rows the import couldn't use, one card each with the reason in plain words */
function FileRows({ items, pdf }: { items: { label: string; reason: string }[]; pdf?: boolean }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-background">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 px-3 py-2.5">
          {pdf ? <FilePdf className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <Hash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">{item.label}</p>
            <p className="text-xs text-muted-foreground">{item.reason}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

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
  const [savedDocs] = useState<Record<string, Record<string, DocDraft>>>(() => Object.fromEntries(bookable.map(e => [e.id, e.travelerDocs ?? {}])));
  const [docs, setDocs] = useState(savedDocs);
  const pdfFiles = useRef(new Map<string, File>());
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "import">("list");
  const [importFrom, setImportFrom] = useState<"picture" | "paste">("picture");
  const popup = useRef<HTMLDivElement>(null);
  const [pasteText, setPasteText] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pictureInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<string[] | null>(null);
  const readRun = useRef(0);
  // Moving between steps removes the button just pressed; focus goes to the window, so no other button looks selected
  const step = reading ? "reading" : review ? "review" : view;
  useEffect(() => { popup.current?.focus({ preventScroll: true }); }, [step]);
  const [readError, setReadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Who the last import changed, so those rows can be checked before saving
  const [updated, setUpdated] = useState<Set<string>>(new Set());

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

  const reviewRows = (rows: BookingRow[], chosen: Record<string, string> = {}) => {
    const match = matchBookingRows(rows, bookable, travellers, chosen);
    setReview({
      rows, stays: null, errors: [], chosen, filled: match.filled, docs: [],
      unknown: [...new Set(match.skipped.filter(s => s.problem === "person").map(s => s.row.passenger))],
      problems: match.skipped.filter(s => s.problem !== "person").map(({ row, problem }) => ({ label: `${row.passenger}, ${row.flight || "no flight"}`, reason: PROBLEMS[problem] })),
    });
  };

  const reviewStays = (stays: StayFile[], errors: ReadError[], chosen: Record<string, string> = {}) => {
    const match = matchStays(stays, bookable, travellers, chosen);
    const fileName = (key: string) => pdfFiles.current.get(key)?.name ?? "PDF";
    setReview({
      rows: null, stays, errors, chosen,
      filled: match.filled.filter(fill => fill.ref).map(fill => ({ eventId: fill.eventId, travellerId: fill.travellerId, ref: fill.ref, seat: "", ticket: "" })),
      docs: match.filled,
      unknown: [...new Set(match.skipped.filter(s => s.problem === "person").map(s => s.file.guests[0]))],
      // Read failures show on their own, with Try again; these are PDFs read fine that fit no stay
      problems: match.skipped.filter(s => s.problem !== "person").map(({ file, problem }) => ({
        label: [fileName(file.key), file.guests.join(" and ")].filter(Boolean).join(", "),
        reason: STAY_PROBLEMS[problem] ?? PROBLEMS[problem],
      })),
    });
  };

  // Reads these PDFs and reviews them along with any read before (Try again re-reads only the ones that failed)
  const readPdfEntries = async (entries: { key: string; file: File }[], before: { stays: StayFile[]; chosen: Record<string, string> }) => {
    const run = ++readRun.current;
    const stays = [...before.stays];
    const errors: ReadError[] = [];
    let done = 0;
    setReading(entries.map(entry => entry.file.name));
    setPdfProgress({ done: 0, total: entries.length });
    setReadError(null);
    try {
      const files = entries.map(entry => entry.file);
      await readStayPdfs(files, (file, result) => {
        if (run !== readRun.current) return;
        const { key } = entries[files.indexOf(file)];
        pdfFiles.current.set(key, file);
        if ("read" in result) stays.push({ key, ...result.read });
        else errors.push({ key, label: file.name, reason: readReason(result.error) });
        setPdfProgress({ done: ++done, total: entries.length });
      }, () => run !== readRun.current);
      if (run !== readRun.current) return;
      // Folder order, so the review reads like the folder
      stays.sort((a, b) => parseInt(a.key) - parseInt(b.key));
      errors.sort((a, b) => parseInt(a.key) - parseInt(b.key));
      reviewStays(stays, errors, before.chosen);
    } catch (error) {
      if (run === readRun.current) setReadError(error instanceof Error ? error.message : "Couldn't read those PDFs. Try again.");
    } finally {
      if (run === readRun.current) { setReading(null); setPdfProgress(null); }
    }
  };

  const readPdfs = (files: File[]) => {
    if (files.length > MAX_PDFS) { setReadError(`Add up to ${MAX_PDFS} PDFs at a time.`); return; }
    pdfFiles.current = new Map();
    void readPdfEntries(files.map((file, i) => ({ key: `${i}:${file.name}`, file })), { stays: [], chosen: {} });
  };

  const retryFailed = () => {
    if (!review?.stays || reading) return;
    const entries = review.errors.flatMap(error => { const file = pdfFiles.current.get(error.key); return file ? [{ key: error.key, file }] : []; });
    if (entries.length) void readPdfEntries(entries, { stays: review.stays, chosen: review.chosen });
  };

  const readFiles = (files: File[]) => {
    if (reading) return;
    setView("import");
    setReview(null);
    const pdfs = files.filter(isPdf);
    if (pdfs.length) readPdfs(pdfs);
    else void readPictures(files);
  };

  const readPictures = async (files: File[]) => {
    if (reading) return;
    const pictures = files.filter(file => file.type.startsWith("image/"));
    setView("import");
    setReview(null);
    if (!pictures.length) { if (files.length) setReadError("That isn't a picture or PDF. Use a JPG, PNG, screenshot or PDF."); return; }
    const run = ++readRun.current;
    setReading(pictures.map(file => file.name));
    setReadError(null);
    try {
      const rows = await readBookingPictures(pictures);
      if (run !== readRun.current) return;
      if (rows.length) reviewRows(rows);
      else setReadError("Couldn't find a booking table in that picture.");
    } catch (error) {
      if (run === readRun.current) setReadError(error instanceof Error ? error.message : "Couldn't read that picture. Try again.");
    } finally {
      if (run === readRun.current) setReading(null);
    }
  };

  const cancelReading = () => { readRun.current++; setReading(null); setPdfProgress(null); };

  const readPaste = () => {
    setReadError(null);
    const table = parseBookingTable(pasteText);
    if (table) { reviewRows(table); return; }
    const result = parseRefsPaste(pasteText, bookable, travellers);
    setReview({
      rows: null, stays: null, errors: [], chosen: {},
      filled: result.filled.map(fill => ({ ...fill, seat: "", ticket: "" })),
      docs: [],
      unknown: [],
      problems: result.skipped.map(({ line, problem }) => ({ label: line.replace(/\t/g, ", "), reason: PROBLEMS[problem] })),
    });
  };

  const setDoc = (eventId: string, personId: string, doc: DocDraft | null) => setDocs(prev => {
    const forEvent = { ...prev[eventId] };
    if (doc) forEvent[personId] = doc; else delete forEvent[personId];
    return { ...prev, [eventId]: forEvent };
  });

  const addToList = () => {
    if (!review) return;
    applyFills(review.filled);
    for (const { eventId, travellerId, key } of review.docs) {
      const file = pdfFiles.current.get(key);
      if (file) setDoc(eventId, travellerId, file);
    }
    setUpdated(new Set([...review.filled, ...review.docs].map(fill => fill.travellerId)));
    setReview(null);
    setPasteText("");
    setView("list");
  };

  const people = useMemo(() => travellers.map(person => ({
    person,
    items: bookable.filter(e => peopleOnEvent(e, [person]).length > 0),
  })).filter(row => row.items.length > 0), [travellers, bookable]);

  const changes = useMemo(() => {
    const out: BookingRefChanges = {};
    const sorted = (refs?: Record<string, string>) => JSON.stringify(Object.entries(refs ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    const on = (e: TravelEvent) => new Set(peopleOnEvent(e, travellers).map(t => t.id));
    const keptDocs = (e: TravelEvent, from: Record<string, Record<string, DocDraft>>) => {
      const kept = Object.entries(from[e.id] ?? {}).filter(([id]) => on(e).has(id));
      return kept.length ? Object.fromEntries(kept) : undefined;
    };
    // A File is a new pick; a saved document is the same one while its id is
    const docKey = (doc: DocDraft) => doc instanceof File ? doc : doc.id;
    const sameDocs = (a?: Record<string, DocDraft>, b?: Record<string, DocDraft>) => {
      const x = Object.entries(a ?? {}), y = b ?? {};
      return x.length === Object.keys(y).length && x.every(([id, doc]) => !!y[id] && docKey(y[id]) === docKey(doc));
    };
    for (const e of bookable) {
      const clean = (from: AllDrafts, field: Field) => cleanTravelerRefs({ assignedTo: e.assignedTo, travelerRefs: from[field][e.id] }, travellers);
      const docsNow = keptDocs(e, docs);
      if (FIELDS.some(field => sorted(clean(allDrafts, field)) !== sorted(clean(saved, field))) || !sameDocs(docsNow, keptDocs(e, savedDocs))) {
        out[e.id] = { ...Object.fromEntries(FIELDS.map(field => [field, clean(allDrafts, field)])), travelerDocs: docsNow };
      }
    }
    return out;
  }, [bookable, allDrafts, saved, docs, savedDocs, travellers]);
  const dirty = Object.keys(changes).length > 0;

  const own = (e: TravelEvent, personId: string) => drafts[e.id]?.[personId]?.trim() || "";
  // Seats and tickets only count as missing once the trip is using them: plenty of trips never record either
  const inUse = (field: Field) => bookable.some(e => Object.values(allDrafts[field][e.id] ?? {}).some(value => value.trim()));
  const usesSeats = inUse("travelerSeats"), usesTickets = inUse("travelerTickets");
  const gapsFor = (items: TravelEvent[], personId: string) => {
    const flights = items.filter(e => e.type === "flight");
    const empty = (field: Field) => flights.filter(e => !allDrafts[field][e.id]?.[personId]?.trim()).length;
    return {
      references: items.filter(e => !own(e, personId) && !e.confNumber?.trim()).length,
      seats: usesSeats ? empty("travelerSeats") : 0,
      tickets: usesTickets ? empty("travelerTickets") : 0,
    };
  };
  const complete = people.filter(row => { const gap = gapsFor(row.items, row.person.id); return !gap.references && !gap.seats && !gap.tickets; }).length;
  const query = search.trim().toLowerCase();
  const shown = query ? people.filter(row => row.person.name.toLowerCase().includes(query)) : people;

  const close = () => { if (dirty || review) setDiscardOpen(true); else onClose(); };
  const toggle = (id: string, open: boolean) => setExpanded(prev => {
    const next = new Set(prev);
    if (open) next.add(id); else next.delete(id);
    return next;
  });
  const leaveImport = () => { cancelReading(); setReview(null); setReadError(null); setView("list"); };

  const reviewCounts = review && {
    people: new Set([...review.filled, ...review.docs].map(fill => fill.travellerId)).size,
    pdfs: review.docs.length,
    references: review.filled.filter(fill => fill.ref).length,
    seats: review.filled.filter(fill => fill.seat).length,
    tickets: review.filled.filter(fill => fill.ticket).length,
    replaced: review.filled.reduce((sum, fill) => {
      const differs = (field: Field, value: string) => { const now = allDrafts[field][fill.eventId]?.[fill.travellerId]?.trim(); return !!value && !!now && now !== value; };
      return sum + [differs("travelerRefs", fill.ref), differs("travelerSeats", fill.seat), differs("travelerTickets", fill.ticket)].filter(Boolean).length;
    }, 0),
  };
  const foundLine = reviewCounts && [
    plural(reviewCounts.pdfs, "confirmation PDF"), plural(reviewCounts.references, "reference"), plural(reviewCounts.seats, "seat"), plural(reviewCounts.tickets, "ticket number"),
  ].filter(part => !part.startsWith("0 ")).join(", ");
  const replacedPdfs = review ? review.docs.filter(doc => docs[doc.eventId]?.[doc.travellerId]).length : 0;

  return (
    <>
      <Dialog open onOpenChange={open => { if (!open) close(); }}>
        <DialogContent
          ref={popup}
          initialFocus={popup}
          onPaste={e => { const pictures = [...e.clipboardData.files].filter(file => file.type.startsWith("image/")); if (pictures.length) { e.preventDefault(); void readPictures(pictures); } }}
          className="dialog-mobile-full flex flex-col gap-0 border-0 bg-card p-0 overflow-hidden outline-none sm:w-[calc(100vw-2rem)] max-sm:max-h-none sm:max-w-3xl sm:h-fit sm:max-h-[85vh] sm:rounded-xl sm:border sm:border-border"
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 pt-5 pb-4 text-left sm:px-6 sm:pt-6">
            <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
              {view === "import" ? "Import bookings" : "Booking references, seats and tickets"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {view === "import"
                ? "Nothing changes until you've checked what was found."
                : `${people.length ? `${complete} of ${plural(people.length, "traveller")} complete. ` : ""}Each traveller only ever sees their own.`}
            </DialogDescription>
            {view === "list" && (
              <div className="flex items-center gap-2 pt-2">
                <div className="relative flex-1 min-w-0">
                  <MagnifyingGlass className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a traveller" aria-label="Find a traveller" className="h-9 rounded-xl pl-8 text-sm bg-background border-border" />
                </div>
                <Button type="button" variant="outline" className="h-9 shrink-0 rounded-xl px-3 text-xs font-medium" onClick={() => setView("import")}>
                  <UploadSimple /> Import
                </Button>
              </div>
            )}
          </DialogHeader>
          <input
            ref={pictureInput}
            type="file"
            accept="image/*,application/pdf,.pdf"
            multiple
            hidden
            onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ""; readFiles(files); }}
          />

          {view === "import" && (
            <>
              <div className="min-h-0 overflow-y-auto px-5 py-5 max-sm:flex-1 sm:px-6">
                {reading ? (
                  <div role="status" aria-live="polite" className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    {pdfProgress ? (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Reading {plural(pdfProgress.total, "PDF")}</p>
                        <div className="mt-4 flex items-center gap-3">
                          <SpinnerGap className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                          <p className="text-sm text-foreground tabular-nums">{pdfProgress.done} of {pdfProgress.total} read</p>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                          <div className="h-full bg-foreground/60 transition-[width] duration-300" style={{ width: `${Math.round((pdfProgress.done / pdfProgress.total) * 100)}%` }} />
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">Finding each guest, hotel and confirmation number. Keep this window open.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Reading your {reading.length === 1 ? "picture" : `${reading.length} pictures`}</p>
                        <div className="mt-4 flex items-center gap-3">
                          <SpinnerGap className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                          <p className="text-sm text-foreground">Finding each traveller's references, seats and tickets</p>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">This can take up to a minute. Keep this window open.</p>
                      </>
                    )}
                  </div>
                ) : review && reviewCounts ? (
                  <div className="space-y-6" role="status">
                    {/* What's ready, in one line, then only what needs the organiser */}
                    <div>
                      <p className="text-base font-semibold tracking-tight text-foreground">
                        {review.stays
                          ? `${review.docs.length} of ${plural(review.stays.length + review.errors.length, "PDF")} ready to add`
                          : reviewCounts.people ? `${reviewCounts.people} of ${plural(people.length, "traveller")} matched` : "Nobody matched yet"}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {review.stays
                          ? [plural(reviewCounts.people, "traveller"), plural(new Set(review.docs.map(doc => doc.eventId)).size, "hotel")].join(", ")
                          : foundLine}
                      </p>
                    </div>

                    {review.errors.length > 0 && (
                      <section className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-foreground">Couldn't read {review.errors.length}</h3>
                          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={retryFailed}>
                            <ArrowClockwise /> Try {review.errors.length === 1 ? "it" : `these ${review.errors.length}`} again
                          </Button>
                        </div>
                        <FileRows pdf items={review.errors} />
                      </section>
                    )}

                    {review.unknown.length > 0 && (
                      <section className="space-y-2">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Who {review.unknown.length === 1 ? "is this" : "are these"}?</h3>
                          <p className="text-xs text-muted-foreground">Not on this trip under that name. Anyone you skip is left out.</p>
                        </div>
                        {review.unknown.map(name => {
                          const pick = (id: string) => {
                            const chosen = { ...review.chosen, [name]: id };
                            if (review.rows) reviewRows(review.rows, chosen);
                            else if (review.stays) reviewStays(review.stays, review.errors, chosen);
                          };
                          const suggestion = suggestTraveller(name, travellers);
                          return (
                            <div key={name} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-3">
                              <span className="flex-1 min-w-40 break-words text-sm text-foreground">{name}</span>
                              {suggestion && <Button type="button" variant="outline" className="h-9 rounded-xl px-3 text-xs font-medium" onClick={() => pick(suggestion.id)}>{suggestion.name}?</Button>}
                              <Select value="" items={travellers.map(t => ({ value: t.id, label: t.name }))} onValueChange={id => { if (typeof id === "string" && id) pick(id); }}>
                                <SelectTrigger aria-label={`Who is ${name}?`} className="h-9 w-40 shrink-0 rounded-xl text-xs"><SelectValue placeholder={suggestion ? "Someone else" : "Choose traveller"} /></SelectTrigger>
                                <SelectContent>{travellers.map(t => <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </section>
                    )}

                    {review.problems.length > 0 && (
                      <section className="space-y-2">
                        <h3 className="text-sm font-semibold text-foreground">Left out {review.problems.length}</h3>
                        <FileRows pdf={!!review.stays} items={review.problems} />
                      </section>
                    )}

                    {reviewCounts.replaced + replacedPdfs > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {reviewCounts.replaced + replacedPdfs === 1 ? "1 replaces" : `${reviewCounts.replaced + replacedPdfs} replace`} what's already saved. You can check them in the list before saving.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {importFrom === "picture" ? (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label="Upload a picture of your booking table, or hotel confirmation PDFs"
                        onClick={() => pictureInput.current?.click()}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pictureInput.current?.click(); } }}
                        onDragOver={e => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={e => { e.preventDefault(); setDragging(false); void droppedFiles(e.dataTransfer).then(readFiles).catch(() => setReadError("Couldn't open what was dropped. Try choosing the files instead.")); }}
                        className={`group cursor-pointer outline-none focus-visible:border-foreground/40 flex flex-col items-center justify-center gap-4 px-6 py-10 border border-dashed rounded-xl transition-colors ${dragging ? "border-foreground/40 bg-secondary" : "border-border bg-secondary/40 hover:bg-secondary/70 hover:border-foreground/25"}`}
                      >
                        <div className="h-12 w-12 rounded-full bg-card border border-border shadow-sm flex items-center justify-center transition-transform group-hover:-translate-y-0.5" aria-hidden="true">
                          <UploadSimple className="h-5 w-5 text-foreground" />
                        </div>
                        <div className="text-center">
                          <p className="text-base font-semibold text-foreground tracking-tight">{dragging ? "Drop it here" : "Drop a booking table or hotel PDFs here"}</p>
                          <p className="text-sm text-muted-foreground mt-1">A picture of the table, or a whole folder of confirmation PDFs</p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor="refs-paste" className="sr-only">Paste your booking table from Excel</Label>
                        <Textarea id="refs-paste" autoFocus value={pasteText} onChange={e => setPasteText(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Copy the table from Excel, including its headings, and paste it here" className="w-full field-sizing-fixed h-[220px] max-h-[40dvh] resize-none overflow-y-auto text-sm leading-relaxed bg-background border-border" />
                      </div>
                    )}
                    {readError && <p className="text-xs font-medium text-amber-700 dark:text-amber-400" role="alert">{readError}</p>}
                    <button type="button" onClick={() => { setImportFrom(importFrom === "picture" ? "paste" : "picture"); setReadError(null); }} className="mx-auto block text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                      {importFrom === "picture" ? "Or paste from Excel instead" : "Upload a picture instead"}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                {reading ? (
                  <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2" onClick={cancelReading}>Stop</button>
                ) : review ? (
                  <>
                    <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2" onClick={() => setReview(null)}>Back</button>
                    <Button type="button" className="h-10 px-8 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-medium text-xs" disabled={!review.filled.length && !review.docs.length} onClick={addToList}>{(() => { const n = review.stays ? review.docs.length : review.filled.length; return n ? `Add ${n} to list` : "Add to list"; })()}</Button>
                  </>
                ) : (
                  <>
                    <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2" onClick={leaveImport}>Back to list</button>
                    {importFrom === "paste" && <Button type="button" className="h-10 px-8 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-medium text-xs" disabled={!pasteText.trim()} onClick={readPaste}>Read table</Button>}
                  </>
                )}
              </div>
            </>
          )}

          {view === "list" && (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {updated.size > 0 && dirty && (
                  <p role="status" className="border-b border-border bg-secondary px-5 py-2.5 text-xs font-medium text-foreground sm:px-6">
                    {plural(updated.size, "traveller")} updated, not saved yet. Check the rows marked Updated, then save.
                  </p>
                )}
                {shown.length === 0 && (
                  <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                    {query ? "No traveller by that name" : "Add travellers and flights or hotels first"}
                  </p>
                )}

                {shown.map(({ person, items }) => {
                  const flights = items.filter(e => e.type === "flight");
                  const gap = gapsFor(items, person.id);
                  const gaps = [plural(gap.references, "reference"), plural(gap.seats, "seat"), plural(gap.tickets, "ticket")].filter(part => !part.startsWith("0 "));
                  const open = !!query || expanded.has(person.id);
                  return (
                    <Collapsible key={person.id} open={open} onOpenChange={next => toggle(person.id, next)} className="border-b border-border last:border-b-0">
                      <CollapsibleTrigger className="flex w-full items-center gap-2.5 px-5 py-3 text-left sm:px-6 hover:bg-secondary/60 focus-visible:outline-none focus-visible:bg-secondary">
                        <PersonAvatar avatar={person.avatar} initials={person.initials} name={person.name} className="h-7 w-7 shrink-0" fallbackClassName="text-[9px] font-black" />
                        {/* The status drops under the name on a phone, so a long one can't squeeze the name away */}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2.5">
                          <span className="min-w-0 truncate text-sm font-semibold text-foreground sm:flex-1">{person.name}</span>
                          {gaps.length > 0
                            ? <span className="text-xs font-medium text-amber-700 sm:order-1 sm:shrink-0 dark:text-amber-400">{gaps.join(", ")} missing</span>
                            : <span className="flex items-center gap-1 text-xs text-muted-foreground sm:order-1 sm:shrink-0"><Check className="h-3.5 w-3.5" aria-hidden="true" /> All done</span>}
                        </span>
                        {updated.has(person.id) && <span className="shrink-0 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Updated</span>}
                        <CaretRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="space-y-3 px-5 pb-4 sm:px-6">
                          <div aria-hidden="true" className="hidden items-center gap-2 text-[11px] font-medium text-muted-foreground sm:flex">
                            <span className="flex-1">Booking</span>
                            <span className="w-28">Reference</span>
                            {flights.length > 0 && <span className="w-16">Seat</span>}
                            {flights.length > 0 && <span className="w-36">Ticket number</span>}
                          </div>
                          {items.map(e => {
                            const cell = `${person.id}:${e.id}`;
                            const value = drafts[e.id]?.[person.id] ?? "";
                            const legs = e.type === "flight" && value.trim() && focused !== cell
                              ? connectingLegs(flights, e.id).filter(leg => !own(leg, person.id)) : [];
                            const route = [e.depAirport, e.arrAirport].filter(Boolean).join(" to ");
                            return (
                              <div key={e.id}>
                                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                                  <div className="flex basis-full items-center gap-2.5 min-w-0 sm:basis-0 sm:flex-1">
                                    {e.type === "flight" ? <AirlineMark flightNum={flightNumberOf(e)} /> : <EventIcon type={e.type} />}
                                    <Label htmlFor={`refs-${cell}`} className="block flex-1 min-w-0 font-normal">
                                      <span className="block truncate text-xs font-medium text-foreground">{e.flightNum?.trim() ? `${e.flightNum.trim()}${route ? `, ${route}` : ""}` : e.title}</span>
                                      <span className="block text-[11px] text-muted-foreground tabular-nums">{shortDate(e.date)}</span>
                                    </Label>
                                  </div>
                                  <Input
                                    id={`refs-${cell}`}
                                    value={value}
                                    onChange={ev => setRef(e.id, person.id, ev.target.value)}
                                    onFocus={() => setFocused(cell)}
                                    onBlur={() => setFocused(null)}
                                    placeholder={e.confNumber?.trim() ? `Uses ${e.confNumber.trim()}` : "Reference"}
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="h-9 min-w-0 flex-1 rounded-xl text-sm font-semibold bg-background border-border text-foreground sm:w-28 sm:flex-none"
                                  />
                                  {e.type === "flight" ? (
                                    <>
                                      <Input
                                        aria-label={`${person.name} seat on ${legName(e)}`}
                                        value={allDrafts.travelerSeats[e.id]?.[person.id] ?? ""}
                                        onChange={ev => setField("travelerSeats", e.id, person.id, ev.target.value)}
                                        placeholder="Seat"
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="h-9 w-16 shrink-0 rounded-xl text-sm bg-background border-border text-foreground"
                                      />
                                      <Input
                                        aria-label={`${person.name} ticket number on ${legName(e)}`}
                                        value={allDrafts.travelerTickets[e.id]?.[person.id] ?? ""}
                                        onChange={ev => setField("travelerTickets", e.id, person.id, ev.target.value)}
                                        placeholder="Ticket number"
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="h-9 min-w-0 flex-1 rounded-xl text-sm tabular-nums bg-background border-border text-foreground sm:w-36 sm:flex-none"
                                      />
                                    </>
                                  ) : flights.length > 0 ? (
                                    <span aria-hidden="true" className="hidden w-[calc(13rem+0.5rem)] shrink-0 sm:block" />
                                  ) : null}
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
                                {docs[e.id]?.[person.id] && (() => {
                                  const doc = docs[e.id][person.id];
                                  return (
                                    <div className="mt-1.5 flex items-center gap-2 pl-6">
                                      <FilePdf className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                      {doc instanceof File
                                        ? <span className="min-w-0 truncate text-xs text-muted-foreground">{doc.name}, uploads when you save</span>
                                        : <a href={doc.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-xs font-medium text-foreground underline-offset-4 hover:underline">Booking confirmation</a>}
                                      <Button type="button" variant="ghost" size="icon-xs" className="shrink-0 text-muted-foreground" aria-label={`Remove ${person.name}'s confirmation PDF for ${e.title}`} onClick={() => setDoc(e.id, person.id, null)}>
                                        <X />
                                      </Button>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2" onClick={close}>Cancel</button>
                <Button type="button" className="h-10 px-8 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-medium text-xs" disabled={!dirty || saving} onClick={async () => { if (await onSave(changes)) onClose(); }}>{saving ? <><SpinnerGap className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…</> : "Save"}</Button>
              </div>
            </>
          )}
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
