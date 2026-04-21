# Dalefy

Trip planning without the mess. A modern travel management platform for organizers and travelers.

## Features

- **Trip Management** -- Create, edit, and organize trips with itineraries, travelers, budgets, and documents
- **Real-time Sync** -- Firebase-backed data with per-user scoping and live updates
- **Mobile Companion** -- Expo React Native app for travelers to join trips via PIN code or QR scan
- **Interactive Maps** -- Mapbox-powered trip maps with animated routes and destination explorer
- **White-label Branding** -- Agency code system for custom logos, colors, and organization theming
- **PDF Reports** -- Export trip summaries and itineraries as polished PDFs
- **PWA Support** -- Installable as a progressive web app with offline caching

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS
- **UI Components:** Radix UI, Shadcn-style, Motion (Framer Motion v12)
- **Backend:** Firebase Auth, Firestore, Firebase Storage
- **Maps:** Mapbox GL JS via react-map-gl
- **Charts:** Recharts
- **Routing:** react-router-dom v7 (HashRouter)
- **Mobile:** Expo / React Native (in `/mobile`)

## Getting Started

```bash
# Install dependencies (legacy peer deps required for React 19 compat)
npm install --legacy-peer-deps

# Start dev server
npm run dev
```

## Environment Variables

Create a `.env` file in the project root:

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

# Optional -- image search
VITE_UNSPLASH_ACCESS_KEY=
PEXELS_API_KEY=
```

Without Firebase credentials, the app runs in demo mode with localStorage-only data.

## Deployment

Hosted on [Vercel](https://dalefy.vercel.app). Push to `main` to trigger a production deployment.

```bash
# Manual deploy
vercel --prod
```

## License

Private.
