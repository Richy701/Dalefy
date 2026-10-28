import type { TravelEvent, Trip, TripInfo } from "@/types";

export type AssistantFieldKey =
  | "type" | "date" | "time" | "endTime" | "endDate" | "title"
  | "location" | "description" | "notes" | "checkin" | "checkout"
  | "body" | "assignedTo" | "airline" | "flightNum" | "depAirport" | "arrAirport" | "transferType" | "supplier";

/** assignedTo is a list of traveller ids (empty means everyone); every other field is text */
export type AssistantFields = { [K in Exclude<AssistantFieldKey, "assignedTo">]: string | null } & { assignedTo: string[] | null };

export interface AssistantChange {
  /** An itinerary event, or a Trip info card */
  target?: "event" | "info";
  op: "add" | "update" | "delete";
  eventId: string;
  summary: string;
  fields: AssistantFields;
}

export interface AssistantResult {
  reply: string;
  changes: AssistantChange[];
  warnings: string[];
  options: string[];
}

const TEXT_CAP = 600;

const cap = (s: string | undefined) =>
  s && s.length > TEXT_CAP ? `${s.slice(0, TEXT_CAP)}…` : s;

/** Trip shape sent to the assistant: text fields only, no media, documents or coordinates. */
export function compactTripForAssistant(trip: Trip) {
  return {
    name: trip.name,
    destination: trip.destination,
    start: trip.start,
    end: trip.end,
    travelers: (trip.travelers ?? []).map(t => ({ id: t.id, name: t.name })),
    events: trip.events.map(ev => ({
      id: ev.id,
      type: ev.type,
      date: ev.date,
      time: ev.time,
      endTime: ev.endTime,
      endDate: ev.endDate,
      title: ev.title,
      location: ev.location,
      description: cap(ev.description),
      notes: cap(ev.notes),
      checkin: ev.checkin,
      checkout: ev.checkout,
      supplier: ev.supplier,
      confNumber: ev.confNumber,
      airline: ev.airline,
      flightNum: ev.flightNum,
      depAirport: ev.depAirport,
      arrAirport: ev.arrAirport,
      transferType: ev.transferType,
      assignedTo: ev.assignedTo?.length ? ev.assignedTo : undefined,
    })),
    info: (trip.info ?? []).map(i => ({ id: i.id, title: i.title, body: i.body && i.body.length > 2000 ? `${i.body.slice(0, 2000)}…` : i.body, leaderOnly: i.leaderOnly || undefined })),
  };
}

const isInfo = (c: AssistantChange) => c.target === "info";

function setFields(ev: TravelEvent, fields: AssistantFields): TravelEvent {
  const next: TravelEvent = { ...ev };
  for (const [key, value] of Object.entries(fields) as [AssistantFieldKey, string | string[] | null][]) {
    if (value == null || key === "body") continue;
    if (key === "type") next.type = value as TravelEvent["type"];
    else if (key === "assignedTo") {
      // An empty list means everyone on the trip, which is how the trip stores it
      if ((value as string[]).length) next.assignedTo = value as string[]; else delete next.assignedTo;
    } else (next as unknown as Record<string, string>)[key] = value as string;
  }
  // A new place means the old pin is wrong; drop it so the map doesn't lie.
  if (fields.location != null && fields.location !== ev.location) delete next.locationCoords;
  return next;
}

/** Apply accepted changes to an event list. Unknown event ids are skipped. */
export function applyAssistantChanges(events: TravelEvent[], changes: AssistantChange[]) {
  let next = [...events];
  const stamp = Date.now();
  const addedIds: string[] = [];
  changes.forEach((c, i) => {
    if (isInfo(c)) return;
    if (c.op === "delete") {
      next = next.filter(ev => ev.id !== c.eventId);
    } else if (c.op === "update") {
      next = next.map(ev => (ev.id === c.eventId ? setFields(ev, c.fields) : ev));
    } else {
      const base: TravelEvent = {
        id: `${stamp}${i}`,
        type: "activity",
        date: "",
        time: "TBD",
        title: "",
        location: "",
      };
      next.push(setFields(base, c.fields));
      addedIds.push(base.id);
    }
  });
  return { events: next, addedIds };
}

/**
 * Reverse an applied batch against the CURRENT events, so edits made after the
 * batch (by hand or by teammates) survive the undo.
 */
export function undoAssistantChanges(
  events: TravelEvent[],
  originals: TravelEvent[],
  addedIds: string[],
): TravelEvent[] {
  const byId = new Map(originals.map(ev => [ev.id, ev]));
  const added = new Set(addedIds);
  const restored = events
    .filter(ev => !added.has(ev.id))
    .map(ev => byId.get(ev.id) ?? ev);
  const present = new Set(restored.map(ev => ev.id));
  return [...restored, ...originals.filter(ev => !present.has(ev.id))];
}

/** Apply accepted Trip info changes. Only a card's title and body change. */
export function applyInfoChanges(info: TripInfo[], changes: AssistantChange[]) {
  let next = [...info];
  const stamp = Date.now();
  const addedIds: string[] = [];
  changes.filter(isInfo).forEach((c, i) => {
    if (c.op === "delete") next = next.filter(card => card.id !== c.eventId);
    else if (c.op === "update") {
      next = next.map(card => card.id !== c.eventId ? card : {
        ...card,
        ...(c.fields.title != null ? { title: c.fields.title } : {}),
        ...(c.fields.body != null ? { body: c.fields.body } : {}),
      });
    } else {
      const id = `info-${stamp}-${i}`;
      next.push({ id, title: c.fields.title ?? "", body: c.fields.body ?? "" });
      addedIds.push(id);
    }
  });
  return { info: next, addedIds };
}

/** Reverse an applied batch of info changes against the current cards, like undoAssistantChanges */
export function undoInfoChanges(info: TripInfo[], originals: TripInfo[], addedIds: string[]): TripInfo[] {
  const byId = new Map(originals.map(card => [card.id, card]));
  const added = new Set(addedIds);
  const restored = info.filter(card => !added.has(card.id)).map(card => byId.get(card.id) ?? card);
  const present = new Set(restored.map(card => card.id));
  return [...restored, ...originals.filter(card => !present.has(card.id))];
}

export const FIELD_LABELS: Record<AssistantFieldKey, string> = {
  type: "Type",
  date: "Date",
  time: "Time",
  endTime: "End time",
  endDate: "End date",
  title: "Title",
  location: "Location",
  description: "Description",
  notes: "Notes",
  checkin: "Check-in",
  checkout: "Check-out",
  body: "Text",
  assignedTo: "Who",
  airline: "Airline",
  flightNum: "Flight",
  depAirport: "From",
  arrAirport: "To",
  transferType: "Transfer",
  supplier: "Supplier",
};

/**
 * Field-level before/after pairs for an update of an event or an info card, skipping fields that didn't
 * really change. Who is on an event reads as names ("Everyone" for the whole group).
 */
export function changedFields(item: TravelEvent | TripInfo | undefined, fields: AssistantFields, names?: Map<string, string>) {
  const record = item as unknown as Record<string, unknown> | undefined;
  const who = (ids: unknown) => {
    const list = Array.isArray(ids) ? ids as string[] : [];
    return list.length ? list.map(id => names?.get(id) ?? "Someone").join(", ") : "Everyone";
  };
  return (Object.keys(FIELD_LABELS) as AssistantFieldKey[])
    .filter(k => fields[k] != null)
    .map(k => k === "assignedTo"
      ? { key: k, label: FIELD_LABELS[k], before: who(record?.assignedTo), after: who(fields.assignedTo) }
      : { key: k, label: FIELD_LABELS[k], before: (record?.[k] as string | undefined) ?? "", after: fields[k] as string })
    .filter(d => d.before !== d.after);
}
