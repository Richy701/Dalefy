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
- **Location autocomplete** — Mapbox Geocoding-powered address search in the event editor
- Interactive route map powered by Mapbox GL with marching-ants arc animation and **animated plane markers** flying along flight arcs
- Per-trip media tab alongside the itinerary
- AI Zap — AI-assisted itinerary suggestions
- **PDF export** via html2canvas + jsPDF with Mapbox Static Image route map header
- Organizer contact fields (name, role, company, email, phone) in trip edit
- Information & documents section — repeatable title + body entries per trip
- Event description field (visible to travelers) separate from internal agent notes
- **Per-event traveler assignment** — assign specific travelers to individual events with Everyone/Specific toggle
- **Re-import itinerary** — upload a new version of a document to update an existing trip's events, travelers, and info without losing media or images
- One-click publish with push notifications to mobile devices
- Shareable trip links (public, no auth required)
- **Trip PIN** — every published trip gets a 4-digit PIN auto-allocated in Supabase, shown as the hero on the share-pass stub so travelers can type it directly on mobile (no pasting required)

### Destinations
- Dashboard-style hero banner with 3D globe (Mapbox `globe` projection + terrain + atmosphere)
- **Heatmap layer** — accent-colored density visualization of travel activity
- Connection lines between visited destinations via GeoJSON layers
- **Animated planes** flying along connection lines
- Prev/next navigation buttons to fly between destinations
- Enhanced tooltip with trip count, event count, and event-type breakdown
- Geocoding-powered coordinates (no hardcoded location data)
- Region filtering and search
- Tall destination cards with event breakdown

### Import Parser
- Parses PDF, Word (.docx), PowerPoint (.pptx), and plain text itineraries
- Extracts trip name, dates, destination, attendees, and events automatically
- **Traveler auto-linking** — parsed attendee names are matched to existing travelers or created as new ones, linked to the trip and visible on the Travelers page
- **Information extraction** — pulls accommodation details, additional activities, notes, and other info sections into editable Information & Documents cards
- Attendee names shown as individual chips in the import preview
- Editable info cards in the preview — modify titles and content before importing
- Media deduplication on re-import (same URL overwrites, doesn't duplicate)

### Travelers
- Sortable member table with role, status, and compliance columns
- Per-traveler document compliance tracking (Signed / Pending / Expired)
- Sign & remind actions with confirmation dialogs
- Drawer-based add-traveler form (vaul)
- HR Documents tab — aggregated compliance view with virtual scrolling
- **Auto-populated from imports** — travelers extracted from itinerary documents appear automatically

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

- 3-tab layout: Trips, World, Me
- **Live countdown** — ticking D:H:M:S departure counter on the home banner
- Trip detail screen with parallax hero, route map, organizer card, and compact day summary rows
- **Flight arc lines** — great-circle arcs with animated plane markers on the trip detail map
- **Heatmap + animated planes** on the destinations world map
- Day detail drill-in screen with full event cards
- Organizer contact card with call/email actions
- Information & documents section per trip
- Compliance document tracking with sign/remind actions
- Brand logo mark inline with "DAF Adventures" across every header and footer
- iOS overscroll bounce matches the app background (no white flash on pull-down)
- Real-time sync with web app via Supabase Realtime
- Offline-first — AsyncStorage cache with cloud sync
- Push notifications when trips are published/updated
- Deep linking (`dafadventures://shared/:tripId`)
- Shared trip screen for public trip links
- **Trip PIN entry** — passport modal with PIN, QR scan, and link paste modes
- Onboarding welcome screen with name entry and notification permission
- Settings screen with appearance, notification, and account options
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
6. **4-digit Trip PIN** — on share, web allocates a unique `short_code` per trip; mobile accepts the PIN and resolves to the UUID for navigation
7. **Graceful column fallback** — Supabase upserts progressively strip optional columns (`traveler_ids`, `travelers`, `organizer`, `info`) on failure; localStorage preserves these fields and merges them back on every fetch

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

Additional migrations live in `supabase/migrations/` and can be applied with the Supabase CLI:

```bash
supabase db push --linked
```

Current migrations:
- `20260416_add_short_code.sql` — adds the 4-digit `short_code` column + partial unique index for Trip PIN lookups

---

## Deployment

Web is deployed on Vercel. The `vercel.json` sets `installCommand` to use `--legacy-peer-deps` and `buildCommand` to `vite build`. The `mobile/` directory is excluded via `.vercelignore`.
