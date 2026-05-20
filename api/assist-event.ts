import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a travel planning assistant. Given details about a travel event (type, title, location, date, time), generate a polished public-facing description and internal agent notes.

Return a JSON object with exactly these fields:
{
  "description": "Warm, helpful public description that travelers will see. Bring the experience to life - describe the place, what to expect, practical tips. 2-3 sentences max.",
  "notes": "Concise internal/operational notes for the travel agent. Confirmation details, supplier tips, things to watch out for. 1-2 sentences max. If nothing relevant, return empty string."
}

Style guide for descriptions by event type:
- Flights: practical travel tips (arrive early, baggage info, transfer timing)
- Hotels: room experience, amenities, check-in details
- Dining: describe the cuisine, atmosphere, what makes it special
- Activities: bring it to life - what they'll see, do, and experience
- Transfers: friendly context about the journey, duration, route

Write warm, professional copy. Never use em dashes - use commas, hyphens, or periods instead.
Return ONLY the JSON object, no markdown fences.`;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { type, title, location, date, time, destination } = req.body ?? {};
  if (!title && !location) {
    return res.status(400).json({ error: "Provide at least a title or location" });
  }

  const prompt = [
    `Event type: ${type || "activity"}`,
    title && `Title: ${title}`,
    location && `Location: ${location}`,
    date && `Date: ${date}`,
    time && `Time: ${time}`,
    destination && `Trip destination: ${destination}`,
  ].filter(Boolean).join("\n");

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return res.status(500).json({ error: "Unexpected response format" });
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: "No JSON found in AI response" });
    }
    const parsed = JSON.parse(jsonMatch[0]);

    return res.status(200).json({
      description: parsed.description || "",
      notes: parsed.notes || "",
      _usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    });
  } catch (err: any) {
    console.error("assist-event error:", err);
    return res.status(500).json({ error: "AI assist failed" });
  }
}
