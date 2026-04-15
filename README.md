# DAF Adventures

Internal travel planning and itinerary management platform for teams. Build, manage, and publish multi-day trip itineraries with flights, hotels, activities, and dining — all in one place.

## Features

- **Trip Dashboard** — Stats, upcoming trip carousel, live activity feed, and quick actions
- **Itinerary Builder** — Day-by-day event management with flights, hotels, activities, and dining
- **Interactive Map** — Route visualisation powered by Mapbox GL with marching-ants arc animation
- **World Destinations Map** — Mapbox globe with connection lines and pulsing destination markers
- **Team Directory** — Member table with sortable columns, compliance tracking, and reminder sending
- **Document Compliance** — Per-traveler doc status (Signed / Pending / Expired) with sign & remind actions
- **HR Documents Tab** — Aggregated compliance view with stats across all travelers
- **Reports Page** — Trip analytics and charts powered by Recharts
- **Media Library** — Upload, browse, and manage photos and videos across all trips with drag & drop; per-trip media tab also available in the workspace
- **Import Itinerary** — Upload PDF, Word, PowerPoint, or plain text — auto-parsed into trip events
- **AI Zap** — AI-assisted itinerary suggestions within the workspace
- **Command Palette** — Global ⌘K search across trips, pages, and actions
- **Grid & List Views** — Card grid and table layout for trip browsing
- **Dark / Light Mode** — Instant theme switching
- **Date Range Picker** — Calendar for selecting travel dates when creating trips
- **Search & Filter** — Live search across trips, travelers, and destinations
- **Local Persistence** — All data saved to localStorage (no backend needed)
- **Recent Trip Shortcut** — Sidebar quick-link to the last accessed trip workspace

## Demo Data

Comes preloaded with 8 fully detailed trips:

- Kenya Luxury Safari (22 events)
- Japan Discovery (10 events)
- Maldives Retreat (10 events)
- Amalfi Coast Tour (8 events)
- Iceland Coastal FAM (9 events)
- Bali VIP Retreat (12 events)
- Swiss Alps Winter FAM (10 events)
- New York Urban FAM (10 events)

## Tech Stack

- React 19 + TypeScript
- Vite 8
- Tailwind CSS 3
- Shadcn-style components (Dialog, DropdownMenu, Popover, Calendar, Badge)
- Lucide React icons
- Mapbox GL JS via `react-map-gl/mapbox` — workspace trip map + destinations globe
- Recharts — reports charts
- Embla Carousel — upcoming trips carousel
- TanStack Table — travelers table with sorting & pagination
- TanStack Virtual — virtual scrolling for large lists
- cmdk — command palette
- vaul — bottom drawer (add traveler form)
- motion — page transitions
- @number-flow/react — animated stat counters
- react-hotkeys-hook — keyboard shortcuts
- yet-another-react-lightbox — trip image lightbox
- date-fns + React Day Picker — date selection
- html2canvas + jsPDF — PDF export
- pdfjs-dist + mammoth + jszip — itinerary import parsing

## Getting Started

```bash
npm install --legacy-peer-deps
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173).

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your keys:

| Variable | Required | Purpose |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | Yes | Maps (workspace + destinations) |
| `VITE_GOOGLE_API_KEY` | Optional | Destination image search |
| `VITE_GOOGLE_CSE_ID` | Optional | Destination image search |
| `VITE_UNSPLASH_ACCESS_KEY` | Optional | Fallback image search (50 req/hr free) |

Without the image search keys the app uses a built-in image bank. Without the Mapbox token the maps will not render.
