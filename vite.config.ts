import path from "path"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig, loadEnv } from "vite"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
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
    optimizeDeps: {
      include: ["embla-carousel-react", "embla-carousel"],
    },
    server: {
      proxy: {
        "/api/flights": {
          target: "http://localhost:3000",
          changeOrigin: true,
          bypass: async (req, res) => {
            const url = new URL(req.url!, `http://${req.headers.host}`)
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
              const d1 = r1.ok ? await r1.json() : {}
              const d2 = r2.ok ? await r2.json() : {}
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
          },
        },
        "/api/flight-number": {
          target: "http://localhost:3000",
          changeOrigin: true,
          bypass: async (req, res) => {
            const url = new URL(req.url!, `http://${req.headers.host}`)
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
                const depMins = timeToMins(depTime)
                const arrMins = timeToMins(arrTime)
                const duration = arrMins >= depMins ? arrMins - depMins : arrMins + 1440 - depMins
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
                }
              })
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ flights }))
            } catch {
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ flights: [] }))
            }
          },
        },
        "/api/hotels": {
          target: "http://localhost:3000",
          changeOrigin: true,
          bypass: async (req, res) => {
            const url = new URL(req.url!, `http://${req.headers.host}`)
            const q = url.searchParams.get("q") ?? ""
            const check_in = url.searchParams.get("check_in") ?? ""
            const check_out = url.searchParams.get("check_out") ?? ""
            const adults = url.searchParams.get("adults") ?? "2"
            const key = env.RAPIDAPI_KEY
            const RAPID_HOST = "booking-com15.p.rapidapi.com"
            const hdrs = { "x-rapidapi-key": key, "x-rapidapi-host": RAPID_HOST }
            if (!key || !q || !check_in || !check_out) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ hotels: [] })); return }
            try {
              // Step 1: resolve destination
              const destResp = await fetch(`https://${RAPID_HOST}/api/v1/hotels/searchDestination?query=${encodeURIComponent(q)}`, { headers: hdrs })
              const destData = await destResp.json()
              const dest = destData.data?.[0]
              if (!dest) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ hotels: [] })); return }
              // Step 2: search hotels
              const params = new URLSearchParams({ dest_id: dest.dest_id, search_type: dest.search_type ?? "city", arrival_date: check_in, departure_date: check_out, adults, room_qty: "1", currency_code: "USD" })
              const hotelResp = await fetch(`https://${RAPID_HOST}/api/v1/hotels/searchHotels?${params}`, { headers: hdrs })
              const hotelData = await hotelResp.json()
              const nights = Math.max(1, Math.round((new Date(check_out).getTime() - new Date(check_in).getTime()) / 86400000))
              const hotels = (hotelData.data?.hotels ?? []).slice(0, 8).map((h: any) => {
                const p = h.property ?? {}
                const price = p.priceBreakdown?.grossPrice?.value
                const perNight = price ? Math.round(price / nights) : 0
                return {
                  name: p.name ?? "",
                  rating: p.reviewScore ?? 0,
                  reviews: p.reviewCount ?? 0,
                  pricePerNight: perNight > 0 ? `$${perNight}` : "",
                  image: p.photoUrls?.[0] ?? "",
                  checkin: p.checkin?.fromTime ?? "",
                  checkout: p.checkout?.untilTime ?? "",
                  amenities: [],
                  stars: p.propertyClass ? `${p.propertyClass}-star` : "",
                }
              })
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ hotels }))
            } catch {
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ hotels: [] }))
            }
          },
        },
        "/api/activities": {
          target: "http://localhost:3000",
          changeOrigin: true,
          bypass: async (req, res) => {
            const url = new URL(req.url!, `http://${req.headers.host}`)
            const q = url.searchParams.get("q") ?? ""
            const key = env.RAPIDAPI_KEY
            const HOST = "local-business-data.p.rapidapi.com"
            if (!key || !q) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ activities: [] })); return }
            try {
              const params = new URLSearchParams({ query: `things to do in ${q}`, limit: "8" })
              const resp = await fetch(`https://${HOST}/search?${params}`, {
                headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST },
              })
              const data = await resp.json()
              const activities = (data.data ?? []).slice(0, 8).map((a: any) => ({
                name: a.name ?? "",
                rating: a.rating ?? 0,
                reviews: a.review_count ?? 0,
                image: a.photos_sample?.[0]?.photo_url_large ?? "",
                address: a.full_address ?? "",
                type: a.type ?? "",
                openStatus: a.opening_status ?? "",
              }))
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ activities }))
            } catch {
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ activities: [] }))
            }
          },
        },
        "/api/dining": {
          target: "http://localhost:3000",
          changeOrigin: true,
          bypass: async (req, res) => {
            const url = new URL(req.url!, `http://${req.headers.host}`)
            const q = url.searchParams.get("q") ?? ""
            const key = env.RAPIDAPI_KEY
            const HOST = "tripadvisor16.p.rapidapi.com"
            if (!key || !q) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ restaurants: [] })); return }
            try {
              const hdrs = { "x-rapidapi-key": key, "x-rapidapi-host": HOST }
              const locResp = await fetch(`https://${HOST}/api/v1/restaurant/searchLocation?query=${encodeURIComponent(q)}`, { headers: hdrs })
              const locData = await locResp.json()
              const loc = locData.data?.[0]
              if (!loc) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ restaurants: [] })); return }
              const resp = await fetch(`https://${HOST}/api/v1/restaurant/searchRestaurants?locationId=${loc.locationId}`, { headers: hdrs })
              const data = await resp.json()
              const restaurants = (data.data?.data ?? []).slice(0, 8).map((r: any) => ({
                name: r.name ?? "",
                rating: r.averageRating ?? 0,
                reviews: r.userReviewCount ?? 0,
                image: r.heroImgUrl ?? "",
                address: r.parentGeoName ?? "",
                priceTag: r.priceTag ?? "",
                cuisines: (r.establishmentTypeAndCuisineTags ?? []).slice(0, 3),
                openStatus: r.currentOpenStatusText ?? "",
              }))
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ restaurants }))
            } catch {
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ restaurants: [] }))
            }
          },
        },
        "/api/images": {
          target: "http://localhost:3000",
          changeOrigin: true,
          bypass: async (req, res) => {
            const url = new URL(req.url!, `http://${req.headers.host}`)
            const q = url.searchParams.get("q") ?? ""
            const page = url.searchParams.get("page") ?? "1"
            const perPage = url.searchParams.get("per_page") ?? "9"
            const src = url.searchParams.get("source") ?? ""
            const json = (d: any) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(d)) }

            const tryGoogle = async () => {
              const rKey = env.RAPIDAPI_KEY
              if (!rKey) return false
              try {
                const params = new URLSearchParams({ query: q, num: perPage })
                const resp = await fetch(`https://real-time-image-search.p.rapidapi.com/search?${params}`, {
                  headers: { "x-rapidapi-key": rKey, "x-rapidapi-host": "real-time-image-search.p.rapidapi.com" },
                })
                if (resp.ok) {
                  const data = await resp.json()
                  const urls = (data.data ?? []).map((i: any) => i.thumbnail_url).filter((u: string) => u && !u.includes('encrypted-tbn'))
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
          },
        },
        "/api/image-proxy": {
          target: "http://localhost:3000",
          changeOrigin: true,
          bypass: async (req, res) => {
            const reqUrl = new URL(req.url!, `http://${req.headers.host}`)
            const imageUrl = reqUrl.searchParams.get("url") ?? ""
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
          },
        },
        "/api/geocode": {
          target: "http://localhost:3000",
          changeOrigin: true,
          bypass: async (req, res) => {
            const url = new URL(req.url!, `http://${req.headers.host}`)
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
          },
        },
      },
    },
  }
})
