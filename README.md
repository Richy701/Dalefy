# DAF Adventures

Internal travel planning and itinerary management platform for teams. Build, manage, and publish multi-day trip itineraries with flights, hotels, activities, and dining — all in one place. Includes a companion mobile app with real-time sync.

---

## Features

### Dashboard
- Animated stat counters (trips, travelers, destinations, revenue)
- Upcoming trips carousel with spotlight view
- "For your X Trip" event cards with a dedicated right-side time block (weekday / big time / AM·PM / date)
- Live activity feed and quick-action buttons
- Drag-and-drop file import — drop a PDF, Word doc, PPTX, or TXT directly onto the page to parse it into a trip
- Grid and list view toggle with live search

### Workspace (Itinerary Builder)
- Day-by-day event management — flights, hotels, activities, dining
- Inline event editor with date picker, time, notes, and tags
- Interactive route map powered by Mapbox GL with marching-ants arc animation
- Per-trip media tab alongside the itinerary
- AI Zap — AI-assisted itinerary suggestions
- PDF export via html2canvas + jsPDF
- One-click publish with push notifications to mobile devices
- Shareable trip links (public, no auth required)

### Destinations
- Mapbox world map with pulsing destination markers
- Connection lines between visited destinations via GeoJSON layers
- Region filtering and search
- Tall destination cards with event breakdown

### Travelers
- Sortable member table with role, status, and compliance columns
- Per-traveler document compliance tracking (Signed / Pending / Expired)
- Sign & remind actions with confirmation dialogs
- Drawer-based add-traveler form (vaul)
- HR Documents tab — aggregated compliance view with virtual scrolling

### Reports
- Operations overview with Recharts bar, line, and pie charts
- Documents compliance tab
- Tab switcher between views

### Media Library
- Upload, browse, and manage photos and videos across all trips
- Drag-and-drop upload with lightbox preview

### Global
- Command palette (Cmd+K) — search trips, navigate pages, trigger actions
- Dark / light mode with instant switching (also toggleable from the sidebar)
- Accent color picker — 6 swatches (Cyber Teal, Electric Violet, Solar Amber, Crimson, Cobalt, Lime) that swap the brand color everywhere, including Recharts data viz, via a runtime CSS custom property
- Compact mode, toast notifications toggle, and success-sound chime — all persisted in Settings → Appearance / Notifications
- Brand logo mark rendered in the sidebar header and across mobile screens
- Sidebar with collapsible icon mode, recent trip shortcut, theme toggle, user footer
- Notification panel — bell popover with unread count and mark-all-read
- Mobile-responsive with sheet-based sidebar on small screens
- Smooth page transitions via Motion

### New Trip Form
- Full-width inline date range picker with seamless range highlight
- Currency selector (pill buttons)
- Budget field (numbers only)
- Cover image: paste a URL or type a destination name to auto-fetch a banner

---

## Mobile App

Companion Expo React Native app in the `mobile/` directory.

- 5-tab layout: Trips, World, Plan, Gallery, Me
- Trip detail screen with hero banner, route map, and day-by-day itinerary
- Brand logo mark inline with "DAF Adventures" across every header and footer
- iOS overscroll bounce matches the app background (no white flash on pull-down)
- Real-time sync with web app via Supabase Realtime
- Offline-first — AsyncStorage cache with cloud sync
- Push notifications when trips are published/updated
- Deep linking (`dafadventures://shared/:tripId`)
- Shared trip screen for public trip links
- Dark/light theme with system detection
- Notification center with persistent history

---

## Sync Architecture

The web and mobile apps sync through Supabase:

1. **Web publishes a trip** — upserts to Supabase `trips` table
2. **Mobile subscribes** — Realtime Postgres changes push updates instantly
3. **Offline support** — mobile caches trips in AsyncStorage, syncs when connected
4. **Push notifications** — web sends via Expo Push API to all registered devices
5. **Shareable links** — public route (`/shared/:tripId`) fetches directly from Supabase

Without Supabase configured, both apps fall back to local storage (no sync).

---

## Demo Data

Comes preloaded with 8 fully detailed trips:

| Trip | Events |
|---|---|
| Kenya Luxury Safari | 22 |
| Japan Discovery | 10 |
| Maldives Retreat | 10 |
| Amalfi Coast Tour | 8 |
| Iceland Coastal FAM | 9 |
| Bali VIP Retreat | 12 |
| Swiss Alps Winter FAM | 10 |
| New York Urban FAM | 10 |

---

## Tech Stack

### Web

| Layer | Library |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS 3 |
| Components | Shadcn-style (Base UI v1) — Dialog, Tabs, Select, Popover, Tooltip, Avatar, Badge |
| Icons | Lucide React |
| Maps | Mapbox GL JS via `react-map-gl/mapbox` |
| Charts | Recharts |
| Carousel | Embla Carousel |
| Table | TanStack Table |
| Virtual scroll | TanStack Virtual |
| Command palette | cmdk |
| Drawer | vaul |
| Page transitions | motion (`motion/react`) |
| Animated counters | @number-flow/react |
| Keyboard shortcuts | react-hotkeys-hook |
| Lightbox | yet-another-react-lightbox |
| Dates | date-fns + React Day Picker |
| PDF export | html2canvas + jsPDF |
| Import parsing | pdfjs-dist + mammoth + jszip |
| Backend sync | Supabase (Realtime + Postgres) |

### Mobile

| Layer | Library |
|---|---|
| Framework | Expo SDK + React Native |
| Routing | Expo Router (file-based) |
| Maps | @rnmapbox/maps |
| Fonts | @expo-google-fonts/barlow-condensed |
| Notifications | expo-notifications |
| Storage | @react-native-async-storage/async-storage |
| Backend sync | Supabase JS Client |

---

## Getting Started

### Web

```bash
npm install --legacy-peer-deps
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173).

> **Note:** `--legacy-peer-deps` is required due to a react-day-picker peer dep conflict with React 19.

### Mobile

```bash
cd mobile
npm install
npx expo start
```

---

## Environment Variables

### Web

Copy `.env.local.example` to `.env.local`:

| Variable | Required | Purpose |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | **Yes** | Workspace map + destinations globe |
| `VITE_SUPABASE_URL` | Optional | Supabase project URL for trip sync |
| `VITE_SUPABASE_ANON_KEY` | Optional | Supabase anon key for trip sync |
| `VITE_UNSPLASH_ACCESS_KEY` | Optional | Image search (50 req/hr free) |
| `VITE_PEXELS_API_KEY` | Optional | Fallback image search |

Without `VITE_MAPBOX_TOKEN` the maps will not render. Without Supabase keys the app uses localStorage only.

### Mobile

Create `mobile/.env`:

| Variable | Required | Purpose |
|---|---|---|
| `EXPO_PUBLIC_MAPBOX_TOKEN` | **Yes** | Map rendering |
| `EXPO_PUBLIC_SUPABASE_URL` | Optional | Trip sync |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Optional | Trip sync |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Optional | Push notification token registration |

> **Important:** Never commit `.env.local` or `mobile/.env` — they contain API keys. Only `.env.local.example` is tracked.

---

## Supabase Setup

Run in the Supabase SQL Editor to create the required tables:

```sql
-- See supabase-setup.sql for full DDL
```

---

## Deployment

Web is deployed on Vercel. The `vercel.json` sets `installCommand` to use `--legacy-peer-deps` and `buildCommand` to `vite build`. The `mobile/` directory is excluded via `.vercelignore`.
