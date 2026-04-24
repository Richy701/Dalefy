# Dalefy

Trip planning without the mess. A modern travel management platform for organizers and travelers.

## Features

- **Trip Management** -- Create, edit, and organize trips with itineraries, travelers, budgets, and documents
- **AI-Powered Itinerary Import** -- Upload travel documents (PDF, Word, PowerPoint, text) and parse them with Claude Haiku 4.5 into structured events with polished descriptions, internal agent notes, traveler extraction, and info sections. Falls back to offline heuristic parser when AI is unavailable
- **Live Search** -- Search flights (AeroDataBox), hotels (Booking.com), restaurants (Local Business Data), and activities (Local Business Data) directly in the workspace
- **Flight Status Notifications** -- Automated cron checks flight status every 30 minutes and pushes updates (delays, gate changes, cancellations) to travelers
- **Image Search** -- Multi-source image search (Google, Unsplash, Pexels) with provider picker
- **Real-time Sync** -- Firebase-backed data with per-user scoping and live updates
- **Mobile Companion** -- Expo React Native app for travelers to join trips via PIN code or QR scan
- **Interactive Maps** -- Mapbox-powered trip maps with animated routes and destination explorer
- **White-label Branding** -- Organization system with custom logos, colors, and agency theming
- **PDF Export** -- Polished PDF itineraries with cover images and static map headers
- **Unified Theming** -- Single brand accent color across all event types, light and dark modes
- **iOS Live Activities & Dynamic Island** -- Real-time flight tracking on the Lock Screen and Dynamic Island with airport codes, times, status, and gate info. Automatically starts 
for today's flights and updates live via the flight status cron
- **Push Notifications** -- Trip update and flight status alerts for travelers via Expo push notifications
- **PWA Support** -- Installable as a progressive web app with offline caching

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS
- **UI Components:** Radix UI, Shadcn-style, Motion (Framer Motion v12)
- **Backend:** Firebase Auth, Firestore, Firebase Storage
- **AI:** Anthropic Claude Haiku 4.5 (itinerary parsing)
- **APIs:** RapidAPI (AeroDataBox, Booking.com, Local Business Data), Unsplash, Pexels
- **Maps:** Mapbox GL JS via react-map-gl
- **Charts:** Recharts
- **Routing:** react-router-dom v7 (HashRouter)
- **PDF:** html2canvas + jsPDF
- **Mobile:** Expo / React Native (in `/mobile`), expo-widgets (Live Activities + Dynamic Island)

## Getting Started

```bash
# Install dependencies (legacy peer deps required for React 19 compat)
npm install --legacy-peer-deps

# Start dev server
npm run dev
```

## Mobile App

```bash
cd mobile
npm install
npx expo start --ios
```

The mobile app is traveler-facing — no admin features, PIN-based trip joining, and branding inherited from the trip's organization.

### Live Activities & Dynamic Island

Flight tracking runs as an iOS Live Activity, showing real-time data on the Lock Screen and Dynamic Island:

- **Dynamic Island expanded**: Airport codes (leading/trailing), flight number + airplane icon (center), departure/arrival times + status pill (bottom)
- **Dynamic Island compact**: Airplane icon + departure code (leading), arrival code (trailing)
- **Lock Screen banner**: Full flight board with route, times, gate, and status

The `useFlightLiveActivity` hook automatically starts activities for today's flights, updates them when Firestore data changes, and ends them when a flight lands or is cancelled. Airport codes are resolved from Firestore fields (`depAirport`/`arrAirport`), location parsing, or a fallback API call.

## API Endpoints

Serverless functions in `api/` — all endpoints validate input and return generic errors (no internal details leaked).

| Endpoint | Auth | Description |
|---|---|---|
| `/api/flights` | — | Airport departures search by route and date |
| `/api/flight-number` | — | Flight lookup by number and date |
| `/api/hotels` | — | Hotel search with check-in/check-out dates |
| `/api/activities` | — | Things to do search by location |
| `/api/dining` | — | Restaurant search by location |
| `/api/images` | — | Image search with source selection (Google, Unsplash, Pexels) |
| `/api/image-proxy` | — | SSRF-protected image proxy (HTTPS only, private IPs blocked, 5MB limit) |
| `/api/parse-itinerary` | — | AI-powered itinerary parsing via Claude Haiku 4.5 — extracts events, travelers, info sections |
| `/api/push` | Bearer | Push notifications — requires CRON_SECRET or Firebase auth token |
| `/api/check-flight-status` | Bearer | Cron (every 30 min): checks flight status, saves airport codes, and pushes updates to travelers |

## Security

- **API input validation** — dates, IATA codes, search queries, and flight numbers validated on all endpoints
- **SSRF protection** — image proxy blocks private/internal IPs, enforces HTTPS, verifies image content-type, 5s timeout, 5MB limit
- **CORS** — restricted to production domain and localhost dev
- **CSP** — Content-Security-Policy header on all responses
- **Push auth** — `/api/push` requires bearer token (cron secret or Firebase ID token)
- **Firestore rules** — scoped reads/writes per user, org admin checks, cron user allowlist
- **Storage rules** — org admin required for logo uploads, image types only (no SVG)
- **Trip PINs** — 6-character alphanumeric codes (no ambiguous chars like 0/O/1/I)
- **SVG sanitization** — DOMPurify with filters disabled to prevent external resource loading

## Environment Variables

Create a `.env.local` file in the project root:

```env
# Firebase (required for auth and cloud sync)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Mapbox (required for maps)
VITE_MAPBOX_TOKEN=

# RapidAPI (single key for AeroDataBox, Booking.com, TripAdvisor16, Local Business Data, Real-Time Image Search)
RAPIDAPI_KEY=

# Image search (optional fallbacks)
UNSPLASH_ACCESS_KEY=
PEXELS_API_KEY=

# AI itinerary parsing (Claude Haiku 4.5)
ANTHROPIC_API_KEY=

# Flight status cron
CRON_EMAIL=
CRON_PASSWORD=
CRON_SECRET=
```

Without Firebase credentials, the app runs in demo mode with localStorage-only data.

## Deployment

Hosted on [Vercel](https://dalefy.vercel.app). Push to `main` to trigger a production deployment.

The flight status cron runs daily via Vercel Cron Jobs. AI itinerary parsing requires an `ANTHROPIC_API_KEY` — without it, the import falls back to the offline heuristic parser.

```bash
# Manual deploy
vercel --prod
```

## License

Private.
