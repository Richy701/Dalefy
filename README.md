# Dalefy

Trip planning without the mess. A modern travel management platform for organizers and travelers.

## Features

- **Trip Management** -- Create, edit, and organize trips with itineraries, travelers, budgets, and documents
- **Itinerary Import** -- Paste or upload travel documents and auto-parse them into structured events
- **Live Search** -- Search flights (AeroDataBox), hotels (Booking.com), restaurants (TripAdvisor), and activities (Local Business Data) directly in the workspace
- **Flight Status Notifications** -- Automated cron checks flight status every 30 minutes and pushes updates (delays, gate changes, cancellations) to travelers
- **Image Search** -- Multi-source image search (Google, Unsplash, Pexels) with provider picker
- **Real-time Sync** -- Firebase-backed data with per-user scoping and live updates
- **Mobile Companion** -- Expo React Native app for travelers to join trips via PIN code or QR scan
- **Interactive Maps** -- Mapbox-powered trip maps with animated routes and destination explorer
- **White-label Branding** -- Organization system with custom logos, colors, and agency theming
- **PDF Export** -- Polished PDF itineraries with cover images and static map headers
- **Unified Theming** -- Single brand accent color across all event types, light and dark modes
- **Push Notifications** -- Trip update and flight status alerts for travelers via Expo push notifications
- **PWA Support** -- Installable as a progressive web app with offline caching

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS
- **UI Components:** Radix UI, Shadcn-style, Motion (Framer Motion v12)
- **Backend:** Firebase Auth, Firestore, Firebase Storage
- **APIs:** RapidAPI (AeroDataBox, Booking.com, TripAdvisor16, Local Business Data, Real-Time Image Search), Unsplash, Pexels
- **Maps:** Mapbox GL JS via react-map-gl
- **Charts:** Recharts
- **Routing:** react-router-dom v7 (HashRouter)
- **PDF:** html2canvas + jsPDF
- **Mobile:** Expo / React Native (in `/mobile`)

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

## API Endpoints

Serverless functions in `api/`:

| Endpoint | API | Description |
|---|---|---|
| `/api/flights` | AeroDataBox | Airport departures search by route and date |
| `/api/flight-number` | AeroDataBox | Flight lookup by number and date |
| `/api/hotels` | Booking.com | Hotel search with check-in/check-out dates |
| `/api/activities` | Local Business Data | Things to do search by location |
| `/api/dining` | TripAdvisor16 | Restaurant search by location |
| `/api/images` | Google / Unsplash / Pexels | Image search with source selection |
| `/api/check-flight-status` | AeroDataBox + Firebase | Cron: checks flight status and pushes notifications |

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

# Flight status cron
CRON_EMAIL=
CRON_PASSWORD=
CRON_SECRET=
```

Without Firebase credentials, the app runs in demo mode with localStorage-only data.

## Deployment

Hosted on [Vercel](https://dalefy.vercel.app). Push to `main` to trigger a production deployment.

The flight status cron runs every 30 minutes via Vercel Cron Jobs.

```bash
# Manual deploy
vercel --prod
```

## License

Private.
