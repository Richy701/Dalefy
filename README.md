# DAF Adventures

Internal travel planning and itinerary management platform for teams. Build, manage, and publish multi-day trip itineraries with flights, hotels, activities, and dining — all in one place.

## Features

- **Trip Dashboard** — Overview with stats, quick actions, upcoming timeline, and recent activity feed
- **Itinerary Builder** — Day-by-day event management with flights, hotels, activities, and dining
- **Interactive Map** — Real-time route visualisation powered by Leaflet with OpenStreetMap tiles
- **Grid & List Views** — Switch between card grid and table layout for trips
- **Dark / Light Mode** — Instant theme switching with no transition lag
- **Date Range Picker** — Styled calendar for selecting travel dates
- **Event Editor** — Side panel for adding and editing itinerary events with category-specific fields
- **Search & Filter** — Quick search across all trips by name or attendees
- **Local Persistence** — Trips saved to localStorage so data survives refreshes

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

- React 19 (TypeScript)
- Vite
- Tailwind CSS
- Shadcn UI (Radix primitives)
- Lucide React icons
- React Day Picker
- React Leaflet + Leaflet
- date-fns

## Getting Started

```bash
npm install
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173).
