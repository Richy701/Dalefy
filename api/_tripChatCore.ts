/**
 * Shared core for the traveller trip chat in the mobile app.
 * Imported by api/trip-chat.ts (Vercel) and the vite dev middleware.
 *
 * Read only: Claude answers questions from the traveller's published trip and
 * never changes it. The trip is loaded server-side, never taken from the client.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ParseHttpError } from "./_parseItineraryCore.js";

export const CHAT_MODEL = "claude-haiku-5-5";

const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 1000;
const MAX_TRIP_CHARS = 60_000;

const SYSTEM_PROMPT = `You are Dale, the trip concierge inside the Dalefy travel app. If asked who you are, you're Dale, here to help with this trip. A traveller on a hosted group trip asks you questions about their trip, and you answer from the trip details below.

Voice: a calm, friendly concierge. Short and direct, 1-3 sentences for most answers, a short list only when they ask for several things. Plain text only, no markdown, no headings, no bold. British spelling. Never use em dashes; use commas, hyphens, or periods instead.

Rules:
- Answer only from the trip details. Never invent times, addresses, flight numbers, gates, confirmation numbers, prices, or contacts.
- If the answer isn't in the trip, say so plainly and suggest asking their organiser (by name when known). Don't guess.
- General travel knowledge about the destination (local currency, plug type, tipping, customs, what to wear, what a place is like) is welcome. Give it plainly and say it's general advice, not something from their organiser.
- You can't see live weather, flight status, or bookings outside this trip. For weather, point them to the Today tab.
- You can't change the trip. If they ask to change something, tell them to contact their organiser.
- Use "now" (given with each question, in the traveller's local time) for "today", "tomorrow", "next" and "tonight".
- Times are local to each event. Say times the way the trip writes them.
- "eventIds": the ids of the events your answer is about, most relevant first, at most 3, so the app can show them as tappable cards. Empty when the answer isn't about specific events.
- Politely decline anything unrelated to travel or this trip.`;

const ChatResultSchema = z.object({
  reply: z.string(),
  eventIds: z.array(z.string()),
});

export type ChatResult = z.infer<typeof ChatResultSchema>;

export interface ChatInput {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Traveller's local clock, e.g. "Thu 23 Oct 2026, 14:05" */
  now: string;
}

type Data = Record<string, unknown>;

const NOW_RE = /^[\w ,:./-]{6,40}$/;

export function validateChatInput(body: unknown): ChatInput {
  const { messages, now } = (body ?? {}) as { messages?: unknown; now?: unknown };
  if (!Array.isArray(messages) || messages.length === 0) throw new ParseHttpError(400, "Missing messages");
  const clean = (messages as Array<{ role?: unknown; content?: unknown }>)
    .slice(-MAX_HISTORY)
    .filter((m): m is ChatInput["messages"][number] =>
      (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  while (clean.length && clean[0].role !== "user") clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== "user") {
    throw new ParseHttpError(400, "The last message must come from the user");
  }
  return {
    messages: clean,
    now: typeof now === "string" && NOW_RE.test(now) ? now : new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
  };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** "9:30 PM" or "21:30" as minutes past midnight; unknown times sort to midday */
function minutes(t: string): number {
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return 720;
  let h = Number(m[1]) % 24;
  if (m[3]) h = (h % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

/**
 * The trip as compact text: far fewer tokens than JSON, and byte-identical between
 * questions so the prompt cache holds for a whole conversation.
 */
export function tripContext(view: Data, travelerId: string | null): { text: string; eventIds: Set<string> } {
  const events = (Array.isArray(view.events) ? view.events as Data[] : [])
    // The same events the app shows the traveller by default
    .filter((e) => {
      const to = Array.isArray(e.assignedTo) ? e.assignedTo : [];
      return !travelerId || to.length === 0 || to.includes(travelerId);
    })
    .sort((a, b) => str(a.date).localeCompare(str(b.date)) || minutes(str(a.time)) - minutes(str(b.time)));

  const lines: string[] = [];
  lines.push(`Trip: ${str(view.name)}`);
  if (str(view.destination)) lines.push(`Destination: ${str(view.destination)}`);
  lines.push(`Dates: ${str(view.start)} to ${str(view.end_date)}`);
  const travelers = Array.isArray(view.travelers) ? view.travelers as Data[] : [];
  const me = travelers.find((t) => t.id === travelerId);
  if (me && str(me.name)) lines.push(`Traveller asking: ${str(me.name)}`);
  if (travelers.length) lines.push(`Group size: ${travelers.length}`);
  const org = view.organizer as Data | null;
  if (org && str(org.name)) {
    lines.push(`Organiser: ${[str(org.name), str(org.role), str(org.company), str(org.phone), str(org.email)].filter(Boolean).join(", ")}`);
  }

  lines.push("", "Itinerary (each event starts with its [id]):");
  let day = "";
  for (const e of events) {
    if (str(e.date) !== day) {
      day = str(e.date);
      lines.push("", `${day}:`);
    }
    const when = [str(e.time), str(e.endTime)].filter(Boolean).join(" to ");
    const flight = e.type === "flight"
      ? [str(e.airline), str(e.flightNum),
        str(e.depAirport) && `from ${str(e.depAirport)}${str(e.terminal) ? ` T${str(e.terminal)}` : ""}${str(e.gate) ? ` gate ${str(e.gate)}` : ""}`,
        str(e.arrAirport) && `to ${str(e.arrAirport)}${str(e.arrTerminal) ? ` T${str(e.arrTerminal)}` : ""}`,
        str(e.duration) && `duration ${str(e.duration)}`, str(e.baggageBelt) && `baggage belt ${str(e.baggageBelt)}`,
        str(e.status) && `status ${str(e.status)}`].filter(Boolean).join(", ")
      : "";
    const stay = e.type === "hotel"
      ? [str(e.checkin) && `check-in ${str(e.checkin)}`, str(e.checkout) && `check-out ${str(e.checkout)}`,
        str(e.roomType) && `room ${str(e.roomType)}`].filter(Boolean).join(", ")
      : "";
    const parts = [
      `[${str(e.id)}] ${when || "time TBC"}, ${str(e.type)}${str(e.transferType) ? ` (${str(e.transferType)})` : ""}: ${str(e.title)}`,
      str(e.endDate) && str(e.endDate) !== day ? `ends ${str(e.endDate)}` : "",
      str(e.location) && `at ${str(e.location)}`,
      flight, stay,
      str(e.seatDetails) && `seats ${str(e.seatDetails)}`,
      str(e.confNumber) && `confirmation ${str(e.confNumber)}`,
      str(e.description) && clip(str(e.description).replace(/\s+/g, " "), 600),
      str(e.notes) && `notes: ${clip(str(e.notes).replace(/\s+/g, " "), 300)}`,
    ].filter(Boolean);
    lines.push(`- ${parts.join(". ")}`);
  }

  const info = Array.isArray(view.info) ? view.info as Data[] : [];
  if (info.length) {
    lines.push("", "Trip info from the organiser:");
    for (const i of info) {
      lines.push("", `${str(i.title)}${str(i.deadline) ? ` (due ${str(i.deadline)})` : ""}`);
      if (str(i.body)) lines.push(clip(str(i.body), 2000));
    }
  }

  return { text: clip(lines.join("\n"), MAX_TRIP_CHARS), eventIds: new Set(events.map((e) => str(e.id)).filter(Boolean)) };
}

export async function runTripChat(
  client: Anthropic,
  trip: { text: string; eventIds: Set<string> },
  input: ChatInput,
): Promise<ChatResult & { _usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number } }> {
  const history = input.messages.slice(0, -1);
  const latest = input.messages[input.messages.length - 1];

  const message = await client.messages.parse({
    model: CHAT_MODEL,
    max_tokens: 4000,
    // Instructions and trip are stable for a whole conversation, so both sit in the cached prefix;
    // only the clock and the new question change per turn.
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: `Trip details:\n\n${trip.text}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: `Now: ${input.now}\n\n${latest.content}` },
    ],
    output_config: { effort: "low", format: zodOutputFormat(ChatResultSchema) },
  });

  if (message.stop_reason === "refusal") {
    return { reply: "I can't help with that one. For anything about the trip, just ask, or get in touch with your organiser.", eventIds: [], _usage: usage(message) };
  }
  if (message.stop_reason === "max_tokens" || !message.parsed_output) {
    throw new ParseHttpError(500, "Dale couldn't answer that. Try asking another way");
  }

  return {
    reply: message.parsed_output.reply.trim(),
    eventIds: [...new Set(message.parsed_output.eventIds)].filter((id) => trip.eventIds.has(id)).slice(0, 3),
    _usage: usage(message),
  };
}

function usage(message: Anthropic.Message) {
  return {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
  };
}
