import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")

  return {
    plugins: [react()],
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
