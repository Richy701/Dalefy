/**
 * Shared core for the AI itinerary parser and event assist.
 * Imported by BOTH api/parse-itinerary.ts (Vercel) and vite.config.ts (local dev)
 * so the prompts, models, and response shapes can never drift between the two.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const PARSE_MODEL = "claude-sonnet-5";
export const ASSIST_MODEL = "claude-haiku-4-5-20251001";

// Base64 PDF payload cap (~21MB binary) — keeps the total request under the
// Claude API's 32MB request limit with room for the prompt and text blocks.
const MAX_PDF_BASE64_CHARS = 28 * 1024 * 1024;

const SYSTEM_PROMPT = `You are an expert travel itinerary parser. Extract EVERY event and detail from the provided content. The input may be text, images (photos/screenshots of itineraries, booking confirmations, travel documents), a PDF document, or a combination. Read and extract all information regardless of format.

Field semantics for the structured result (if a field does not apply, use an empty string or empty array):
{
  "name": "Trip name (short, e.g. 'Fam Trip 2026 — Seoul')",
  "destination": "Primary destination city/region",
  "start": "YYYY-MM-DD",
  "end": "YYYY-MM-DD",
  "travelers": [
    { "name": "Full Name", "role": "optional role like Group Leader, Rep, etc." }
  ],
  "events": [
    {
      "type": "flight | hotel | dining | activity | transfer",
      "date": "YYYY-MM-DD (for hotels, use the check-in date)",
      "time": "H:MM AM/PM or TBD (for hotels, use check-in time)",
      "endTime": "H:MM AM/PM (for hotels use check-out time, for flights use arrival time, optional for others)",
      "title": "Short event title (under 100 chars)",
      "location": "Venue name or route",
      "description": "Public info for travelers: menu items, what to bring, meeting points, place descriptions, dress code, activity details, travel times/distances",
      "notes": "Internal agent notes: confirmation numbers, supplier contacts, booking references, pricing notes, surcharge warnings, operational details",
      "checkin": "YYYY-MM-DD (hotels only - check-in date)",
      "checkout": "YYYY-MM-DD (hotels only - check-out date)"
    }
  ],
  "organizer": {
    "name": "Organizer/agent name",
    "company": "Company name if found",
    "email": "email if found",
    "phone": "phone if found"
  },
  "info": [
    { "title": "Section name", "body": "Section content" }
  ]
}

CRITICAL — Extract EVERY distinct event. Be thorough. A typical 4-day itinerary should have 15-25+ events. NEVER skip these event types:
- Each flight (type: "flight") with carrier + number in title, e.g. "VS208 — London to Seoul"
- Airport transfers and pickups (type: "transfer") — ALWAYS include these, e.g. "Airport pickup & transfer to Seoul"
- Hotel check-in and check-out as ONE event (type: "hotel") — include hotel name, set "date" to check-in date, "checkin" to check-in date, "checkout" to check-out date, "time" to check-in time, "endTime" to check-out time. ALWAYS set checkin and checkout dates for hotel events.
- Overnight stays (type: "hotel") — if the doc says "Overnight in Seoul", create an event for it with checkin/checkout dates
- EVERY meal — breakfast, lunch, dinner, each as its own event (type: "dining") with restaurant name
- EVERY tour, visit, sightseeing stop as separate events (type: "activity")
- BUT group sub-stops within ONE guided tour into ONE event (e.g. DMZ Tour with multiple stops → one event, stops in location field)
- Market visits, shopping, exploration (type: "activity")
- ALL transfers between locations (type: "transfer") — e.g. "Transfer to Suwon", "Transfer back to hotel", "Transfer to airport"
- Free time / rest periods if mentioned

There are TWO text fields per event. Do NOT just copy raw text from the document — rewrite into polished, friendly copy that reads well. But NEVER lose any information.

"description" = PUBLIC, visible to travelers. Write warm, helpful copy:
- Dining: describe the meal experience and full menu. e.g. "Enjoy authentic Korean BBQ at this popular Euljiro spot. Your menu features the signature Mt. Jiri Aged Black Pork Platter — additional dishes available to order."
- Hotels: room details and what's included. e.g. "5-star Superior Room with daily breakfast included. Standard check-in from 3:00 PM."
- Flights: practical travel tips. e.g. "Please arrive at the airport 3 hours before departure for check-in. Hotel pickup is scheduled 1 hour before this."
- Activities: bring the experience to life — describe the place, what to expect, what to bring. e.g. "Explore the Korean Demilitarized Zone, one of the most heavily fortified borders in the world. Visit Freedom Bridge, the 3rd Infiltration Tunnel, and the Dora Observatory. Please bring your passport — it's required for entry."
- Transfers: friendly context. e.g. "Private transfer from Incheon Airport to Seoul city centre. Journey takes approximately 1 hour (58 km)."
- Overnight: e.g. "Overnight stay in Seoul at the Novotel Ambassador Dongdaemun."

"notes" = INTERNAL, agent-only. Keep concise and operational:
- Reservation confirmations: "Confirmed 19:00"
- Supplier contacts: "Contact: 010-5497-4968"
- Booking refs: "Ref: SLIB103680"
- Surcharge/policy notes: "Early check-in surcharge applies"
- Driver/guide notes: "No guide service — driver only"
- Luggage notes: "Baggage may be stored at hotel for late departures"

Event title rules:
- Concise and specific: "Visit Hwaseong Fortress" not "Today's tour"
- Include venue names: "Farewell Dinner — Muwha Seoul" not just "Dinner"
- Transfers: "Transfer to Incheon Airport" not just "Transfer"

Other rules:
- For flights with concatenated IATA codes like "LHRICN", split into "LHR"+"ICN" and resolve to city names (LHR=London, ICN=Seoul, JFK=New York, etc.)
- Use 12-hour format with AM/PM for times. Convert 24h times.
- If a 2-digit year appears (e.g. "26 Apr 26"), expand to 4-digit
- If no year is shown or the year is ambiguous, use today's date (provided in the message) to resolve it: prefer the current year, or the next occurrence of that date. NEVER default to a year in the past.
- For "Day N:" formatted itineraries, use the date from each day header
- Strip titles/honorifics (Mr/Ms/Dr) from traveler names but note roles like "Group Leader", "VS rep"
- Do NOT create events from booking metadata, pricing, or terms

Info sections — extract ALL of these if present, and rewrite into clear, well-formatted copy:
- Accommodation (hotel name, star rating, room type)
- Services included / excluded (as separate sections)
- Visa information
- Guide/contact details
- Important notes, luggage policy, transfer notes
- Any other useful reference info for travelers`;

const ASSIST_PROMPT = `You are a travel planning assistant. Given details about a travel event (type, title, location, date, time), generate a polished public-facing description and internal agent notes.

Result fields:
- "description": Warm, helpful public description that travelers will see. Bring the experience to life - describe the place, what to expect, practical tips. 2-3 sentences max.
- "notes": Concise internal/operational notes for the travel agent. Confirmation details, supplier tips, things to watch out for. 1-2 sentences max. If nothing relevant, return empty string.

Write warm, professional copy. Never use em dashes - use commas, hyphens, or periods instead.`;

const EventSchema = z.object({
  type: z.enum(["flight", "hotel", "dining", "activity", "transfer"]),
  date: z.string(),
  time: z.string(),
  endTime: z.string(),
  title: z.string(),
  location: z.string(),
  description: z.string(),
  notes: z.string(),
  checkin: z.string(),
  checkout: z.string(),
});

const ItinerarySchema = z.object({
  name: z.string(),
  destination: z.string(),
  start: z.string(),
  end: z.string(),
  travelers: z.array(z.object({ name: z.string(), role: z.string() })),
  events: z.array(EventSchema),
  organizer: z.object({
    name: z.string(),
    company: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
  info: z.array(z.object({ title: z.string(), body: z.string() })),
});

const AssistSchema = z.object({
  description: z.string(),
  notes: z.string(),
});

/** Error with an HTTP status the route handlers can send straight to the client. */
export class ParseHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface ParseInput {
  text?: string;
  images?: string[];
  pdf?: string;
}

export interface AssistInput {
  type?: string;
  title?: string;
  location?: string;
  date?: string;
  time?: string;
  destination?: string;
}

export async function runParse(client: Anthropic, input: ParseInput) {
  const contentBlocks: Anthropic.ContentBlockParam[] = [];

  if (input.pdf && typeof input.pdf === "string") {
    const data = input.pdf.replace(/^data:application\/pdf;base64,/, "");
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) {
      throw new ParseHttpError(400, "Invalid PDF payload");
    }
    if (data.length > MAX_PDF_BASE64_CHARS) {
      throw new ParseHttpError(413, "PDF too large for AI parsing (max ~20MB)");
    }
    contentBlocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    });
  }

  if (Array.isArray(input.images)) {
    for (const dataUrl of input.images.slice(0, 5)) {
      const match = String(dataUrl).match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
      if (!match) continue;
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: match[1] as "image/jpeg", data: match[2] },
      });
    }
  }

  // Today's date lives in the user message (not the system prompt) so the
  // cached system prefix stays byte-identical across days.
  const today = new Date().toISOString().slice(0, 10);
  const textPart = input.text && typeof input.text === "string"
    ? `\n\nItinerary content:\n${input.text.slice(0, 50_000)}`
    : "";
  contentBlocks.push({ type: "text", text: `Today's date: ${today}.${textPart}` });

  if (contentBlocks.length === 1 && !textPart) {
    throw new ParseHttpError(400, "No valid content to parse");
  }

  const message = await client.messages.parse({
    model: PARSE_MODEL,
    max_tokens: 16000,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: contentBlocks }],
    output_config: { format: zodOutputFormat(ItinerarySchema) },
  });

  if (message.stop_reason === "max_tokens") {
    throw new ParseHttpError(422, "Itinerary too large for AI parsing — output was cut off");
  }
  if (!message.parsed_output) {
    throw new ParseHttpError(500, "AI returned an unreadable result");
  }

  return {
    ...message.parsed_output,
    _usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
    },
  };
}

export async function runAssist(client: Anthropic, input: AssistInput) {
  const prompt = [
    `Event type: ${input.type || "activity"}`,
    input.title && `Title: ${input.title}`,
    input.location && `Location: ${input.location}`,
    input.date && `Date: ${input.date}`,
    input.time && `Time: ${input.time}`,
    input.destination && `Trip destination: ${input.destination}`,
  ].filter(Boolean).join("\n");

  const message = await client.messages.parse({
    model: ASSIST_MODEL,
    max_tokens: 1024,
    system: ASSIST_PROMPT,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(AssistSchema) },
  });

  if (!message.parsed_output) {
    throw new ParseHttpError(500, "AI returned an unreadable result");
  }

  return {
    description: message.parsed_output.description || "",
    notes: message.parsed_output.notes || "",
    _usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
    },
  };
}

/** Map an error from runParse/runAssist to an HTTP status + safe client message. */
export function aiErrorToHttp(err: unknown): { status: number; error: string } {
  if (err instanceof ParseHttpError) return { status: err.status, error: err.message };
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, error: "AI service is handling too many requests — try again in a minute" };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 400, error: "AI request was rejected — the content may be too large" };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 503, error: "AI service is temporarily unavailable — try again shortly" };
  }
  return { status: 500, error: "AI parsing failed" };
}
