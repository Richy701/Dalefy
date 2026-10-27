import { useState, useMemo, useEffect, useCallback } from "react";
import { PaperPlaneTilt, SpinnerGap, Check, Warning, BellSlash } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { apiFetch, ApiError, getIdToken } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Trip, TravelEvent } from "@/types";

type Audience = "all" | "people" | "event";
interface Recipient { key: string; name: string; reachable: boolean }
interface Result { key: string; name: string; status: "sent" | "failed" | "no_notifications" }

const MAX_BODY = 1000;

function dayLabel(date: string) {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** "08:05" minus two hours, for "be at the airport by" */
function hoursBefore(time: string, hours: number) {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return "";
  const mins = (Number(m[1]) * 60 + Number(m[2]) - hours * 60 + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

const eventLabel = (ev: TravelEvent) => `${dayLabel(ev.date)}, ${ev.time ? `${ev.time} ` : ""}${ev.type === "flight" && ev.flightNum ? `${ev.flightNum} ` : ""}${ev.title}`;

/** Starters written from the itinerary: the next few things on the trip, plus the usual on-the-ground ones */
function quickMessages(trip: Trip): { label: string; title: string; body: string; eventId?: string }[] {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...trip.events].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const upcoming = sorted.filter(e => e.date >= today);
  const pick = (upcoming.length ? upcoming : sorted).slice(0, 4);
  const fromEvents = pick.map(ev => {
    const at = ev.time ? `at ${ev.time}` : "(time to be confirmed)";
    if (ev.type === "flight") {
      const route = ev.depAirport && ev.arrAirport ? ` from ${ev.depAirport} to ${ev.arrAirport}` : "";
      const by = ev.time ? ` Please be at the airport by ${hoursBefore(ev.time, 2)}.` : "";
      return { label: `Flight ${ev.flightNum || ev.title}`, title: `Flight ${ev.flightNum || ""} on ${dayLabel(ev.date)}`.replace("  ", " "), body: `Your flight${route} departs ${at}.${by}`, eventId: ev.id };
    }
    if (ev.type === "transfer") return { label: ev.title, title: "Your transfer", body: `${ev.title} leaves ${at} on ${dayLabel(ev.date)}. Please be in the lobby 10 minutes early.`, eventId: ev.id };
    if (ev.type === "hotel") return { label: `Check in, ${ev.title}`, title: ev.title, body: `Check-in at ${ev.title} is from ${ev.checkin || ev.time || "the afternoon"} on ${dayLabel(ev.date)}.`, eventId: ev.id };
    return { label: ev.title, title: ev.title, body: `${ev.title} starts ${at} on ${dayLabel(ev.date)}${ev.location ? `, at ${ev.location}` : ""}.`, eventId: ev.id };
  });
  return [
    ...fromEvents,
    { label: "Meet in the lobby", title: "Meet in the lobby", body: "Please meet in the hotel lobby in 15 minutes." },
    { label: "Running late", title: "Running a little late", body: "We're running about 15 minutes behind. We'll update you shortly." },
  ];
}

export interface MessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trips this can be sent about; more than one shows a trip picker */
  trips: Trip[];
  initialTripId?: string;
  /** App accounts to start with selected (opens on "Choose people") */
  initialPeople?: string[];
  onSent?: () => void;
}

export function MessageDialog({ open, onOpenChange, trips, initialTripId, initialPeople, onSent }: MessageDialogProps) {
  const [tripId, setTripId] = useState(initialTripId ?? trips[0]?.id ?? "");
  const trip = trips.find(t => t.id === tripId) ?? trips[0];
  const [audience, setAudience] = useState<Audience>(initialPeople?.length ? "people" : "all");
  const [people, setPeople] = useState<Set<string>>(new Set(initialPeople ?? []));
  const [audienceEvent, setAudienceEvent] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("trip");
  const [urgent, setUrgent] = useState(false);
  // Fetched results remember what they were for, so a stale answer never shows against a new choice
  const [rosterFor, setRosterFor] = useState<{ tripId: string; list: Recipient[] } | null>(null);
  const [eventReach, setEventReach] = useState<{ key: string; list: Recipient[] } | null>(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState("");

  const post = useCallback(async <T,>(payload: Record<string, unknown>) => {
    const idToken = await getIdToken();
    if (!idToken) throw new ApiError(401, "Sign in again to send messages");
    return apiFetch<T>("/api/send-push", { method: "POST", auth: idToken, body: payload });
  }, []);

  // Everyone on the trip, and who can get a notification, for the people picker
  useEffect(() => {
    if (!open || !tripId) return;
    let cancelled = false;
    post<{ recipients: Recipient[] }>({ tripId, to: "all", dryRun: true })
      .then(r => { if (!cancelled) setRosterFor({ tripId, list: r.recipients }); })
      .catch(() => { if (!cancelled) setRosterFor({ tripId, list: [] }); });
    return () => { cancelled = true; };
  }, [open, tripId, post]);
  const roster = rosterFor?.tripId === tripId ? rosterFor.list : null;

  const to = audience === "all" ? "all" : audience === "people" ? { people: [...people] } : audienceEvent ? { eventId: audienceEvent } : null;

  // Who is on an event is worked out by the server, from who the event is assigned to
  const eventKey = `${tripId}:${audienceEvent}`;
  useEffect(() => {
    if (!open || audience !== "event" || !audienceEvent) return;
    let cancelled = false;
    post<{ recipients: Recipient[] }>({ tripId, to: { eventId: audienceEvent }, dryRun: true })
      .then(r => { if (!cancelled) setEventReach({ key: eventKey, list: r.recipients }); })
      .catch(() => { if (!cancelled) setEventReach({ key: eventKey, list: [] }); });
    return () => { cancelled = true; };
  }, [open, audience, audienceEvent, tripId, eventKey, post]);

  // Who this would reach right now
  const reach = !to ? null
    : audience === "all" ? roster
    : audience === "people" ? (roster?.filter(r => people.has(r.key)) ?? null)
    : eventReach?.key === eventKey ? eventReach.list : null;

  const events = useMemo(() => [...(trip?.events ?? [])].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)), [trip]);
  const days = useMemo(() => [...new Set(events.map(e => e.date).filter(Boolean))], [events]);
  const starters = useMemo(() => (trip ? quickMessages(trip) : []), [trip]);

  const targetPayload = target.startsWith("event:") ? { eventId: target.slice(6) }
    : target.startsWith("day:") ? { date: target.slice(4) }
    : target.startsWith("info:") ? { infoId: target.slice(5) } : undefined;

  const reachable = reach?.filter(r => r.reachable).length ?? 0;
  const canSend = !!trip && !!to && !!body.trim() && (reach?.length ?? 0) > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true); setError("");
    try {
      const r = await post<{ results: Result[] }>({ tripId, to, title: title.trim(), body: body.trim(), target: targetPayload, urgent });
      setResults(r.results);
      onSent?.();
    } catch (err) {
      setError(err instanceof ApiError && err.status !== 0 ? err.message : "Couldn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const targetItems = [
    { value: "trip", label: "The trip" },
    ...events.map(e => ({ value: `event:${e.id}`, label: eventLabel(e) })),
    ...days.map(d => ({ value: `day:${d}`, label: `The day, ${dayLabel(d)}` })),
    ...(trip?.info ?? []).map(i => ({ value: `info:${i.id}`, label: `Trip info, ${i.title}` })),
  ];
  const eventItems = events.map(e => ({ value: e.id, label: eventLabel(e) }));
  const tripItems = trips.map(t => ({ value: t.id, label: t.name }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground">Message travellers</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            A notification on their phone, and a copy in the app's inbox even if notifications are off.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Sent to {results.filter(r => r.status === "sent").length} of {results.length}. Everyone sees it in the app's inbox next time they open it.
            </p>
            <div className="rounded-xl border border-border divide-y divide-border">
              {results.map(r => (
                <div key={r.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm text-foreground truncate">{r.name || "Unnamed traveller"}</span>
                  {r.status === "sent" ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Notified</span>
                  ) : r.status === "no_notifications" ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><BellSlash className="h-3.5 w-3.5" /> Notifications off, in their inbox</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><Warning className="h-3.5 w-3.5" /> Didn't go through, in their inbox</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setResults(null); setBody(""); setTitle(""); }}>Send another</Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-[1fr_15rem]">
            <div className="space-y-4 min-w-0">
              {trips.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Trip</Label>
                  <Select value={tripId} onValueChange={v => { if (v) { setTripId(v); setPeople(new Set()); setAudienceEvent(""); setTarget("trip"); } }} items={tripItems}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{tripItems.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">To</Label>
                <Tabs value={audience} onValueChange={v => setAudience(v as Audience)}>
                  <TabsList>
                    <TabsTrigger value="all">Everyone</TabsTrigger>
                    <TabsTrigger value="people">Choose people</TabsTrigger>
                    <TabsTrigger value="event">On an event</TabsTrigger>
                  </TabsList>
                </Tabs>
                {audience === "people" && (
                  <div className="rounded-xl border border-border max-h-44 overflow-y-auto divide-y divide-border">
                    {roster === null ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Loading who's on the trip...</p>
                    ) : roster.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No one has joined this trip in the app yet.</p>
                    ) : roster.map(r => (
                      <label key={r.key} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-secondary">
                        <Checkbox
                          checked={people.has(r.key)}
                          onCheckedChange={c => setPeople(prev => { const next = new Set(prev); if (c) next.add(r.key); else next.delete(r.key); return next; })}
                        />
                        <span className="text-sm text-foreground flex-1 truncate">{r.name || "Unnamed traveller"}</span>
                        {!r.reachable && <span className="text-[11px] text-muted-foreground">Notifications off</span>}
                      </label>
                    ))}
                  </div>
                )}
                {audience === "event" && (
                  <Select value={audienceEvent} onValueChange={v => setAudienceEvent(v ?? "")} items={eventItems}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Pick an event" /></SelectTrigger>
                    <SelectContent>{eventItems.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  {!to ? "Pick who it's for."
                    : reach === null ? "Checking who it reaches..."
                    : reach.length === 0 ? "No one in the app matches yet."
                    : `${reach.length} ${reach.length === 1 ? "person" : "people"}, ${reachable} with notifications on. The rest see it in the app's inbox.`}
                </p>
              </div>

              {starters.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Quick messages</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {starters.map(s => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => { setTitle(s.title); setBody(s.body); if (s.eventId) setTarget(`event:${s.eventId}`); }}
                        className="h-7 px-2.5 rounded-lg bg-secondary text-xs text-foreground hover:bg-brand/10 hover:text-brand transition-colors max-w-[14rem] truncate"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="msg-title" className="text-xs font-medium text-muted-foreground">Title</Label>
                <Input id="msg-title" value={title} onChange={e => setTitle(e.target.value.slice(0, 200))} placeholder={trip?.name ?? "Trip name"} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="msg-body" className="text-xs font-medium text-muted-foreground">Message</Label>
                  <span className="text-[11px] text-muted-foreground">{body.length}/{MAX_BODY}</span>
                </div>
                <Textarea id="msg-body" value={body} onChange={e => setBody(e.target.value.slice(0, MAX_BODY))} rows={4} placeholder="What do they need to know?" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs font-medium text-muted-foreground">Tapping it opens</Label>
                  <Select value={target} onValueChange={v => setTarget(v ?? "trip")} items={targetItems}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent align="start" className="w-[min(28rem,var(--available-width))]">{targetItems.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="msg-urgent" className="text-xs font-medium text-muted-foreground">Urgent</Label>
                  <div className="flex items-center gap-2.5 h-9">
                    <Switch id="msg-urgent" checked={urgent} onCheckedChange={setUrgent} />
                    <span className="text-xs text-muted-foreground">Breaks through Focus</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Lock screen preview */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Preview</Label>
              <div className="rounded-xl bg-secondary p-3">
                <div className="rounded-xl bg-card shadow-sm p-3">
                  <div className="flex items-start gap-2.5">
                    <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[13px] font-semibold text-foreground truncate">{title.trim() || trip?.name || "Trip name"}</p>
                        <span className="text-[11px] text-muted-foreground shrink-0">now</span>
                      </div>
                      {title.trim() && trip?.name && title.trim() !== trip.name && <p className="text-[12px] text-foreground truncate">{trip.name}</p>}
                      <p className={cn("text-[12px] whitespace-pre-line line-clamp-4", body.trim() ? "text-foreground" : "text-muted-foreground")}>
                        {body.trim() || "Your message"}
                      </p>
                    </div>
                  </div>
                </div>
                {urgent && <p className="mt-2 text-[11px] text-muted-foreground">Marked time sensitive</p>}
              </div>
            </div>

            <div className="md:col-span-2 flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-red-600 dark:text-red-400 min-h-4">{error}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={send} disabled={!canSend} className="gap-2">
                  {sending ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <PaperPlaneTilt className="h-4 w-4" />}
                  {sending ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
