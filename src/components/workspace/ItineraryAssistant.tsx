import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowRight, ArrowCounterClockwise, CaretDown, ChatCircleText, Check, Info, NotePencil, Warning, X } from "@phosphor-icons/react";
import { differenceInCalendarDays, format, parseISO, isValid } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { CategoryDot } from "@/components/ui/category-dot";
import { apiFetch, getIdToken, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  applyAssistantChanges,
  applyInfoChanges,
  changedFields,
  compactTripForAssistant,
  undoAssistantChanges,
  undoInfoChanges,
  type AssistantChange,
  type AssistantResult,
} from "@/lib/itineraryAssistant";
import type { TravelEvent, Trip, TripInfo } from "@/types";

type ProposalStatus = "pending" | "applied" | "discarded" | "undone";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  changes?: AssistantChange[];
  warnings?: string[];
  options?: string[];
  /** Per-change tick state while pending; after applying, which ones went in. */
  selected?: boolean[];
  status?: ProposalStatus;
  undo?: { originals: TravelEvent[]; addedIds: string[]; infoOriginals?: TripInfo[]; infoAddedIds?: string[] };
  error?: boolean;
}

// Survives closing and reopening the panel for the rest of the session.
const conversations = new Map<string, ChatMessage[]>();

const uid = () => Math.random().toString(36).slice(2, 10);

function toHistory(messages: ChatMessage[]) {
  return messages
    .filter(m => !m.error)
    .map(m => {
      if (m.role === "user" || !m.changes?.length) return { role: m.role, content: m.text };
      const picked = m.changes.filter((_, i) => m.selected?.[i] !== false);
      const outcome = m.status === "applied"
        ? picked.length === m.changes.length ? "The agent applied all of them." : `The agent applied only: ${picked.map(c => c.summary).join("; ")}.`
        : m.status === "pending" ? "The agent has not applied them yet."
        : "The agent did not apply them.";
      const list = m.changes.map(c => `- ${c.summary}`).join("\n");
      return { role: m.role, content: `${m.text}\n\nProposed changes:\n${list}\n${outcome}` };
    });
}

function prettyValue(key: string, value: string) {
  if (!value) return "";
  if (key === "date" || key === "checkin" || key === "checkout" || key === "endDate") {
    const d = parseISO(value);
    return isValid(d) ? format(d, "EEE d MMM") : value;
  }
  if (key === "type" || key === "transferType") return value.charAt(0).toUpperCase() + value.slice(1);
  return value;
}

/** Trip info changes are grouped under this key, ahead of the days */
const INFO_GROUP = "info";

/** "Secret Dining Room Dinner — Anantara Chiang Mai" -> "Secret Dining Room Dinner" */
function shortTitle(title: string) {
  return title.split(/\s+[—–-]\s+/)[0].trim();
}

function suggestionsFor(trip: Trip) {
  const out: string[] = [];
  const sorted = [...trip.events].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const dinner = sorted.find(e => e.type === "dining" && /PM/i.test(e.time)) ?? sorted.find(e => e.type === "dining");
  if (dinner?.title) out.push(`Push the ${shortTitle(dinner.title)} back an hour`);
  const flight = sorted.find(e => e.type === "flight");
  if (flight) out.push(`What time does ${flight.flightNum || shortTitle(flight.title)} leave, and is there a transfer?`);
  const days = [...new Set(sorted.map(e => e.date).filter(Boolean))];
  const last = days[days.length - 1] ? parseISO(days[days.length - 1]) : null;
  if (last && isValid(last)) out.push(`Add a free afternoon on ${format(last, "EEE d MMM")}`);
  else if (days.length >= 3) out.push("Swap day 2 and day 3");
  out.push("Which bookings are missing a confirmation number?");
  return out.slice(0, 4);
}

const CATEGORY_ORDER: TravelEvent["type"][] = ["flight", "hotel", "transfer", "activity", "dining"];
const CATEGORY_NOUN: Record<TravelEvent["type"], [string, string]> = {
  flight: ["flight", "flights"],
  hotel: ["stay", "stays"],
  transfer: ["transfer", "transfers"],
  activity: ["activity", "activities"],
  dining: ["meal", "meals"],
};

function TripSummary({ trip }: { trip: Trip }) {
  const counts = CATEGORY_ORDER
    .map(type => ({ type, n: trip.events.filter(e => e.type === type).length }))
    .filter(c => c.n > 0);
  const start = parseISO(trip.start);
  const end = parseISO(trip.end);
  const range = isValid(start) && isValid(end)
    ? `${format(start, "d MMM")} to ${format(end, "d MMM yyyy")}`
    : "";
  const days = isValid(start) && isValid(end) ? differenceInCalendarDays(end, start) + 1 : 0;

  return (
    <div className="rounded-xl border border-border bg-background p-3.5 shadow-sm">
      <p className="truncate text-sm font-semibold text-foreground">{trip.name}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {[range, days > 0 ? `${days} ${days === 1 ? "day" : "days"}` : "", `${trip.events.length} ${trip.events.length === 1 ? "event" : "events"}`].filter(Boolean).join(", ")}
      </p>
      {counts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {counts.map(({ type, n }) => (
            <span key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CategoryDot type={type} size="sm" />
              <span><span className="font-semibold text-foreground">{n}</span> {CATEGORY_NOUN[type][n === 1 ? 0 : 1]}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Outline an itinerary card from the panel. Only on wide screens, where both are visible side by side. */
function markEvents(ids: string[], className: "assistant-focus" | "assistant-flash", scroll: boolean) {
  if (typeof window === "undefined" || !window.matchMedia("(min-width: 1024px)").matches) return;
  const els = ids
    .map(id => document.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(id)}"]`))
    .filter((el): el is HTMLElement => !!el);
  if (scroll) els[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
  for (const el of els) {
    el.classList.remove(className);
    // Restart the flash animation if the same card is flashed twice in a row.
    void el.offsetWidth;
    el.classList.add(className);
    if (className === "assistant-flash") setTimeout(() => el.classList.remove(className), 2500);
  }
}

function clearFocus() {
  document.querySelectorAll(".assistant-focus").forEach(el => el.classList.remove("assistant-focus"));
}

const OP_STYLE: Record<AssistantChange["op"], { label: string; className: string }> = {
  add: { label: "New", className: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10" },
  update: { label: "Edit", className: "text-amber-700 dark:text-amber-400 bg-amber-500/10" },
  delete: { label: "Remove", className: "text-red-600 dark:text-red-400 bg-red-500/10" },
};

function ChangeRow({
  change,
  event,
  card,
  names,
  selectable,
  checked,
  skipped,
  onToggle,
}: {
  change: AssistantChange;
  event?: TravelEvent;
  /** The Trip info card an info change is about */
  card?: TripInfo;
  names: Map<string, string>;
  selectable: boolean;
  checked: boolean;
  skipped: boolean;
  onToggle: (v: boolean) => void;
}) {
  const info = change.target === "info";
  const type = (change.fields.type ?? event?.type ?? "activity") as TravelEvent["type"];
  const op = OP_STYLE[change.op];
  const diffs = change.op === "update" ? changedFields(info ? card : event, change.fields, names) : [];
  const title = change.op === "add" ? change.fields.title : info ? card?.title : event?.title;
  const canLocate = !info && change.op !== "add" && !!event;

  return (
    <li
      onMouseEnter={canLocate ? () => markEvents([change.eventId], "assistant-focus", true) : undefined}
      onMouseLeave={canLocate ? clearFocus : undefined}
      className={cn("flex gap-3 px-3.5 py-3 transition-colors", canLocate && "hover:bg-secondary/50")}
    >
      {selectable && (
        <Checkbox
          checked={checked}
          onCheckedChange={v => onToggle(!!v)}
          aria-label={`Include: ${change.summary}`}
          className="mt-1.5"
        />
      )}
      <div className={cn("flex min-w-0 flex-1 gap-3 transition-opacity", (skipped || (selectable && !checked)) && "opacity-45")}>
      {info
        ? <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground"><Info className="h-3.5 w-3.5" weight="fill" /></span>
        : <CategoryDot type={type} size="sm" className="mt-0.5" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm font-medium leading-snug text-foreground", change.op === "delete" && "line-through decoration-muted-foreground/60")}>
            {title || change.summary}
          </p>
          <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", op.className)}>
            {skipped ? "Skipped" : op.label}
          </span>
        </div>

        {change.op === "add" && info && change.fields.body && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-3">{change.fields.body}</p>
        )}

        {change.op === "add" && !info && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[change.fields.time && change.fields.time !== "TBD" ? change.fields.time : "", change.fields.endTime ? `until ${change.fields.endTime}` : "", change.fields.location].filter(Boolean).join(", ")}
          </p>
        )}

        {change.op === "delete" && (
          <p className="mt-0.5 text-xs text-muted-foreground">{info ? "Removed from Trip info" : "Removed from the itinerary"}</p>
        )}

        {diffs.length > 0 && (
          <dl className="mt-1.5 space-y-1">
            {diffs.map(d => {
              const long = d.key === "description" || d.key === "notes" || d.key === "body";
              return (
                <div key={d.key} className="grid grid-cols-[4.5rem_1fr] gap-2 text-xs">
                  <dt className="pt-px text-muted-foreground">{d.label}</dt>
                  <dd className={cn("min-w-0", long ? "space-y-0.5" : "flex flex-wrap items-center gap-x-1.5")}>
                    {d.before && (
                      <span className={cn("text-muted-foreground line-through decoration-muted-foreground/50", long && "block line-clamp-1")}>
                        {prettyValue(d.key, d.before)}
                      </span>
                    )}
                    {d.before && !long && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/70" />}
                    <span className={cn("font-medium text-foreground", long && "block line-clamp-3 font-normal")}>
                      {prettyValue(d.key, d.after)}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
      </div>
    </li>
  );
}

function ProposalCard({
  message,
  trip,
  onToggle,
  onToggleAll,
  onApply,
  onDiscard,
  onUndo,
}: {
  message: ChatMessage;
  trip: Trip;
  onToggle: (index: number, value: boolean) => void;
  onToggleAll: (value: boolean) => void;
  onApply: () => void;
  onDiscard: () => void;
  onUndo: () => void;
}) {
  const changes = message.changes ?? [];
  const pending = message.status === "pending";
  const selectable = pending && changes.length > 1;
  const selected = message.selected ?? changes.map(() => true);
  const count = selected.filter(Boolean).length;
  const byId = useMemo(() => new Map(trip.events.map(e => [e.id, e])), [trip.events]);
  // Once applied, the live event already carries the new values; diff against the snapshot instead.
  const originals = useMemo(() => new Map((message.undo?.originals ?? []).map(e => [e.id, e])), [message.undo]);
  const eventFor = (c: AssistantChange) => originals.get(c.eventId) ?? byId.get(c.eventId);
  const cardsById = useMemo(() => new Map((trip.info ?? []).map(i => [i.id, i])), [trip.info]);
  const infoOriginals = useMemo(() => new Map((message.undo?.infoOriginals ?? []).map(i => [i.id, i])), [message.undo]);
  const cardFor = (c: AssistantChange) => infoOriginals.get(c.eventId) ?? cardsById.get(c.eventId);
  const names = useMemo(() => new Map((trip.travelers ?? []).map(t => [t.id, t.name])), [trip.travelers]);

  // Group rows by the day they sit on now (new events by the day they land on).
  const groups = useMemo(() => {
    const map = new Map<string, number[]>();
    changes.forEach((c, i) => {
      const day = c.target === "info" ? INFO_GROUP : (c.op === "add" ? c.fields.date : eventFor(c)?.date) || "";
      map.set(day, [...(map.get(day) ?? []), i]);
    });
    // Trip info first, then the days in order
    return [...map.entries()].sort(([a], [b]) => (a === INFO_GROUP ? -1 : b === INFO_GROUP ? 1 : a.localeCompare(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes, byId, originals]);
  const grouped = groups.length > 1;
  const [allWarnings, setAllWarnings] = useState(false);
  const warnings = message.warnings ?? [];
  const shownWarnings = allWarnings ? warnings : warnings.slice(0, 1);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(changes.length > 6 ? groups.slice(1).map(([d]) => d) : []),
  );

  const dayLabel = (date: string) => {
    if (date === INFO_GROUP) return { day: "Trip info", sub: "" };
    const d = parseISO(date);
    if (!date || !isValid(d)) return { day: "No date", sub: "" };
    const start = parseISO(trip.start);
    const n = isValid(start) ? differenceInCalendarDays(d, start) + 1 : 0;
    return { day: n >= 1 ? `Day ${n}` : format(d, "EEE"), sub: format(d, "EEE d MMM") };
  };

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-opacity", (message.status === "discarded" || message.status === "undone") && "opacity-60")}>
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {changes.length} {changes.length === 1 ? "change" : "changes"}
        </span>
        {selectable && (
          <button
            type="button"
            onClick={() => onToggleAll(count !== changes.length)}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {count === changes.length ? "Select none" : "Select all"}
          </button>
        )}
      </div>

      {pending && warnings.length > 0 && (
        <div className="mx-3.5 mb-3 flex gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          <Warning className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" weight="fill" />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">Check before applying</p>
            {shownWarnings.map((w, i) => <p key={i}>{w}</p>)}
            {warnings.length > 1 && (
              <button
                type="button"
                onClick={() => setAllWarnings(v => !v)}
                className="font-semibold underline decoration-amber-500/40 underline-offset-2 hover:decoration-current"
              >
                {allWarnings ? "Show less" : `${warnings.length - 1} more to check`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-border">
        {groups.map(([date, idxs]) => {
          const label = dayLabel(date);
          const isCollapsed = collapsed.has(date);
          return (
            <section key={date || "none"} className="border-b border-border last:border-b-0">
              {grouped && (
                <button
                  type="button"
                  onClick={() => setCollapsed(prev => {
                    const next = new Set(prev);
                    if (next.has(date)) next.delete(date); else next.add(date);
                    return next;
                  })}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-2 bg-secondary/40 px-3.5 py-2 text-left transition-colors hover:bg-secondary/70"
                >
                  <span className="text-xs font-semibold text-foreground">{label.day}</span>
                  <span className="text-xs text-muted-foreground">{label.sub}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{idxs.length}</span>
                  <CaretDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                </button>
              )}
              {!isCollapsed && (
                <ul className="divide-y divide-border">
                  {idxs.map(i => (
                    <ChangeRow
                      key={i}
                      change={changes[i]}
                      event={changes[i].target === "info" ? undefined : eventFor(changes[i])}
                      card={changes[i].target === "info" ? cardFor(changes[i]) : undefined}
                      names={names}
                      selectable={selectable}
                      checked={selected[i]}
                      skipped={message.status === "applied" && !selected[i]}
                      onToggle={v => onToggle(i, v)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/40 px-3 py-2.5">
        {pending && (
          <>
            <Button variant="ghost" size="sm" onClick={onDiscard}>Discard</Button>
            <Button size="sm" onClick={onApply} disabled={count === 0} className="font-semibold">
              <Check className="h-3.5 w-3.5" weight="bold" />
              {changes.length === 1 ? "Apply change" : count === changes.length ? `Apply ${count} changes` : `Apply ${count} of ${changes.length}`}
            </Button>
          </>
        )}
        {message.status === "applied" && (
          <>
            <span className="mr-auto flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" weight="bold" />
              {count === changes.length ? "Applied to the itinerary" : `${count} of ${changes.length} applied`}
            </span>
            <Button variant="ghost" size="sm" onClick={onUndo}>
              <ArrowCounterClockwise className="h-3.5 w-3.5" /> Undo
            </Button>
          </>
        )}
        {message.status === "discarded" && <span className="mr-auto text-xs text-muted-foreground">Discarded</span>}
        {message.status === "undone" && <span className="mr-auto text-xs text-muted-foreground">Undone</span>}
      </div>
    </div>
  );
}

export function ItineraryAssistant({
  trip,
  onUpdateEvents,
  onUpdateInfo,
  onClose,
  guard,
}: {
  trip: Trip;
  onUpdateEvents: (events: TravelEvent[]) => void;
  onUpdateInfo: (info: TripInfo[]) => void;
  onClose: () => void;
  /** Returns true when the action should be blocked (demo accounts). */
  guard?: () => boolean;
}) {
  const [messages, setMessagesState] = useState<ChatMessage[]>(() => conversations.get(trip.id) ?? []);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Latest events for apply/undo, so a proposal applied minutes later still merges onto fresh data.
  const eventsRef = useRef(trip.events);
  useEffect(() => {
    eventsRef.current = trip.events;
  }, [trip.events]);
  const infoRef = useRef(trip.info ?? []);
  useEffect(() => {
    infoRef.current = trip.info ?? [];
  }, [trip.info]);

  const setMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessagesState(prev => {
      const next = updater(prev);
      conversations.set(trip.id, next);
      return next;
    });
  };

  const lastId = messages[messages.length - 1]?.id;
  const lastRole = messages[messages.length - 1]?.role;
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    // A new reply scrolls to its top so a long proposal never hides the message above it.
    if (!loading && lastRole === "assistant" && lastRef.current) {
      box.scrollTo({ top: lastRef.current.offsetTop - 16, behavior: "smooth" });
    } else {
      box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
    }
  }, [lastId, lastRole, loading]);

  useEffect(() => {
    inputRef.current?.focus();
    return clearFocus;
  }, []);

  const suggestions = useMemo(() => suggestionsFor(trip), [trip]);

  const send = async (text: string, history: ChatMessage[] = messages) => {
    const content = text.trim();
    if (!content || loading) return;
    const userMsg: ChatMessage = { id: uid(), role: "user", text: content };
    const nextHistory = [...history, userMsg];
    setMessages(() => nextHistory);
    setDraft("");
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) throw new ApiError(401, "Sign in to use the assistant");
      const result = await apiFetch<AssistantResult>("/api/edit-itinerary", {
        method: "POST",
        auth: token,
        timeoutMs: 90_000,
        body: { trip: compactTripForAssistant(trip), messages: toHistory(nextHistory) },
      });
      setMessages(prev => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: result.reply,
          changes: result.changes,
          warnings: result.warnings,
          options: result.options,
          selected: result.changes.map(() => true),
          status: result.changes.length ? "pending" : undefined,
        },
      ]);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Something went wrong";
      setMessages(prev => [...prev, { id: uid(), role: "assistant", text: msg, error: true }]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const retry = (errorId: string) => {
    const idx = messages.findIndex(m => m.id === errorId);
    const lastUser = [...messages.slice(0, idx)].reverse().find(m => m.role === "user");
    if (!lastUser) return;
    const base = messages.slice(0, messages.indexOf(lastUser));
    void send(lastUser.text, base);
  };

  const patch = (id: string, fn: (m: ChatMessage) => Partial<ChatMessage>) =>
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...fn(m) } : m)));

  const apply = (m: ChatMessage) => {
    if (guard?.()) return;
    const changes = (m.changes ?? []).filter((_, i) => m.selected?.[i] !== false);
    if (!changes.length) return;
    clearFocus();
    const eventChanges = changes.filter(c => c.target !== "info");
    const infoChanges = changes.filter(c => c.target === "info");
    const touched = new Set(eventChanges.filter(c => c.op !== "add").map(c => c.eventId));
    const originals = eventsRef.current.filter(ev => touched.has(ev.id));
    const { events, addedIds } = applyAssistantChanges(eventsRef.current, eventChanges);
    if (eventChanges.length) onUpdateEvents(events);
    const touchedCards = new Set(infoChanges.filter(c => c.op !== "add").map(c => c.eventId));
    const infoOriginals = infoRef.current.filter(card => touchedCards.has(card.id));
    const { info, addedIds: infoAddedIds } = applyInfoChanges(infoRef.current, infoChanges);
    if (infoChanges.length) onUpdateInfo(info);
    patch(m.id, () => ({ status: "applied", undo: { originals, addedIds, infoOriginals, infoAddedIds } }));
    const changedIds = [...eventChanges.filter(c => c.op === "update").map(c => c.eventId), ...addedIds];
    // Wait a frame for the itinerary to re-render the moved/new cards before flashing them.
    requestAnimationFrame(() => requestAnimationFrame(() => markEvents(changedIds, "assistant-flash", true)));
    toast.success(changes.length === 1 ? "Change applied" : `${changes.length} changes applied`);
  };

  const undo = (m: ChatMessage) => {
    if (!m.undo) return;
    if (m.undo.originals.length || m.undo.addedIds.length) onUpdateEvents(undoAssistantChanges(eventsRef.current, m.undo.originals, m.undo.addedIds));
    if (m.undo.infoOriginals?.length || m.undo.infoAddedIds?.length) onUpdateInfo(undoInfoChanges(infoRef.current, m.undo.infoOriginals ?? [], m.undo.infoAddedIds ?? []));
    patch(m.id, () => ({ status: "undone" }));
    const restored = m.undo.originals.map(e => e.id);
    requestAnimationFrame(() => requestAnimationFrame(() => markEvents(restored, "assistant-flash", true)));
    toast.success("Changes undone");
  };

  const reset = () => {
    setMessages(() => []);
    setDraft("");
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <ChatCircleText className="h-4 w-4" weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-foreground">Trip assistant</p>
          <p className="truncate text-xs leading-tight text-muted-foreground">Nothing changes until you apply it</p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={reset} disabled={loading} className="text-muted-foreground">
            <NotePencil className="h-4 w-4" /> <span className="hidden sm:inline">New chat</span>
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close assistant" className="text-muted-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {messages.length === 0 && !loading ? (
          <div className="mx-auto flex max-w-sm flex-col pt-4">
            <h3 className="text-base font-semibold text-foreground">What should change?</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Describe edits in your own words. The assistant reads the whole itinerary, and you approve every change.
            </p>
            <div className="mt-5">
              <TripSummary trip={trip} />
            </div>
            <div className="mt-6 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Try</p>
              {suggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3.5 py-2.5 text-left text-sm text-foreground transition-colors hover:border-brand/40 hover:bg-brand/5"
                >
                  <span className="min-w-0">{s}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((m, idx) => {
              const isLast = idx === messages.length - 1;
              return m.role === "user" ? (
                <div key={m.id} ref={isLast ? lastRef : undefined} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-md bg-secondary px-3.5 py-2 text-sm leading-relaxed text-foreground">
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={m.id} ref={isLast ? lastRef : undefined} className="space-y-3">
                  <p className={cn("whitespace-pre-wrap text-sm leading-relaxed", m.error ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                    {m.text}
                  </p>
                  {m.error && (
                    <Button variant="outline" size="sm" onClick={() => retry(m.id)} disabled={loading}>
                      <ArrowCounterClockwise className="h-3.5 w-3.5" /> Try again
                    </Button>
                  )}
                  {isLast && !loading && m.options && m.options.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.options.map(o => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => void send(o)}
                          className="rounded-lg border border-border bg-background px-3 py-1.5 text-left text-sm text-foreground shadow-xs transition-colors hover:border-brand/40 hover:bg-brand/5"
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.changes && m.changes.length > 0 && (
                    <ProposalCard
                      message={m}
                      trip={trip}
                      onToggle={(i, v) => patch(m.id, x => ({ selected: (x.selected ?? []).map((s, j) => (j === i ? v : s)) }))}
                      onToggleAll={v => patch(m.id, x => ({ selected: (x.changes ?? []).map(() => v) }))}
                      onApply={() => apply(m)}
                      onDiscard={() => patch(m.id, () => ({ status: "discarded" }))}
                      onUndo={() => undo(m)}
                    />
                  )}
                </div>
              );
            })}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <Spinner className="size-3.5 text-brand" />
                <span className="animate-pulse">Reading the itinerary</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border p-3">
        <form
          onSubmit={e => { e.preventDefault(); void send(draft); }}
          className="flex items-end gap-2 rounded-xl border border-border bg-background p-1.5 pl-3 shadow-sm transition-[border-color,box-shadow] focus-within:border-brand/50 focus-within:ring-3 focus-within:ring-brand/15"
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={2000}
            placeholder="Move the welcome dinner to 8pm…"
            aria-label="Message the trip assistant"
            className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <Button
            type="submit"
            size="icon-sm"
            disabled={!draft.trim() || loading}
            aria-label="Send"
            className="rounded-full disabled:border-border disabled:bg-background disabled:text-muted-foreground disabled:opacity-100"
          >
            <ArrowUp className="h-4 w-4" weight="bold" />
          </Button>
        </form>
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
          Enter to send, Shift + Enter for a new line
        </p>
      </div>
    </div>
  );
}
