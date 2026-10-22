/**
 * Shared core for the itinerary chat editor.
 * Imported by BOTH api/edit-itinerary.ts (Vercel) and the vite dev middleware
 * (via ssrLoadModule of the handler) so prompt and response shape never drift.
 *
 * Claude never writes to the trip. It returns a reply plus a list of proposed
 * changes; the client shows them as a diff and only applies them on Accept.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ParseHttpError } from "./_parseItineraryCore.js";

export const EDIT_MODEL = "claude-sonnet-5-5";

const MAX_EVENTS = 400;
const MAX_HISTORY = 20;
const MAX_MESSAGE_CHARS = 4000;

const SYSTEM_PROMPT = `You are the itinerary assistant inside a travel agency's trip planning tool. A travel agent is editing one trip and asks you, in plain language, to change it or answer questions about it.

You are given the current trip as JSON in the latest user message. Each event has an "id". You cannot save anything yourself: you propose changes, and the agent reviews them and presses Accept or Discard.

How to respond:
- "reply": a short, friendly message to the agent (1-3 sentences). Say what you are proposing, or answer their question. Do not repeat every field you changed, the agent sees a diff.
- "changes": the edits to propose. Empty when the agent is only asking a question, when you need to ask a clarifying question, or when nothing should change.

Each change:
- op "update": set eventId to an existing event id. In "fields", set ONLY the fields that change; every other field must be null.
- op "add": eventId is an empty string. In "fields", set type, date, time and title at minimum, plus anything else you know. Unknown fields are null.
- op "delete": set eventId; all fields null.
- "summary": one short line describing the change in plain words, e.g. "Move dinner at Nobu to 8:00 PM".

Field formats:
- date, checkin, checkout, endDate: YYYY-MM-DD
- time, endTime: "H:MM AM" / "H:MM PM" (12-hour), or "TBD" for time when unknown
- type: flight | hotel | dining | activity | transfer
- Hotels: "date" equals the check-in date; set checkin and checkout. "time" is check-in time, "endTime" is check-out time.
- description is public copy travelers read. notes are internal agent notes (confirmation numbers, supplier contacts).

Rules:
- Only touch what the agent asked for. Never rewrite descriptions or notes unless asked.
- If a request could match more than one event (for example "the dinner" when there are three), do not guess: ask which one and propose no changes.
- If information you need is missing (for example a pickup time for a new transfer), ask for it rather than inventing it. Reasonable defaults are fine when the agent says so ("make something up", "use a sensible time").
- When moving an event to another day, keep its time unless told otherwise. When the agent shifts a whole day or the whole trip, update every affected event, including hotel checkin/checkout.
- New events must fall inside or adjacent to the trip dates unless the agent says otherwise; if not, mention it in the reply.
- Never invent confirmation numbers, prices, flight numbers, or supplier contacts.
- Use "today" (given in the message) to resolve relative dates like "tomorrow".
- Write warm, concise, professional copy. Never use em dashes; use commas, hyphens, or periods instead.`;

const FieldsSchema = z.object({
  type: z.enum(["flight", "hotel", "dining", "activity", "transfer"]).nullable(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  endTime: z.string().nullable(),
  endDate: z.string().nullable(),
  title: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  checkin: z.string().nullable(),
  checkout: z.string().nullable(),
});

const EditResultSchema = z.object({
  reply: z.string(),
  changes: z.array(z.object({
    op: z.enum(["add", "update", "delete"]),
    eventId: z.string(),
    summary: z.string(),
    fields: FieldsSchema,
  })),
});

export type EditFields = z.infer<typeof FieldsSchema>;
export type EditResult = z.infer<typeof EditResultSchema>;

export interface EditTripInput {
  name?: string;
  destination?: string;
  start?: string;
  end?: string;
  travelers?: Array<{ id: string; name: string }>;
  events: Array<Record<string, unknown> & { id: string }>;
}

export interface EditInput {
  trip: EditTripInput;
  /** Prior turns as plain text, oldest first. The last entry must be the user's new message. */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(v: string | null): string | null {
  if (v == null) return null;
  return DATE_RE.test(v.trim()) ? v.trim() : null;
}

export function validateEditInput(body: unknown): EditInput {
  const { trip, messages } = (body ?? {}) as { trip?: EditTripInput; messages?: unknown };
  if (!trip || typeof trip !== "object" || !Array.isArray(trip.events)) {
    throw new ParseHttpError(400, "Missing trip");
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ParseHttpError(400, "Missing messages");
  }
  if (trip.events.length > MAX_EVENTS) {
    throw new ParseHttpError(413, "This trip has too many events for the assistant");
  }
  const clean = (messages as Array<{ role?: unknown; content?: unknown }>)
    .slice(-MAX_HISTORY)
    .filter((m): m is EditInput["messages"][number] =>
      (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  // The API requires the conversation to start with a user turn.
  while (clean.length && clean[0].role !== "user") clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== "user") {
    throw new ParseHttpError(400, "The last message must come from the user");
  }
  return { trip, messages: clean };
}

export async function runEdit(client: Anthropic, input: EditInput): Promise<EditResult & { _usage: { input_tokens: number; output_tokens: number } }> {
  const today = new Date().toISOString().slice(0, 10);
  const history = input.messages.slice(0, -1);
  const latest = input.messages[input.messages.length - 1];

  // The trip snapshot rides on the newest user turn only, so earlier turns stay
  // short and the system prefix stays byte-identical for caching.
  const tripJson = JSON.stringify(input.trip);
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: `Today's date: ${today}.\n\nCurrent trip:\n${tripJson}\n\nAgent's request:\n${latest.content}`,
    },
  ];

  const message = await client.messages.parse({
    model: EDIT_MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages,
    output_config: { effort: "medium", format: zodOutputFormat(EditResultSchema) },
  });

  if (message.stop_reason === "refusal") {
    throw new ParseHttpError(422, "The assistant couldn't help with that request");
  }
  if (message.stop_reason === "max_tokens") {
    throw new ParseHttpError(422, "That change is too large to do in one go. Try splitting it up");
  }
  if (!message.parsed_output) {
    throw new ParseHttpError(500, "The assistant returned an unreadable result");
  }

  // Drop anything that points at an event that doesn't exist, and normalise dates
  // so a sloppy value can never land in the trip.
  const ids = new Set(input.trip.events.map((e) => e.id));
  const changes = message.parsed_output.changes
    .filter((c) => (c.op === "add" ? true : ids.has(c.eventId)))
    .filter((c) => c.op !== "add" || (c.fields.title && cleanDate(c.fields.date)))
    .map((c) => ({
      ...c,
      eventId: c.op === "add" ? "" : c.eventId,
      fields: {
        ...c.fields,
        date: cleanDate(c.fields.date),
        endDate: cleanDate(c.fields.endDate),
        checkin: cleanDate(c.fields.checkin),
        checkout: cleanDate(c.fields.checkout),
      },
    }));

  return {
    reply: message.parsed_output.reply,
    changes,
    _usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
    },
  };
}
