import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert travel itinerary parser. Extract EVERY event and detail from itinerary text.

Return a JSON object with this exact schema:
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
      "date": "YYYY-MM-DD",
      "time": "H:MM AM/PM or TBD",
      "title": "Short event title (under 100 chars)",
      "location": "Venue name or route",
      "description": "Public info for travelers: menu items, what to bring, meeting points, place descriptions, dress code, activity details, travel times/distances",
      "notes": "Internal agent notes: confirmation numbers, supplier contacts, booking references, pricing notes, surcharge warnings, operational details"
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
- Hotel check-in and check-out as separate events (type: "hotel") — include hotel name
- Overnight stays (type: "hotel") — if the doc says "Overnight in Seoul", create an event for it
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
- If a 2-digit year appears (e.g. "26 Apr 26"), expand to 4-digit (2026)
- For "Day N:" formatted itineraries, use the date from each day header
- Strip titles/honorifics (Mr/Ms/Dr) from traveler names but note roles like "Group Leader", "VS rep"
- Do NOT create events from booking metadata, pricing, or terms

Info sections — extract ALL of these if present, and rewrite into clear, well-formatted copy:
- Accommodation (hotel name, star rating, room type)
- Services included / excluded (as separate sections)
- Visa information
- Guide/contact details
- Important notes, luggage policy, transfer notes
- Any other useful reference info for travelers

Return ONLY the JSON object, no markdown fences or explanation.`;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { text } = req.body ?? {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing 'text' in request body" });
  }

  // Cap input to ~50k chars to avoid excessive token usage
  const trimmed = text.slice(0, 50_000);

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: trimmed }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return res.status(500).json({ error: "Unexpected response format" });
    }

    // Extract JSON object — handle markdown fences, leading/trailing text
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: "No JSON found in AI response" });
    }
    const parsed = JSON.parse(jsonMatch[0]);

    return res.status(200).json({
      ...parsed,
      _usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    });
  } catch (err: any) {
    console.error("parse-itinerary error:", err);
    return res.status(500).json({ error: "AI parsing failed" });
  }
}
