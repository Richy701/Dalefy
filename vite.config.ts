import path from "path"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig, loadEnv } from "vite"
import { fileURLToPath } from "url"
import Anthropic from "@anthropic-ai/sdk"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")

  return {
    plugins: [
      react(),
      apiRoutesPlugin(env),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "inline",
        includeAssets: ["favicon.svg"],
        manifest: {
          name: "Dalefy",
          short_name: "Dalefy",
          description: "Trip planning without the mess",
          theme_color: "#050505",
          background_color: "#050505",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "favicon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/api\.mapbox\.com\//,
              handler: "CacheFirst",
              options: {
                cacheName: "mapbox-tiles",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})

function apiRoutesPlugin(env: Record<string, string>) {
  return {
    name: "api-routes",
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = new URL(req.url!, `http://${req.headers.host}`)
        const p = url.pathname
        try {
          if (p === "/api/parse-itinerary") {
            if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Method not allowed" })); return }
            const apiKey = env.ANTHROPIC_API_KEY
            if (!apiKey) { res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" })); return }
            let body = ""
            await new Promise<void>((resolve) => { req.on("data", (c: Buffer) => { body += c.toString() }); req.on("end", resolve) })
            let parsed: any
            try { parsed = JSON.parse(body) } catch { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Invalid JSON body" })); return }

            if (url.searchParams.get("mode") === "assist") {
              const { type: evType, title, location, date: evDate, time: evTime, destination } = parsed
              if (!title && !location) { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Provide at least a title or location" })); return }
              try {
                const client = new Anthropic({ apiKey })
                const prompt = [`Event type: ${evType || "activity"}`, title && `Title: ${title}`, location && `Location: ${location}`, evDate && `Date: ${evDate}`, evTime && `Time: ${evTime}`, destination && `Trip destination: ${destination}`].filter(Boolean).join("\n")
                const message = await client.messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 1024, system: `You are a travel planning assistant. Given details about a travel event, generate a polished public-facing description and internal agent notes.\n\nReturn a JSON object with exactly these fields:\n{\n  "description": "Warm, helpful public description that travelers will see. 2-3 sentences max.",\n  "notes": "Concise internal/operational notes for the travel agent. 1-2 sentences max. If nothing relevant, return empty string."\n}\n\nWrite warm, professional copy. Never use em dashes - use commas, hyphens, or periods instead.\nReturn ONLY the JSON object, no markdown fences.`, messages: [{ role: "user", content: prompt }] })
                const c = message.content[0]
                if (c.type !== "text") { res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Unexpected response" })); return }
                const m = c.text.match(/\{[\s\S]*\}/)
                if (!m) { res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "No JSON in response" })); return }
                const result = JSON.parse(m[0])
                res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ description: result.description || "", notes: result.notes || "", _usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens } })); return
              } catch (err: any) { console.error("assist-event error:", err); res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "AI assist failed", detail: err.message })); return }
            }

            const { text, images } = parsed
            if (!text && (!images || !Array.isArray(images) || images.length === 0)) { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Missing 'text' or 'images' in body" })); return }
            try {
              const client = new Anthropic({ apiKey })
              const systemPrompt = `You are an expert travel itinerary parser. Extract EVERY event and detail from the provided content. The input may be text, images (photos/screenshots of itineraries, booking confirmations, travel documents), or both. Read and extract all information regardless of format.

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
- If a 2-digit year appears (e.g. "26 Apr 26"), expand to 4-digit (2026)
- If no year is shown or the year is ambiguous, default to the current year (2026) or the next occurrence of that date. NEVER default to 2024 or 2025.
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

Return ONLY the JSON object, no markdown fences or explanation.`

              const contentBlocks: any[] = []
              if (images && Array.isArray(images)) {
                for (const dataUrl of images.slice(0, 5)) {
                  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/)
                  if (!m) continue
                  contentBlocks.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } })
                }
              }
              if (text) contentBlocks.push({ type: "text", text: text.slice(0, 50_000) })

              const message = await client.messages.create({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 8192,
                system: systemPrompt,
                messages: [{ role: "user", content: contentBlocks.length > 0 ? contentBlocks : "No content provided" }],
              })
              const content = message.content[0]
              if (content.type !== "text") { res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Unexpected response" })); return }
              const jsonMatch = content.text.match(/\{[\s\S]*\}/)
              if (!jsonMatch) { res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "No JSON found in AI response" })); return }
              const raw = jsonMatch[0]
              const parsedResult = JSON.parse(raw)
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ...parsedResult, _usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens } }))
            } catch (err: any) {
              console.error("parse-itinerary error:", err)
              res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "AI parsing failed", detail: err.message }))
            }
          } else if (p === "/api/flights") {
            const from = url.searchParams.get("from") ?? ""
            const to = url.searchParams.get("to") ?? ""
            const date = url.searchParams.get("date") ?? ""
            const key = env.RAPIDAPI_KEY
            if (!key) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "RAPIDAPI_KEY not configured" })); return }
            if (!from || !to || !date) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Missing params" })); return }
            try {
              const hdrs = { "x-rapidapi-key": key, "x-rapidapi-host": "aerodatabox.p.rapidapi.com" }
              const [r1, r2] = await Promise.all([
                fetch(`https://aerodatabox.p.rapidapi.com/flights/airports/iata/${from}/${date}T00:00/${date}T11:59?direction=Departure`, { headers: hdrs }),
                fetch(`https://aerodatabox.p.rapidapi.com/flights/airports/iata/${from}/${date}T12:00/${date}T23:59?direction=Departure`, { headers: hdrs }),
              ])
              const d1: any = r1.ok ? await r1.json() : {}
              const d2: any = r2.ok ? await r2.json() : {}
              const allDeps = [...(d1.departures ?? []), ...(d2.departures ?? [])]
              const toUpper = to.toUpperCase()
              const matched = allDeps
                .filter((f: any) => f.movement?.airport?.iata?.toUpperCase() === toUpper && f.codeshareStatus !== "IsCodeshared" && !f.isCargo)
                .slice(0, 8)
              const fmtTime = (t: string) => { const m = t.match(/(\d{2}:\d{2})/); return m ? m[1] : t }
              const flights = matched.map((f: any) => {
                const mov = f.movement ?? {}
                const depTime = mov.scheduledTime?.local ?? ""
                return {
                  airline: f.airline?.name ?? "",
                  flightNum: f.number ?? "",
                  from: from,
                  fromCode: from,
                  to: mov.airport?.name ?? "",
                  toCode: mov.airport?.iata ?? to,
                  departTime: fmtTime(depTime),
                  arriveTime: "",
                  durationMins: 0,
                  price: 0,
                  stops: 0,
                  logo: "",
                  status: f.status ?? "",
                  terminal: mov.terminal ?? "",
                }
              })
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ flights }))
            } catch {
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ flights: [] }))
            }
          } else if (p === "/api/flight-number") {
            const number = url.searchParams.get("number") ?? ""
            const date = url.searchParams.get("date") ?? ""
            const key = env.RAPIDAPI_KEY
            if (!key) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "RAPIDAPI_KEY not configured" })); return }
            if (!number || !date) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Missing params" })); return }
            try {
              const resp = await fetch(`https://aerodatabox.p.rapidapi.com/flights/number/${number}/${date}`, {
                headers: { "x-rapidapi-key": key, "x-rapidapi-host": "aerodatabox.p.rapidapi.com" },
              })
              const data = await resp.json()
              const raw = (Array.isArray(data) ? data : []).filter((f: any) => f.codeshareStatus !== "IsCodeshared").slice(0, 8)
              const fmtTime = (t: string) => { const m = t.match(/(\d{2}:\d{2})/); return m ? m[1] : t }
              const timeToMins = (t: string) => { const m = t.match(/(\d{2}):(\d{2})/); return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0 }
              const flights = raw.map((f: any) => {
                const dep = f.departure ?? {}
                const arr = f.arrival ?? {}
                const depTime = dep.scheduledTime?.local ?? ""
                const arrTime = arr.scheduledTime?.local ?? ""
                const depUtc = dep.scheduledTime?.utc ?? ""
                const arrUtc = arr.scheduledTime?.utc ?? ""
                const depMins = timeToMins(depUtc)
                const arrMins = timeToMins(arrUtc)
                const duration = arrMins >= depMins ? arrMins - depMins : arrMins + 1440 - depMins
                const depLoc = dep.airport?.location
                const arrLoc = arr.airport?.location
                return {
                  airline: f.airline?.name ?? "",
                  flightNum: f.number ?? "",
                  from: dep.airport?.name ?? "",
                  fromCode: dep.airport?.iata ?? "",
                  to: arr.airport?.name ?? "",
                  toCode: arr.airport?.iata ?? "",
                  departTime: fmtTime(depTime),
                  arriveTime: fmtTime(arrTime),
                  durationMins: duration,
                  price: 0,
                  stops: 0,
                  logo: "",
                  status: f.status ?? "",
                  terminal: dep.terminal ?? "",
                  depCoords: depLoc ? [depLoc.lat, depLoc.lon] : undefined,
                  arrCoords: arrLoc ? [arrLoc.lat, arrLoc.lon] : undefined,
                }
              })
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ flights }))
            } catch {
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ flights: [] }))
            }
          } else if (p === "/api/hotels") {
            const q = url.searchParams.get("q") ?? ""
            const check_in = url.searchParams.get("check_in") ?? ""
            const check_out = url.searchParams.get("check_out") ?? ""
            const gKey = env.GOOGLE_API_KEY
            if (!gKey || !q || !check_in || !check_out) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ hotels: [] })); return }
            const ADVANCED_FIELDS = "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.photos,places.priceLevel"
            const BASIC_FIELDS = "places.displayName,places.formattedAddress"
            const searchPlaces = async (fields: string) => {
              const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Goog-Api-Key": gKey, "X-Goog-FieldMask": fields },
                body: JSON.stringify({ textQuery: `hotels in ${q}`, maxResultCount: 8 }),
              })
              return resp.json()
            }
            try {
              let data: any = await searchPlaces(ADVANCED_FIELDS)
              if (data.error) data = await searchPlaces(BASIC_FIELDS)
              if (data.error) { console.error("Google Places hotels error:", data.error.message); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ hotels: [] })); return }
              const STAR_MAP: Record<string, string> = { PRICE_LEVEL_INEXPENSIVE: "2-star", PRICE_LEVEL_MODERATE: "3-star", PRICE_LEVEL_EXPENSIVE: "4-star", PRICE_LEVEL_VERY_EXPENSIVE: "5-star" }
              const hotels = (data.places ?? []).map((h: any) => ({
                name: h.displayName?.text ?? "",
                rating: h.rating ?? 0,
                reviews: h.userRatingCount ?? 0,
                image: h.photos?.[0]?.name ? `/api/image-proxy?url=${encodeURIComponent(`https://places.googleapis.com/v1/${h.photos[0].name}/media?maxHeightPx=400&maxWidthPx=600&key=${gKey}`)}` : "",
                checkin: check_in,
                checkout: check_out,
                amenities: [] as string[],
                stars: STAR_MAP[h.priceLevel] ?? "",
                address: h.formattedAddress ?? "",
              }))
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ hotels }))
            } catch (err) {
              console.error("hotels error:", err)
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ hotels: [] }))
            }
          } else if (p === "/api/activities") {
            const q = url.searchParams.get("q") ?? ""
            const gKey = env.GOOGLE_API_KEY
            if (!gKey || !q) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ activities: [] })); return }
            const ADVANCED = "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.primaryType,places.currentOpeningHours,places.photos"
            const BASIC = "places.displayName,places.formattedAddress,places.primaryType"
            const searchPlaces = async (fields: string) => {
              const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Goog-Api-Key": gKey, "X-Goog-FieldMask": fields },
                body: JSON.stringify({ textQuery: `things to do in ${q}`, maxResultCount: 8 }),
              })
              return resp.json()
            }
            try {
              let data: any = await searchPlaces(ADVANCED)
              if (data.error) data = await searchPlaces(BASIC)
              if (data.error) { console.error("Google Places activities error:", data.error.message); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ activities: [] })); return }
              const activities = (data.places ?? []).map((a: any) => ({
                name: a.displayName?.text ?? "",
                rating: a.rating ?? 0,
                reviews: a.userRatingCount ?? 0,
                image: a.photos?.[0]?.name ? `/api/image-proxy?url=${encodeURIComponent(`https://places.googleapis.com/v1/${a.photos[0].name}/media?maxHeightPx=400&maxWidthPx=600&key=${gKey}`)}` : "",
                address: a.formattedAddress ?? "",
                type: (a.primaryType ?? "").replace(/_/g, " "),
                openStatus: a.currentOpeningHours?.openNow ? "Open" : "",
              }))
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ activities }))
            } catch (err) {
              console.error("activities error:", err)
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ activities: [] }))
            }
          } else if (p === "/api/dining") {
            const q = url.searchParams.get("q") ?? ""
            const gKey = env.GOOGLE_API_KEY
            if (!gKey || !q) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ restaurants: [] })); return }
            const ADVANCED = "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.primaryType,places.currentOpeningHours,places.photos,places.priceLevel"
            const BASIC = "places.displayName,places.formattedAddress,places.primaryType"
            const searchPlaces = async (fields: string) => {
              const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Goog-Api-Key": gKey, "X-Goog-FieldMask": fields },
                body: JSON.stringify({ textQuery: `restaurants in ${q}`, maxResultCount: 8 }),
              })
              return resp.json()
            }
            try {
              let data: any = await searchPlaces(ADVANCED)
              if (data.error) data = await searchPlaces(BASIC)
              if (data.error) { console.error("Google Places dining error:", data.error.message); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ restaurants: [] })); return }
              const PRICE_MAP: Record<string, string> = { PRICE_LEVEL_FREE: "Free", PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" }
              const restaurants = (data.places ?? []).map((r: any) => ({
                name: r.displayName?.text ?? "",
                rating: r.rating ?? 0,
                reviews: r.userRatingCount ?? 0,
                image: r.photos?.[0]?.name ? `/api/image-proxy?url=${encodeURIComponent(`https://places.googleapis.com/v1/${r.photos[0].name}/media?maxHeightPx=400&maxWidthPx=600&key=${gKey}`)}` : "",
                address: r.formattedAddress ?? "",
                priceTag: PRICE_MAP[r.priceLevel] ?? "",
                cuisines: r.primaryType ? [(r.primaryType as string).replace(/_/g, " ")] : [],
                openStatus: r.currentOpeningHours?.openNow ? "Open" : "",
              }))
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ restaurants }))
            } catch (err) {
              console.error("dining error:", err)
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ restaurants: [] }))
            }
          } else if (p === "/api/images") {
            const q = url.searchParams.get("q") ?? ""
            const page = url.searchParams.get("page") ?? "1"
            const perPage = url.searchParams.get("per_page") ?? "9"
            const src = url.searchParams.get("source") ?? ""
            const json = (d: any) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(d)) }

            const tryGoogle = async () => {
              const sKey = env.SERPAPI_KEY
              if (!sKey) return false
              try {
                const start = (parseInt(page) - 1) * parseInt(perPage)
                const params = new URLSearchParams({ engine: "google_images", q, num: perPage, ijn: String(Math.floor(start / 100)), api_key: sKey })
                const resp = await fetch(`https://serpapi.com/search.json?${params}`)
                if (resp.ok) {
                  const data: any = await resp.json()
                  const urls = (data.images_results ?? []).slice(0, parseInt(perPage)).map((i: any) => i.original).filter(Boolean)
                  if (urls.length) { json({ urls, source: "google" }); return true }
                }
              } catch {}
              return false
            }
            const tryUnsplash = async () => {
              const uKey = env.UNSPLASH_ACCESS_KEY
              if (!uKey) return false
              try {
                const params = new URLSearchParams({ query: q, per_page: perPage, page, orientation: "landscape", client_id: uKey })
                const resp = await fetch(`https://api.unsplash.com/search/photos?${params}`)
                if (resp.ok) {
                  const data = await resp.json()
                  const urls = (data.results ?? []).map((r: any) => r.urls?.regular).filter(Boolean)
                  if (urls.length) { json({ urls, source: "unsplash" }); return true }
                }
              } catch {}
              return false
            }
            const tryPexels = async () => {
              const pKey = env.PEXELS_API_KEY
              if (!pKey) return false
              try {
                const params = new URLSearchParams({ query: q, per_page: perPage, page, orientation: "landscape" })
                const resp = await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: pKey } })
                if (resp.ok) {
                  const data = await resp.json()
                  const urls = (data.photos ?? []).map((p: any) => p.src?.landscape || p.src?.large).filter(Boolean)
                  if (urls.length) { json({ urls, source: "pexels" }); return true }
                }
              } catch {}
              return false
            }

            if (!q) { json({ urls: [], source: null }); return }

            if (src === "google") { if (await tryGoogle()) return }
            else if (src === "unsplash") { if (await tryUnsplash()) return }
            else if (src === "pexels") { if (await tryPexels()) return }
            else {
              if (await tryGoogle()) return
              if (await tryUnsplash()) return
              if (await tryPexels()) return
            }
            json({ urls: [], source: null })
          } else if (p === "/api/image-proxy") {
            const imageUrl = url.searchParams.get("url") ?? ""
            if (!imageUrl) { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Missing param: url" })); return }
            let parsed: URL
            try { parsed = new URL(imageUrl) } catch { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Invalid URL" })); return }
            if (parsed.protocol !== "https:") { res.statusCode = 403; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Only HTTPS allowed" })); return }
            const h = parsed.hostname; if (h === "localhost" || h.startsWith("127.") || h.startsWith("10.") || h.startsWith("192.168.") || h.endsWith(".local")) { res.statusCode = 403; res.end(); return }
            try {
              const controller = new AbortController()
              const timeout = setTimeout(() => controller.abort(), 5000)
              const resp = await fetch(imageUrl, { signal: controller.signal })
              clearTimeout(timeout)
              if (!resp.ok) { res.statusCode = resp.status; res.end(); return }
              const ct = resp.headers.get("content-type") || "image/jpeg"
              if (!ct.startsWith("image/")) { res.statusCode = 403; res.end(); return }
              const buf = Buffer.from(await resp.arrayBuffer())
              if (buf.length > 5 * 1024 * 1024) { res.statusCode = 413; res.end(); return }
              res.setHeader("Content-Type", ct); res.setHeader("Cache-Control", "public, max-age=86400"); res.end(buf)
            } catch { res.statusCode = 502; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Failed to fetch image" })) }
          } else if (p === "/api/geocode") {
            const q = url.searchParams.get("q") ?? ""
            const token = env.MAPBOX_TOKEN
            if (!token || !q) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ coord: null })); return }
            try {
              const encoded = encodeURIComponent(q)
              const resp = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&limit=1`)
              if (resp.ok) {
                const data = await resp.json()
                const feat = data?.features?.[0]
                const coord = feat?.center ? [feat.center[1], feat.center[0]] : null
                res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ coord })); return
              }
            } catch {}
            res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ coord: null }))
          } else {
            return next()
          }
        } catch (err: any) {
          if (!res.headersSent) {
            res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: err.message }))
          }
        }
      })
    },
  }
}
