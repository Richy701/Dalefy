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
          target: "https://serpapi.com",
          changeOrigin: true,
          rewrite: (p) => {
            const qs = p.split("?")[1] ?? ""
            const params = new URLSearchParams(qs)
            params.set("engine", "google_flights")
            params.set("api_key", env.SERPAPI_KEY ?? "")
            return `/search?${params}`
          },
        },
        "/api/hotels": {
          target: "https://serpapi.com",
          changeOrigin: true,
          rewrite: (p) => {
            const qs = p.split("?")[1] ?? ""
            const params = new URLSearchParams(qs)
            params.set("engine", "google_hotels")
            params.set("api_key", env.SERPAPI_KEY ?? "")
            return `/search?${params}`
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
            const uKey = env.UNSPLASH_ACCESS_KEY
            if (uKey && q) {
              try {
                const params = new URLSearchParams({ query: q, per_page: perPage, page, orientation: "landscape", client_id: uKey })
                const resp = await fetch(`https://api.unsplash.com/search/photos?${params}`)
                if (resp.ok) {
                  const data = await resp.json()
                  const urls = (data.results ?? []).map((r: any) => r.urls?.regular).filter(Boolean)
                  if (urls.length) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ urls, source: "unsplash" })); return }
                }
              } catch {}
            }
            const pKey = env.PEXELS_API_KEY
            if (pKey && q) {
              try {
                const params = new URLSearchParams({ query: q, per_page: perPage, page, orientation: "landscape" })
                const resp = await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: pKey } })
                if (resp.ok) {
                  const data = await resp.json()
                  const urls = (data.photos ?? []).map((p: any) => p.src?.landscape || p.src?.large).filter(Boolean)
                  if (urls.length) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ urls, source: "pexels" })); return }
                }
              } catch {}
            }
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ urls: [], source: null }))
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
