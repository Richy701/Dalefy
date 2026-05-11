# Dalefy

Trip planning without the mess. A modern travel management platform for organizers and travelers.

## Features

- **Trip Management** -- Create, edit, and organize trips with itineraries, travelers, budgets, and documents
- **AI-Powered Itinerary Import** -- Upload travel documents (PDF, Word, PowerPoint, text) and parse them with Claude Haiku 4.5 into structured events with polished descriptions, internal agent notes, traveler extraction, and info sections. Falls back to offline heuristic parser when AI is unavailable
- **Live Search** -- Search flights (AeroDataBox), hotels (Booking.com), restaurants (Local Business Data), and activities (Local Business Data) directly in the workspace
- **Flight Status Notifications** -- Automated cron checks flight status every 30 minutes and pushes updates (delays, gate changes, cancellations) to travelers
- **Image Search** -- Multi-source image search (Google, Unsplash, Pexels) with provider picker
- **Invite-only Team System** -- Admin sends invites, team members join via link. Google OAuth and email/password sign-in supported
- **Email Verification** -- New email/password signups receive verification emails with resend and status check in-app
- **Role-based Access** -- Owner, admin, agent, and viewer roles with UI gating (sidebar, settings sections, team management)
- **Leader-only Info Pages** -- Toggle info pages as "leader only" so sensitive data (pricing, PNR, supplier details) is hidden from travelers on mobile
- **Draft/Publish System** -- Edits stay as drafts until explicitly published. Mobile travelers only see the last published version, not work-in-progress changes. Amber indicator shows when unpublished changes exist
- **Mobile Preview** -- Live phone-frame preview in the workspace showing how the trip looks on mobile. Supports independent dark/light theme toggle and updates in real-time as you edit
- **Real-time Sync** -- Firebase-backed data with per-user scoping and live updates
- **Media Library** -- Upload photos and videos from mobile or web, organized by trip with gallery view, swipe viewer, and per-trip filtering. HEIC auto-converted to JPEG for web compatibility. 500 MB per file limit
- **Mobile Companion** -- Expo React Native app for travelers to join trips via PIN code or QR scan, with choreographed success animation and trip preview
- **Interactive Maps** -- Mapbox-powered trip maps with animated routes and destination explorer
- **White-label Branding** -- Organization system with custom logos, colors, and agency theming
- **Transport Types** -- Transfer events support sub-types (Car, Train, Bus, Ferry, Cruise) with matching icons and labels
- **Overnight Toggle** -- Hotel events can be marked as overnight stays, hiding check-in/check-out time fields
- **Drag-to-Reorder** -- Reorder trip info pages and event documents via drag handles in the workspace editor
- **Clickable URLs** -- URLs typed in info page body text auto-render as clickable hyperlinks
- **PDF Export** -- Polished PDF itineraries with cover images and static map headers
- **Unified Theming** -- Single brand accent color across all event types, light and dark modes
- **iOS Home Screen Widget** -- Trip countdown widget with radial progress ring, destination name, start date, and upcoming events. Dynamically scales the countdown ring based on days remaining, auto-transitions between upcoming/active/empty states via WidgetKit timeline entries (up to 30 days)
- **iOS Live Activities & Dynamic Island** -- Real-time flight tracking on the Lock Screen and Dynamic Island with airport codes, times, status, and gate info. Automatically starts for today's flights and updates live via the flight status cron
- **Interactive Destination Map** -- Native MapView on the Today tab showing trip destinations with animated markers and region labels
- **Notification Center** -- Grouped by date (Today, Yesterday, Earlier) with type-based icons, unread indicators, swipe-to-archive, and empty state. Tappable rows with context menus
- **Push Notifications** -- Real-time push notifications via Firebase Cloud Function when itineraries are published, plus flight status alerts from the cron job. Local scheduled reminders for upcoming trips, flights, hotels, and events
- **PWA Support** -- Installable as a progressive web app with offline caching
- **Password Reset** -- Forgot password flow with email reset link from the login page
- **Support Pages** -- Help & support, privacy policy, and terms of service pages linked from the mobile app profile
- **Demo Mode** -- Full-featured demo with floating indicator badge, localStorage-only data

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS
- **UI Components:** Radix UI, Shadcn-style, Motion (Framer Motion v12)
- **Backend:** Firebase Auth (Google OAuth + email/password), Firestore, Firebase Storage
- **AI:** Anthropic Claude Haiku 4.5 (itinerary parsing)
- **APIs:** RapidAPI (AeroDataBox, Booking.com, Local Business Data), Unsplash, Pexels
- **Maps:** Mapbox GL JS via react-map-gl
- **Charts:** Recharts
- **Routing:** react-router-dom v7 (HashRouter)
- **PDF:** html2canvas + jsPDF
- **Mobile:** Expo / React Native (in `/mobile`), expo-widgets (Live Activities + Dynamic Island)
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

Travelers join trips via three methods: 6-digit PIN, QR scan, or invite link paste. The PIN entry has focus-aware cells with teal glow, a paste button for clipboard, shake animation on invalid codes, and iOS `oneTimeCode` auto-fill. On success, a choreographed reveal plays -- blur-up hero image, centered checkmark with spring bounce, personalised welcome copy ("Welcome to {destination}"), staggered metadata pills, and a manual "See itinerary" CTA.

### Shared Trip Preview

The preview screen shows the trip itinerary with day-by-day summaries. Each day card displays the formatted date, "Day N" label, mint-coloured event type pills with counts, and a cleaned title preview (redundant type prefixes stripped). Tapping expands inline events. A "Personalise your view" picker lets travelers select their name to filter the itinerary to their assigned events.

### Media Uploads

Travelers can upload photos and videos from the mobile gallery. Uploads sync to Firebase Storage and appear in the web Media Library organized by trip. HEIC images are automatically converted to JPEG before upload for cross-browser compatibility. File size limit: 500 MB.

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

### Onboarding

Three-step welcome flow for new travelers (agency lookup, photo, name):

- **Progress indicator** -- three segmented bars with "1/3" counter, filling as steps complete
- **Top-left navigation** -- chevron to go back between steps, X button to close when editing
- **Agency input** -- placeholder text, inline loading spinner during lookup, border color states (default, focused, error, success), helper text
- **Avatar placeholder** -- elevated background with camera icon and "Add photo" label, no border
- **Name input** -- iOS `textContentType="name"` for autofill support
- **Preview mode** -- `?preview=1` query param to demo the full onboarding without resetting user data

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
| `/api/places` | — | Unified search for hotels, activities, and dining via Google Places API |
| `/api/geocode` | — | Forward geocoding via Mapbox (location name to coordinates) |
| `/api/images` | — | Image search with source selection (Google, Unsplash, Pexels) |
| `/api/image-proxy` | — | SSRF-protected image proxy (HTTPS only, private IPs blocked, 5MB limit) |
| `/api/parse-itinerary` | — | AI-powered itinerary parsing via Claude Haiku 4.5 — extracts events, travelers, info sections |
| `/api/push` | Bearer | Push notifications — requires CRON_SECRET or Firebase auth token |
| `/api/notify-trip-update` | Bearer | Notify trip members of itinerary changes via Expo push |
| `/api/send-invite` | Bearer | Send team invitation emails via Resend |
| `/api/check-flight-status` | Bearer | Cron (every 30 min): checks flight status, saves airport codes, and pushes updates to travelers |

## Security

- **API input validation** — dates, IATA codes, search queries, and flight numbers validated on all endpoints
- **SSRF protection** — image proxy blocks private/internal IPs, enforces HTTPS, verifies image content-type, 5s timeout, 5MB limit
- **CORS** — restricted to production domain and localhost dev
- **CSP** — Content-Security-Policy header on all responses
- **Push auth** — `/api/push` requires bearer token (cron secret or Firebase ID token)
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
GOOGLE_PLACES_API_KEY=

# Mapbox server-side (geocoding API)
MAPBOX_TOKEN=

# Image search (optional fallbacks)
UNSPLASH_ACCESS_KEY=
PEXELS_API_KEY=

# AI itinerary parsing (Claude Haiku 4.5)
ANTHROPIC_API_KEY=

# Team invitations (Resend email)
RESEND_API_KEY=

# Flight status cron
CRON_EMAIL=
CRON_PASSWORD=
CRON_SECRET=
```

Without Firebase credentials, the app runs in demo mode with localStorage-only data.

## Deployment

Hosted on [Vercel](https://dalefy.vercel.app). Push to `main` to trigger a production deployment.

The flight status cron runs every 30 minutes via Vercel Cron Jobs. AI itinerary parsing requires an `ANTHROPIC_API_KEY` — without it, the import falls back to the offline heuristic parser.

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
