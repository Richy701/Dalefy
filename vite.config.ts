import path from "path"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig, loadEnv } from "vite"
import { fileURLToPath } from "url"
import Anthropic from "@anthropic-ai/sdk"
import { runParse, runAssist, aiErrorToHttp } from "./api/_parseItineraryCore"
import { searchFlights, lookupFlightNumber } from "./api/_flightsCore"
import { searchImages } from "./api/_imagesCore"
import { geocode, suggest, PROXIMITY_RE } from "./api/_geocodeCore"
import { searchPlaces } from "./api/_placesCore"
import { resolveTarget, fetchImage } from "./api/_imageProxyCore"
import { HttpError, errorToHttp } from "./api/_httpError"
import { validateIata, validateDate, validateFlightNum, validateQuery } from "./api/_validate"

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
        const send = (status: number, data: any) => {
          res.statusCode = status
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify(data))
        }
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
            const err = validateIata(from, "from") || validateIata(to, "to") || validateDate(date, "date")
            if (err) { send(400, { error: err }); return }
            const key = env.RAPIDAPI_KEY
            if (!key) { send(500, { error: "Server configuration error" }); return }
            try {
              send(200, await searchFlights(from, to, date, key))
            } catch (e) {
              const m = errorToHttp(e, "Failed to fetch from AeroDataBox")
              send(m.status, { error: m.error })
            }
          } else if (p === "/api/flight-number") {
            const number = url.searchParams.get("number") ?? ""
            const date = url.searchParams.get("date") ?? ""
            const err = validateFlightNum(number) || validateDate(date, "date")
            if (err) { send(400, { error: err }); return }
            const key = env.RAPIDAPI_KEY
            if (!key) { send(500, { error: "Server configuration error" }); return }
            try {
              send(200, await lookupFlightNumber(number, date, key))
            } catch (e) {
              const m = errorToHttp(e, "Failed to fetch from AeroDataBox")
              send(m.status, { error: m.error })
            }
          } else if (p === "/api/places") {
            const type = url.searchParams.get("type") ?? ""
            const q = url.searchParams.get("q") ?? ""
            const check_in = url.searchParams.get("check_in") ?? ""
            const check_out = url.searchParams.get("check_out") ?? ""
            if (!type || !["activities", "dining", "hotels"].includes(type)) { send(400, { error: "type must be activities, dining, or hotels" }); return }
            const err = validateQuery(q)
              || (type === "hotels" ? validateDate(check_in, "check_in") || validateDate(check_out, "check_out") : null)
            if (err) { send(400, { error: err }); return }
            const key = env.GOOGLE_API_KEY
            if (!key) { send(500, { error: "Server configuration error" }); return }
            try {
              send(200, await searchPlaces(type, q, check_in, check_out, key))
            } catch (e) {
              const m = errorToHttp(e, `Failed to fetch ${type}`)
              send(m.status, { error: m.error })
            }
          } else if (p === "/api/images") {
            const q = url.searchParams.get("q") ?? ""
            const page = url.searchParams.get("page") ?? "1"
            const perPage = url.searchParams.get("per_page") ?? "9"
            const source = url.searchParams.get("source") ?? ""
            const err = validateQuery(q)
            if (err) { send(400, { error: err }); return }
            send(200, await searchImages(
              { q, page, perPage, source },
              { serpapi: env.SERPAPI_KEY, unsplash: env.UNSPLASH_ACCESS_KEY, pexels: env.PEXELS_API_KEY },
            ))
          } else if (p === "/api/image-proxy") {
            const photo = url.searchParams.get("photo") ?? ""
            const imageUrl = url.searchParams.get("url") ?? ""
            try {
              const { target } = resolveTarget(imageUrl || undefined, photo || undefined, env.GOOGLE_API_KEY)
              const { contentType, buffer } = await fetchImage(target)
              res.setHeader("Content-Type", contentType)
              res.setHeader("Cache-Control", "public, max-age=86400")
              res.end(buffer)
            } catch (e) {
              if (e instanceof HttpError) {
                if (e.message) send(e.status, { error: e.message })
                else { res.statusCode = e.status; res.end() }
              } else {
                send(502, { error: "Failed to fetch image" })
              }
            }
          } else if (p === "/api/geocode") {
            const q = url.searchParams.get("q") ?? ""
            const proximity = url.searchParams.get("proximity") ?? ""
            const mode = url.searchParams.get("mode") ?? ""
            if (!q) { send(400, { error: "Missing param: q" }); return }
            if (proximity && !PROXIMITY_RE.test(proximity)) { send(400, { error: "Invalid proximity — expected lng,lat" }); return }
            const token = env.MAPBOX_TOKEN
            if (!token) { send(500, { error: "MAPBOX_TOKEN not configured" }); return }
            try {
              send(200, mode === "suggest" ? await suggest(q, proximity, token) : await geocode(q, proximity, token))
            } catch (e) {
              const m = errorToHttp(e, "Failed to geocode")
              send(m.status, { error: m.error })
            }
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
