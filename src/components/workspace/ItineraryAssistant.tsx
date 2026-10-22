import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowRight, ArrowCounterClockwise, ChatCircleText, Check, NotePencil, X } from "@phosphor-icons/react";
import { format, parseISO, isValid } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CategoryDot } from "@/components/ui/category-dot";
import { apiFetch, getIdToken, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  applyAssistantChanges,
  changedFields,
  compactTripForAssistant,
  undoAssistantChanges,
  type AssistantChange,
  type AssistantResult,
} from "@/lib/itineraryAssistant";
import type { TravelEvent, Trip } from "@/types";

type ProposalStatus = "pending" | "applied" | "discarded" | "undone";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  changes?: AssistantChange[];
  status?: ProposalStatus;
  undo?: { originals: TravelEvent[]; addedIds: string[] };
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
      const outcome = m.status === "applied" ? "The agent applied them."
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
  if (key === "type") return value.charAt(0).toUpperCase() + value.slice(1);
  return value;
}

function eventMeta(ev: Pick<TravelEvent, "date" | "time"> | undefined) {
  if (!ev) return "";
  const date = prettyValue("date", ev.date);
  return [date, ev.time && ev.time !== "TBD" ? ev.time : ""].filter(Boolean).join(", ");
}

function suggestionsFor(trip: Trip) {
  const out: string[] = [];
  const dinner = trip.events.find(e => e.type === "dining");
  if (dinner) out.push(`Push ${dinner.title} back an hour`);
  const days = new Set(trip.events.map(e => e.date)).size;
  if (days >= 3) out.push("Swap day 2 and day 3");
  out.push("Add a free afternoon on the last day");
  out.push("Which bookings are missing a confirmation number?");
  return out.slice(0, 4);
}

const OP_STYLE: Record<AssistantChange["op"], { label: string; className: string }> = {
  add: { label: "New", className: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" },
  update: { label: "Edit", className: "text-amber-700 dark:text-amber-400 bg-amber-500/10" },
  delete: { label: "Remove", className: "text-red-600 dark:text-red-400 bg-red-500/10" },
};

function ChangeRow({ change, event }: { change: AssistantChange; event?: TravelEvent }) {
  const type = (change.fields.type ?? event?.type ?? "activity") as TravelEvent["type"];
  const op = OP_STYLE[change.op];
  const diffs = change.op === "update" ? changedFields(event, change.fields) : [];
  const addedMeta = change.op === "add"
    ? eventMeta({ date: change.fields.date ?? "", time: change.fields.time ?? "" })
    : "";

  return (
    <li className="flex gap-3 px-3.5 py-3">
      <CategoryDot type={type} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm font-medium text-foreground leading-snug", change.op === "delete" && "text-muted-foreground")}>
            {change.summary}
          </p>
          <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", op.className)}>
            {op.label}
          </span>
        </div>

        {change.op === "delete" && event && (
          <p className="mt-1 text-xs text-muted-foreground line-through decoration-muted-foreground/50">
            {event.title}{eventMeta(event) ? `, ${eventMeta(event)}` : ""}
          </p>
        )}

        {change.op === "add" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {[change.fields.title, addedMeta, change.fields.location].filter(Boolean).join(", ")}
          </p>
        )}

        {diffs.length > 0 && (
          <dl className="mt-2 space-y-1.5">
            {diffs.map(d => {
              const long = d.key === "description" || d.key === "notes";
              return (
                <div key={d.key} className="grid grid-cols-[4.5rem_1fr] gap-2 text-xs">
                  <dt className="text-muted-foreground pt-px">{d.label}</dt>
                  <dd className={cn("min-w-0", long ? "space-y-0.5" : "flex flex-wrap items-center gap-x-1.5")}>
                    {d.before && (
                      <span className={cn("text-muted-foreground line-through decoration-muted-foreground/50", long && "block line-clamp-1")}>
                        {prettyValue(d.key, d.before)}
                      </span>
                    )}
                    {d.before && !long && <ArrowRight className="h-3 w-3 text-muted-foreground/70 shrink-0" />}
                    <span className={cn("text-foreground font-medium", long && "block line-clamp-3 font-normal")}>
                      {prettyValue(d.key, d.after)}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </li>
  );
}

function ProposalCard({
  message,
  events,
  onApply,
  onDiscard,
  onUndo,
}: {
  message: ChatMessage;
  events: TravelEvent[];
  onApply: () => void;
  onDiscard: () => void;
  onUndo: () => void;
}) {
  const changes = message.changes ?? [];
  const byId = useMemo(() => new Map(events.map(e => [e.id, e])), [events]);
  // Once applied, the live event already carries the new values; diff against the snapshot instead.
  const originals = useMemo(() => new Map((message.undo?.originals ?? []).map(e => [e.id, e])), [message.undo]);
  const settled = message.status !== "pending";

  return (
    <div className={cn("rounded-xl border border-border bg-background shadow-sm overflow-hidden transition-opacity", (message.status === "discarded" || message.status === "undone") && "opacity-60")}>
      <div className="flex items-center justify-between px-3.5 pt-3 pb-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {changes.length} {changes.length === 1 ? "change" : "changes"}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {changes.map((c, i) => (
          <ChangeRow key={i} change={c} event={originals.get(c.eventId) ?? byId.get(c.eventId)} />
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/40 px-3 py-2.5">
        {!settled && (
          <>
            <Button variant="ghost" size="sm" onClick={onDiscard}>Discard</Button>
            <Button size="sm" onClick={onApply} className="bg-brand text-black hover:bg-brand/85 font-semibold">
              <Check className="h-3.5 w-3.5" weight="bold" />
              {changes.length === 1 ? "Apply change" : `Apply ${changes.length} changes`}
            </Button>
          </>
        )}
        {message.status === "applied" && (
          <>
            <span className="mr-auto flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" weight="bold" /> Applied to the itinerary
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
  onClose,
  guard,
}: {
  trip: Trip;
  onUpdateEvents: (events: TravelEvent[]) => void;
  onClose: () => void;
  /** Returns true when the action should be blocked (demo accounts). */
  guard?: () => boolean;
}) {
  const [messages, setMessagesState] = useState<ChatMessage[]>(() => conversations.get(trip.id) ?? []);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Latest events for apply/undo, so a proposal applied minutes later still merges onto fresh data.
  const eventsRef = useRef(trip.events);
  useEffect(() => {
    eventsRef.current = trip.events;
  }, [trip.events]);

  const setMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessagesState(prev => {
      const next = updater(prev);
      conversations.set(trip.id, next);
      return next;
    });
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
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

  const setStatus = (id: string, patch: Partial<ChatMessage>) =>
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));

  const apply = (m: ChatMessage) => {
    if (guard?.()) return;
    const changes = m.changes ?? [];
    const touched = new Set(changes.filter(c => c.op !== "add").map(c => c.eventId));
    const originals = eventsRef.current.filter(ev => touched.has(ev.id));
    const { events, addedIds } = applyAssistantChanges(eventsRef.current, changes);
    onUpdateEvents(events);
    setStatus(m.id, { status: "applied", undo: { originals, addedIds } });
    toast.success(changes.length === 1 ? "Change applied" : `${changes.length} changes applied`);
  };

  const undo = (m: ChatMessage) => {
    if (!m.undo) return;
    onUpdateEvents(undoAssistantChanges(eventsRef.current, m.undo.originals, m.undo.addedIds));
    setStatus(m.id, { status: "undone" });
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
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        {messages.length === 0 && !loading ? (
          <div className="mx-auto flex max-w-sm flex-col pt-6">
            <h3 className="text-base font-semibold text-foreground">What should change?</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Describe edits in your own words. You'll see every change before it touches {trip.name}.
            </p>
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
            {messages.map(m =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-md bg-secondary px-3.5 py-2 text-sm leading-relaxed text-foreground">
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={m.id} className="space-y-3">
                  <p className={cn("whitespace-pre-wrap text-sm leading-relaxed", m.error ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                    {m.text}
                  </p>
                  {m.error && (
                    <Button variant="outline" size="sm" onClick={() => retry(m.id)} disabled={loading}>
                      <ArrowCounterClockwise className="h-3.5 w-3.5" /> Try again
                    </Button>
                  )}
                  {m.changes && m.changes.length > 0 && (
                    <ProposalCard
                      message={m}
                      events={trip.events}
                      onApply={() => apply(m)}
                      onDiscard={() => setStatus(m.id, { status: "discarded" })}
                      onUndo={() => undo(m)}
                    />
                  )}
                </div>
              ),
            )}
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
            className="rounded-full bg-brand text-black hover:bg-brand/85 disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100"
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
