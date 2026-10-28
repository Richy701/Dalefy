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
import { currentWeather, dayForecast } from "./_weatherCore.js";

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
- Live flight updates and weather, when given with a question, are current: they come from the airline feed and a weather service. Prefer them over the itinerary for gates, terminals, delays, baggage belts and weather, and say flight details can still change. Without them you can't see live flight status or weather: point them to the flight's page, or to the Today tab for weather.
- You can't see bookings outside this trip.
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

const WEATHER_QUESTION = /weather|rain|sun|hot|cold|warm|temperature|forecast|umbrella|jacket|coat|wear|storm|humid|degrees/i;
const DAY_MS = 86_400_000;

const visibleTo = (travelerId: string | null) => (e: Data) => {
  const to = Array.isArray(e.assignedTo) ? e.assignedTo : [];
  return !travelerId || to.length === 0 || to.includes(travelerId);
};

/** [lat, lng] when the value is a usable pair */
function coords(v: unknown): [number, number] | null {
  return Array.isArray(v) && v.length === 2 && v.every(n => typeof n === "number" && Number.isFinite(n)) ? [v[0], v[1]] : null;
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>(r => setTimeout(() => r(null), ms))]);

/**
 * What changes during the trip, sent with the question rather than in the cached trip text: the flight
 * status job's live fields for flights around today, and the weather where the traveller is when they ask
 * about it. `liveEvents` is the trip's working copy, which the flight job updates; only flights the
 * traveller can see in the published trip are used.
 */
export async function liveContext(view: Data, liveEvents: Data[], travelerId: string | null, question: string, weatherKey?: string): Promise<string> {
  const flights = (Array.isArray(view.events) ? view.events as Data[] : [])
    .filter(e => e.type === "flight").filter(visibleTo(travelerId))
    .sort((a, b) => str(a.date).localeCompare(str(b.date)) || minutes(str(a.time)) - minutes(str(b.time)));
  const liveById = new Map(liveEvents.map(e => [str(e.id), e]));
  const today = Date.now();
  const near = (date: string) => Math.abs(Date.parse(`${date.slice(0, 10)}T12:00:00Z`) - today) <= 1.5 * DAY_MS;

  const lines: string[] = [];
  for (const f of flights) {
    const live = liveById.get(str(f.id));
    if (!live || !near(str(f.date))) continue;
    const facts = [
      str(live.status) && `status ${str(live.status)}`,
      str(live.revisedTime) && `now expected to leave ${str(live.revisedTime)}`,
      str(live.revisedEndTime) && `now expected to land ${str(live.revisedEndTime)}`,
      (str(live.terminal) || str(live.gate)) && `departs${str(live.terminal) ? ` terminal ${str(live.terminal)}` : ""}${str(live.gate) ? ` gate ${str(live.gate)}` : ""}`,
      (str(live.arrTerminal) || str(live.arrGate)) && `arrives${str(live.arrTerminal) ? ` terminal ${str(live.arrTerminal)}` : ""}${str(live.arrGate) ? ` gate ${str(live.arrGate)}` : ""}`,
      str(live.baggageBelt) && `bags on belt ${str(live.baggageBelt)}`,
    ].filter(Boolean);
    if (!facts.length) continue;
    const route = [str(live.depAirport) || str(f.depAirport), str(live.arrAirport) || str(f.arrAirport)].filter(Boolean).join(" to ");
    lines.push(`- [${str(f.id)}] ${[str(f.airline), str(f.flightNum)].filter(Boolean).join(" ")} ${route}, ${str(f.date)}, scheduled ${[str(live.time) || str(f.time), str(live.endTime) || str(f.endTime)].filter(Boolean).join(" to ")}: ${facts.join(", ")}`);
  }

  if (weatherKey && WEATHER_QUESTION.test(question)) {
    // Where they are: the arrival airport of the last flight that has left, else the trip's first arrival
    const placed = flights.map(f => ({ f, at: coords(liveById.get(str(f.id))?.arrCoords) ?? coords(f.arrCoords) })).filter(x => x.at);
    const todayIso = new Date(today).toISOString().slice(0, 10);
    const here = [...placed].reverse().find(x => str(x.f.date) <= todayIso) ?? placed[0];
    if (here?.at) {
      const [lat, lng] = here.at;
      const place = str(liveById.get(str(here.f.id))?.arrAirport) || str(here.f.arrAirport) || "the destination";
      const days = [0, 1].map(n => new Date(today + n * DAY_MS).toISOString().slice(0, 10));
      const [now, ...forecasts] = await Promise.all([
        withTimeout(currentWeather(lat, lng, weatherKey), 3000),
        ...days.map(d => withTimeout(dayForecast(lat, lng, d, weatherKey), 3000)),
      ]);
      const weather: string[] = [];
      if (now) weather.push(`now ${now.temp}°C, ${now.description}`);
      forecasts.forEach((fc, i) => {
        if (fc && "high" in fc) weather.push(`${days[i]}: high ${fc.high}°C, low ${fc.low}°C, ${fc.description}, ${fc.rainChance}% chance of rain`);
      });
      if (weather.length) lines.push(`- Weather near ${place} airport: ${weather.join("; ")}`);
    }
  }
  return lines.join("\n");
}

export async function runTripChat(
  client: Anthropic,
  trip: { text: string; eventIds: Set<string> },
  input: ChatInput,
  live = "",
): Promise<ChatResult & { _usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number } }> {
  const history = input.messages.slice(0, -1);
  const latest = input.messages[input.messages.length - 1];

  const message = await client.messages.parse({
    model: CHAT_MODEL,
    max_tokens: 4000,
    // Instructions and trip are stable for a whole conversation, so both sit in the cached prefix;
    // only the clock, the live updates and the new question change per turn.
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: `Trip details:\n\n${trip.text}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: `Now: ${input.now}\n\n${live ? `Live updates:\n${live}\n\n` : ""}${latest.content}` },
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
