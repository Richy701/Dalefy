import type { TravelEvent, Trip } from "@/types";

export type AssistantFieldKey =
  | "type" | "date" | "time" | "endTime" | "endDate" | "title"
  | "location" | "description" | "notes" | "checkin" | "checkout";

export type AssistantFields = { [K in AssistantFieldKey]: string | null };

export interface AssistantChange {
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
  };
}

function setFields(ev: TravelEvent, fields: AssistantFields): TravelEvent {
  const next: TravelEvent = { ...ev };
  for (const [key, value] of Object.entries(fields) as [AssistantFieldKey, string | null][]) {
    if (value == null) continue;
    if (key === "type") next.type = value as TravelEvent["type"];
    else (next as unknown as Record<string, string>)[key] = value;
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
};

/** Field-level before/after pairs for an update, skipping fields that didn't really change. */
export function changedFields(ev: TravelEvent | undefined, fields: AssistantFields) {
  return (Object.keys(FIELD_LABELS) as AssistantFieldKey[])
    .filter(k => fields[k] != null && fields[k] !== ((ev as unknown as Record<string, string | undefined>)?.[k] ?? ""))
    .map(k => ({
      key: k,
      label: FIELD_LABELS[k],
      before: ((ev as unknown as Record<string, string | undefined>)?.[k]) ?? "",
      after: fields[k] as string,
    }));
}
