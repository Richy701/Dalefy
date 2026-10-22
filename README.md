# Dalefy

Trip planning without the mess. A modern travel management platform for organizers and travelers.

## Features

- **Trip Management** -- Create, edit, and organize trips with itineraries, travelers, budgets, and documents
- **AI-Powered Itinerary Import** -- Upload travel documents (PDF, Word, PowerPoint, text) and parse them with Claude Haiku 4.5 into structured events with polished descriptions, internal agent notes, traveler extraction, and info sections. Falls back to offline heuristic parser when AI is unavailable
- **Live Search** -- Search flights (AeroDataBox), hotels, restaurants, and activities (Google Places API) directly in the workspace
- **Flight Status Notifications** -- Automated daily cron checks flight status and pushes updates (delays, gate changes, cancellations) to travelers. On-demand status checks when viewing trips with upcoming flights
- **Image Search** -- Multi-source image search (SerpAPI Google Images, Unsplash, Pexels) with provider picker
- **Invite-only Team System** -- Admin sends invites, team members join via link. Google OAuth and email/password sign-in supported
- **Email Verification** -- New email/password signups receive verification emails with resend and status check in-app
- **Role-based Access** -- Owner, admin, agent, and viewer roles with UI gating (sidebar, settings sections, team management)
- **Leader-only Info Pages** -- Toggle info pages as "leader only" so sensitive data (pricing, PNR, supplier details) is hidden from travelers on mobile
- **Draft/Publish System** -- Edits stay as drafts until explicitly published. Mobile travelers only see the last published version, not work-in-progress changes. Amber indicator shows when unpublished changes exist
- **Mobile Preview** -- Live phone-frame preview in the workspace that renders the real mobile trip screens (itinerary, event and flight pages, Trip info) from `mobile/` via React Native Web, inside an iPhone 17 Pro or Pixel 10 Pro frame. Preview settings cover screen width, text size, a "simulate today" stepper, role (traveller or leader) and dark/light. It rebuilds with every website deploy, so it only updates when `npm run build` passes (see `mobile-preview/README.md`)
- **Real-time Sync** -- Firebase-backed data with per-user scoping and live updates
- **Media Library** -- Upload photos and videos from mobile or web, organized by trip with gallery view, lightbox with in-place video playback, multi-select with zip download, and per-trip filtering. HEIC auto-converted to JPEG for web compatibility. 500 MB per file limit
- **Mobile Companion** -- Expo React Native app with four tabs (Home, Today, Gallery, Profile) for travellers. Join a trip with a PIN, a QR scan or a pasted invite link; every trip page uses the same photo-led design in light and dark mode
- **Trip Links** -- Share links are `https://dalefy.vercel.app/shared/{id}` (also `dalefy.app`). They open the app through iOS universal links and Android app links, fall back to the web trip page, and unfurl with the trip's own title, dates and cover photo in Messages, WhatsApp, Slack and the iOS share sheet
- **Interactive Maps** -- Mapbox-powered trip maps with Standard 3D basemap on the Today tab (pitched city view with 3D buildings, facades, trees, landmarks), flat Standard style on trip detail, animated flight routes, native symbol-layer plane markers, and destination explorer
- **Landing Page** -- Public marketing page with interactive map, scroll-reveal feature sections, and trip showcase
- **White-label Branding** -- Organization system with custom logos, colors, and agency theming
- **Transport Types** -- Transfer events support sub-types (Car, Train, Bus, Ferry, Cruise) with matching icons and labels
- **Overnight Toggle** -- Hotel events can be marked as overnight stays, hiding check-in/check-out time fields
- **Document Attachments** -- Upload file attachments to info pages with drag-and-drop, editable names, and trip-level document management. Viewable on mobile info screens
- **Drag-to-Reorder** -- Reorder trip info pages and event documents via drag handles in the workspace editor
- **Event Status Indicators** -- Per-state glyphs on events (confirmed, pending, cancelled) synced across web and mobile preview
- **Clickable URLs** -- URLs typed in info page body text auto-render as clickable hyperlinks
- **PDF Export** -- Polished PDF itineraries with cover images and static map headers
- **Unified Theming** -- Single brand accent color across all event types, light and dark modes. Runtime-swappable accent (including a mono black/white option) with a computed readable-on-accent foreground so text stays legible on any accent
- **iOS Home Screen Widget** -- Photo-led trip widget (small, medium, large, plus lock-screen sizes): the trip photo with a big countdown before the trip, today's next stop during it, and the first day's plan or "Later today" on the large size. Native SwiftUI in `mobile/native-widgets/`
- **iOS Live Activities & Dynamic Island** -- Flight activity in the airline's colour with a live boarding, departure and landing countdown, a plane on a progress track and the gate; event activity with category colour, icon tile and a big countdown. Native SwiftUI in `mobile/native-widgets/TripCountdown.swift`, so layout changes need a store build
- **Interactive Destination Map** -- Native MapView on the Today tab showing trip destinations with animated markers and region labels
- **Notification Center** -- Grouped by date with type-based icons, unread state, Mail-style full-height swipe actions (read, delete) and context menus
- **Push Notifications** -- Itinerary updates, flight changes ("QR 843 is delayed") and local reminders for trips, flights, hotels and events. Titles say what happened, the trip is the subtitle, details are one per line. Reminders carry the trip photo; flights, events and trips have View flight / Directions / Open itinerary buttons; flight alerts are time-sensitive
- **PWA Support** -- Installable as a progressive web app with offline caching
- **Password Reset** -- Forgot password flow with email reset link from the login page
- **Support Pages** -- Help & support, privacy policy, and terms of service pages linked from the mobile app profile
- **Dashboard** -- At a Glance stats with animated counters, interactive travel calendar with trip day highlights and multi-trip tooltips, Next Up departures, Needs Attention alerts (including travelers with outstanding compliance docs before departure), live next-trip countdown, trip templates, upcoming trip carousel, and quick actions. Optional compact mode tightens the whole layout
- **Destinations Explorer** -- Mapbox globe wired to the destination card grid: clicking a pin flies in and highlights the matching card, hovering a card lights up its pin, with a destination stepper and re-center control
- **Reports** -- Operations overview (travel days, pipeline, trips by month, top airlines) and a Documents tab tracking signed/pending/expired compliance per traveler and per document type, each with tab-aware CSV export
- **Demo Mode** -- Full-featured demo with floating indicator badge, localStorage-only data

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS
- **UI Components:** Radix UI, Shadcn-style, Motion (Framer Motion v12), react-day-picker
- **Backend:** Firebase Auth (Google OAuth + email/password), Firestore, Firebase Storage
- **AI:** Anthropic Claude Haiku 4.5 (itinerary parsing)
- **APIs:** RapidAPI (AeroDataBox flights), Google Places API, SerpAPI (image search), Unsplash, Pexels
- **Maps:** Mapbox GL JS via react-map-gl
- **Charts:** Recharts
- **Routing:** react-router-dom v7 (HashRouter)
- **PDF:** html2canvas + jsPDF
- **Mobile:** Expo / React Native (in `/mobile`), expo-widgets (Live Activities + Dynamic Island), @gorhom/bottom-sheet
- **Cloud Functions:** Firebase Cloud Functions (Gen 2) for server-side push notifications on publish

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

The mobile app is traveler-facing -- no admin features, PIN-based trip joining, and branding inherited from the trip's organization.

### Join Trip Flow

The Join sheet has PIN and Scan tabs. PIN cells spring in as you type, ripple while the code is looked up, then light up teal as the trip card rises (cover photo, place, dates, organiser). Pasting an invite link into the PIN field resolves it too. The scanner shows its viewfinder before camera access is granted and offers Open Settings if access was denied.

### Shared Trip Preview

The preview screen shows the trip itinerary with image-forward day cards -- each day is a 140px hero banner using the first event photo (or gradient fallback with type icon watermark), with the weekday, date, event count, first event time, and type icons overlaid at the bottom. Past days are dimmed with an overlay, today gets a solid teal "TODAY" badge. Tapping expands inline event cards. The itinerary header shows a progress bar with day count and completion stats. Multi-city trips show location chips when the city changes between days. Info pages with document attachments are viewable on mobile. A "Personalise your view" picker lets travelers select their name to filter the itinerary to their assigned events.

### Home Tab

Photo hero for the current or next trip with Itinerary, Info and Share actions, then the next event ("Flight, Sat 7 Nov") and the rest of that day. A day strip lists every trip day with its first event's icon and opens the itinerary on that day. Other trips appear as photo cards with a countdown chip; long-press opens Share Trip / Copy Link.

### Itinerary

Pinned day strip (a tapped or linked day stays highlighted; scrolling ticks with a light haptic between days), a Next up card, Trip info and organiser tiles (Call, Message, Email), then the timeline. Rows trim repeated place names, transfers say where from, hotels show the area, and "times TBC" appears once per day.

### Today Tab

Three-state daily schedule view:

- **Active trip** -- Full-screen Mapbox Standard 3D map (pitched city view centered on next event location with proximity-biased geocoding) behind an Apple Maps-style bottom sheet. Sheet contains trip name with stats strip (flights, hotels, events, days), weather data, "Next Up" countdown card, trip info and organizer cards, timeline with NOW divider and past-event dimming, "See full itinerary" button
- **Upcoming trip** -- "Your next trip" headline, hero card with countdown badge and weather forecast, first-day event preview with cleaned titles, trip info and organizer shortcuts, stats footer
- **Empty** -- Compass icon in teal circle, "No trips yet" with "Join a trip" CTA button

### Media Uploads

Travelers can upload photos and videos from the mobile gallery with multi-select support. Uploads sync to Firebase Storage and appear in the web Media Library organized by trip. HEIC images are automatically converted to JPEG before upload for cross-browser compatibility. File size limit: 500 MB.

### App Users

The web Travelers page shows all mobile users who have joined trips via PIN. Admins can:

- **Sort and filter** by name, device count, or trip
- **Search** with highlighted matches
- **Detail panel** with profile, trip memberships, activity timeline, and push notifications
- **Rename** users, **remove** from individual trips, and bulk-select for batch operations
- **Export** the user list as CSV
- **Paginate** (10 per page) with keyboard nav

Name and avatar changes on mobile sync to Firebase `trip_members` in real time.

### Profile

The profile tab shows the traveler's avatar, name, and trip status. Features include:

- **Gradient avatar** -- deterministic two-tone gradient derived from the user's name, with centered initials
- **Trip status pill** -- shows next upcoming trip or "No trips yet"
- **Toggle subtitles** -- each setting row shows a subtitle with the current value (e.g. "Dark", "Enabled")
- **In-app browser** -- external links (Help, Privacy, Terms) open in an in-app Safari sheet via `expo-web-browser`
- **Tappable version** -- tap the version number to copy it to clipboard with a toast confirmation

### Sign-in and Onboarding

The first screen is a full-bleed photo ("Welcome aboard") with Continue with Apple, Google and email on it, plus Continue without an account. Email sign-in uses a magic link with a 30-second resend countdown. Onboarding asks for the organiser's code or a trip PIN (a matching trip shows the same trip card as Join), then a name and photo if sign-in didn't provide them. `?preview=1` demos onboarding without resetting user data.

### Live Activities & Dynamic Island

The app sends each activity its timing (boarding is departure minus 40 minutes), progress and colour; the native SwiftUI in `mobile/native-widgets/` draws it. The `withNativeWidgets` config plugin copies those files into `ios/` on prebuild.

- **Lock Screen**: flight number in the airline colour, status in plain words, route with progress track, live countdown and gate
- **Dynamic Island**: compact shows the plane and departure code with a countdown (the gate once boarding); expanded shows both airports, flight, status, track, countdown and gate

## API Endpoints

Serverless functions in `api/` — all endpoints validate input and return generic errors (no internal details leaked).

| Endpoint | Auth | Description |
|---|---|---|
| `/api/flights` | — | Airport departures search by route and date |
| `/api/flight-number` | — | Flight lookup by number and date |
| `/api/places` | — | Unified search for hotels, activities, and dining via Google Places API (New) |
| `/api/geocode` | — | Forward geocoding via Mapbox (location name to coordinates) |
| `/api/images` | — | Image search with source selection (SerpAPI, Unsplash, Pexels) |
| `/api/image-proxy` | — | SSRF-protected image proxy (HTTPS only, private IPs blocked, 5MB limit) |
| `/api/parse-itinerary` | — | AI-powered itinerary parsing via Claude Sonnet 5.5 (event copy assist on Claude Haiku 5.5) - extracts events, travelers, info sections |
| `/api/notify-trip-update` | Bearer | Notify trip members of itinerary changes via Expo push |
| `/api/send-invite` | Bearer | Send team invitation emails via Resend |
| `/api/send-push` | Bearer | Send a push notification to one device; caller must organize a trip that device has joined |
| `/api/share-page` | — | Serves `/shared/{id}` with the trip's Open Graph tags (title, dates, cover photo) and forwards to the trip page |
| `/api/check-flight-status` | Bearer | Cron (every 15 min): checks flights around departure (3-hourly from 24h out, every run from 3h before to 1h after, hourly in the air), saves airport codes/coordinates, and pushes delays, cancellations, gate and time changes to travelers |

## Security

- **API input validation** — dates, IATA codes, search queries, and flight numbers validated on all endpoints
- **SSRF protection** — image proxy blocks private/internal IPs, enforces HTTPS, verifies image content-type, 5s timeout, 5MB limit
- **CORS** — restricted to production domain and localhost dev
- **CSP** — Content-Security-Policy header on all responses
- **Push auth** - `/api/send-push` and `/api/notify-trip-update` require a Firebase ID token from the trip's owner or organization
- **Firestore rules** — scoped reads/writes per user, org admin checks, trip member verification, cron user allowlist
- **Storage rules** — org admin required for logo uploads, image types only (no SVG)
- **Email verification** — new email/password signups receive verification emails, banner shown until verified
- **Password reset** — secure reset via Firebase sendPasswordResetEmail with rate-limit handling
- **Trip PINs** -- 6-character alphanumeric codes (no ambiguous chars like 0/O/1/I), focus-aware input with paste support, shake animation on error, iOS oneTimeCode auto-fill
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

# RapidAPI (AeroDataBox flights)
RAPIDAPI_KEY=

# Google Places API (hotels, activities, dining)
GOOGLE_API_KEY=

# SerpAPI (image search)
SERPAPI_KEY=

# Mapbox server-side (geocoding API)
MAPBOX_TOKEN=

# Image search (optional fallbacks)
UNSPLASH_ACCESS_KEY=
PEXELS_API_KEY=

# AI itinerary parsing (Claude Haiku 4.5)
ANTHROPIC_API_KEY=

# Team invitations (Resend email)
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Flight status cron
CRON_EMAIL=
CRON_PASSWORD=
CRON_SECRET=
```

Without Firebase credentials, the app runs in demo mode with localStorage-only data.

## Deployment

Hosted on [Vercel](https://dalefy.vercel.app). Push to `main` to trigger a production deployment. Run `npm run build` first: the mobile preview compiles the mobile source with React Native Web, so a native-only import (such as `ActionSheetIOS` by name) fails the whole deploy.

### Mobile releases

- **JavaScript changes** ship over the air: `cd mobile && npx eas-cli update --branch production --environment production`
- **Native changes** (Live Activities, widgets, splash, entitlements) need a store build: `npx eas-cli build --profile production --platform ios --auto-submit`
- **Universal links** are served from `public/.well-known/` (`apple-app-site-association`, `assetlinks.json`); the app claims `dalefy.vercel.app` and `dalefy.app` for `/shared/*`

The flight status cron runs daily via Vercel Cron Jobs (Hobby plan limit). On-demand flight checks run when users view trips with upcoming flights. AI itinerary parsing requires an `ANTHROPIC_API_KEY` -- without it, the import falls back to the offline heuristic parser.

### Cloud Functions

Firebase Cloud Functions (Gen 2) in `functions/` handle server-side push notifications. Deployed separately from the web app.

```bash
# Deploy functions
cd functions && npm install && firebase deploy --only functions

# View logs
firebase functions:log --only onTripUpdated
```

```bash
# Manual web deploy
vercel --prod
```

## License

Private.
