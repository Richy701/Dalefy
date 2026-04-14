# DAF Adventures

Internal travel planning and itinerary management platform for teams. Build, manage, and publish multi-day trip itineraries with flights, hotels, activities, and dining — all in one place.

## Features

- **Trip Dashboard** — Stats, quick actions, upcoming trip carousel, and live activity feed
- **Itinerary Builder** — Day-by-day event management with flights, hotels, activities, and dining
- **Interactive Map** — Route visualisation powered by Leaflet with OpenStreetMap tiles
- **World Destinations Map** — react-simple-maps globe with connection arcs and hover tooltips
- **Team Directory** — Member table with sortable columns, compliance document tracking, and reminder sending
- **Document Compliance** — Per-traveler doc status (Signed / Pending / Expired) with sign & remind actions
- **HR Documents Tab** — Aggregated doc view with stats across all travelers
- **Reports Page** — Trip analytics with charts powered by Recharts
- **Media Library** — Dedicated `/media` page to upload, browse, and manage photos and videos across all trips; per-trip media tab also available in the workspace
- **Import Itinerary** — Upload PDF, Word, PowerPoint, or plain text — auto-parsed into trip events
- **AI Zap** — AI-assisted itinerary suggestions within the workspace
- **Grid & List Views** — Card grid and table layout for trip browsing
- **Dark / Light Mode** — Instant theme switching
- **Date Range Picker** — Calendar for selecting travel dates when creating trips
- **Search & Filter** — Live search across trips, travelers, and destinations
- **Local Persistence** — All data saved to localStorage (survives refreshes, no backend needed)
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
- Base UI (`@base-ui/react`) — headless primitives
- Lucide React icons
- React Leaflet + Leaflet — workspace trip map
- react-simple-maps — destinations world map
- Recharts — reports charts
- Embla Carousel — upcoming trips carousel
- TanStack Table — travelers table with sorting & pagination
- date-fns + React Day Picker
- html2canvas + jsPDF — PDF export
- pdfjs-dist + mammoth + jszip — itinerary import parsing
- NumberFlow — animated stat counters
- yet-another-react-lightbox — trip image lightbox

## Getting Started

```bash
npm install --legacy-peer-deps
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173).

## Image Search (Optional)

Copy `.env.local.example` to `.env.local` and fill in your API keys for destination image search:

- **Google Custom Search** — 100 free searches/day
- **Unsplash** — fallback, 50 req/hr free

Without keys the app uses a built-in image bank.
