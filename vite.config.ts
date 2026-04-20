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
          name: "DAF Adventures", // Update in src/config/brand.ts when renaming
          short_name: "DAF",     // Update in src/config/brand.ts when renaming
          description: "Plan & manage trips together",
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
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
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
      },
    },
  }
})
