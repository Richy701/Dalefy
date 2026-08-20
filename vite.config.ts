import path from "path"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig, loadEnv } from "vite"
import { fileURLToPath } from "url"
import Anthropic from "@anthropic-ai/sdk"
import { runParse, runAssist, aiErrorToHttp } from "./api/_parseItineraryCore"

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
            const client = new Anthropic({ apiKey })
            res.setHeader("Content-Type", "application/json")

            if (url.searchParams.get("mode") === "assist") {
              const { type: evType, title, location, date: evDate, time: evTime, destination } = parsed
              if (!title && !location) { res.statusCode = 400; res.end(JSON.stringify({ error: "Provide at least a title or location" })); return }
              try {
                const result = await runAssist(client, { type: evType, title, location, date: evDate, time: evTime, destination })
                res.end(JSON.stringify(result))
              } catch (err: any) {
                console.error("assist-event error:", err)
                const mapped = aiErrorToHttp(err)
                res.statusCode = mapped.status; res.end(JSON.stringify({ error: mapped.error }))
              }
              return
            }

            const { text, images, pdf } = parsed
            if (!text && !pdf && (!images || !Array.isArray(images) || images.length === 0)) { res.statusCode = 400; res.end(JSON.stringify({ error: "Missing 'text', 'images', or 'pdf' in body" })); return }
            try {
              const result = await runParse(client, { text, images, pdf })
              res.end(JSON.stringify(result))
            } catch (err: any) {
              console.error("parse-itinerary error:", err)
              const mapped = aiErrorToHttp(err)
              res.statusCode = mapped.status; res.end(JSON.stringify({ error: mapped.error }))
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
                image: h.photos?.[0]?.name ? `/api/image-proxy?photo=${encodeURIComponent(h.photos[0].name)}` : "",
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
                image: a.photos?.[0]?.name ? `/api/image-proxy?photo=${encodeURIComponent(a.photos[0].name)}` : "",
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
                image: r.photos?.[0]?.name ? `/api/image-proxy?photo=${encodeURIComponent(r.photos[0].name)}` : "",
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
            const photo = url.searchParams.get("photo") ?? ""
            const imageUrl = url.searchParams.get("url") ?? ""
            let target = ""
            if (photo) {
              // Google Places photo — key attached server-side, never sent to the client
              if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(photo)) { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Invalid photo reference" })); return }
              const gKey = env.GOOGLE_API_KEY
              if (!gKey) { res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "GOOGLE_API_KEY not configured" })); return }
              target = `https://places.googleapis.com/v1/${photo}/media?maxHeightPx=400&maxWidthPx=600&key=${gKey}`
            } else {
              if (!imageUrl) { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Missing param: url" })); return }
              let parsed: URL
              try { parsed = new URL(imageUrl) } catch { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Invalid URL" })); return }
              if (parsed.protocol !== "https:") { res.statusCode = 403; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Only HTTPS allowed" })); return }
              const h = parsed.hostname; if (h === "localhost" || h.startsWith("127.") || h.startsWith("10.") || h.startsWith("192.168.") || h.endsWith(".local")) { res.statusCode = 403; res.end(); return }
              target = imageUrl
            }
            try {
              const controller = new AbortController()
              const timeout = setTimeout(() => controller.abort(), 5000)
              const resp = await fetch(target, { signal: controller.signal })
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
