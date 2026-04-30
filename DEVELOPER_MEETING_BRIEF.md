# Dalefy - Developer Meeting Brief

**Prepared for:** Developer meeting (Week of 5 May 2026)
**Project:** DAF Adventures / Dalefy - Travel Management Platform
**Prepared by:** Richy

---

## 1. Project Overview

Dalefy is a travel management platform for organising group trips, FAM trips, and corporate travel. It consists of two apps sharing a Firebase backend:

- **Web app** (admin/agent-facing) - React 19 + TypeScript + Vite, deployed on Vercel
- **Mobile app** (traveler-facing) - Expo / React Native, distributed via TestFlight/EAS

Agents use the web app to build itineraries, manage travelers, and publish trips. Travelers use the mobile app to view their itinerary, get live flight updates, and receive push notifications.

---

## 2. How the System Works

### 2.1 Authentication

| Platform | Method | Details |
|----------|--------|---------|
| Web | Email/password + Google OAuth | Firebase Auth, creates a `profiles/{uid}` doc |
| Mobile | Anonymous sign-in + optional account | No login required - travelers join trips via a 6-character PIN code |

- The mobile app generates a persistent device UUID stored in SecureStore/AsyncStorage
- When a traveler joins a trip via PIN, a membership doc is created in `trip_members` linking their device to the trip
- There is no traditional user authentication on mobile - access is device-based and PIN-based

### 2.2 Data Storage (Firebase)

All persistent data lives in **Cloud Firestore** (project: `dalefy-d87c9`). Key collections:

| Collection | Purpose | Sensitivity |
|------------|---------|-------------|
| `profiles` | User accounts (name, email, role, avatar) | Medium - contains PII |
| `trips` | Full trip itineraries with all events embedded | High - contains confirmation numbers, supplier info, budgets, notes |
| `trip_members` | Device/user membership per trip | Low |
| `organizations` | Agency/company metadata | Low |
| `org_members` | Org role assignments (owner/admin/agent) | Low |
| `org_branding` | Custom branding per org (logo, accent colour, company name) | Low |
| `push_tokens` | Expo push notification tokens per device | Medium |

**Firebase Storage** is used for:
- User avatars (`/avatars/{uid}/`)
- Organisation logos (`/logos/{orgId}/`)
- Trip cover images and media (`/trips/{tripId}/`)
- Max file sizes: 2MB for avatars/logos, 25MB for trip media

### 2.3 Real-time Data Sync

Both apps use Firestore `onSnapshot` listeners for real-time updates:
- Web subscribes to all trips owned by the authenticated user
- Mobile subscribes to each trip the device has joined (batched, max 30 per query)
- Both apps cache trips locally (localStorage on web, AsyncStorage on mobile) for offline fallback

### 2.4 Trip Sharing Flow

1. Agent creates a trip on the web app
2. Agent publishes the trip, which generates a 6-character short code
3. Traveler opens the mobile app and enters the PIN
4. Mobile queries Firestore for a published trip matching that code
5. A `trip_members` doc is created, linking the device to the trip
6. The traveler now receives real-time updates and push notifications for that trip

### 2.5 API Endpoints (Vercel Serverless Functions)

| Endpoint | Purpose | External Service |
|----------|---------|-----------------|
| `/api/flights` | Search flights by route/date | AeroDataBox (RapidAPI) |
| `/api/flight-number` | Look up a specific flight | AeroDataBox (RapidAPI) |
| `/api/check-flight-status` | Cron job - update live flight statuses every 30 min | AeroDataBox (RapidAPI) |
| `/api/hotels` | Search hotels by destination | Booking.com API |
| `/api/activities` | Search activities | Google Search |
| `/api/dining` | Search restaurants | Google Search |
| `/api/images` | Search cover images | Google -> Unsplash -> Pexels (fallback chain) |
| `/api/geocode` | Geocode addresses for map pins | Mapbox |
| `/api/parse-itinerary` | AI-powered itinerary text parser | Claude Haiku (Anthropic) |
| `/api/push` | Send push notifications | Expo Push Service |
| `/api/image-proxy` | Fetch external images (avoids CORS) | Direct fetch |

The cron job (`check-flight-status`) authenticates as a service account (`cron@dalefy.com`) and scans all trips with upcoming flights to update their real-time status.

### 2.6 Push Notifications

- Mobile registers an Expo push token on launch and stores it in `push_tokens` collection
- When a trip is edited on the web, `/api/notify-trip-update` fetches all members' push tokens and sends batch notifications via Expo's push service
- The cron job also sends notifications when flight statuses change

### 2.7 Organisation and Branding

- Agents can create organisations with a unique agency code
- Organisations support custom branding: company name, logo, and accent colour
- When a traveler joins a trip, the mobile app loads the organisation's branding from `org_branding`
- Branding is publicly readable (no auth required) so shared trip links can display correctly

---

## 3. Current Security Model

### 3.1 What is Already in Place

- **Firestore Security Rules** (`firestore.rules`) are comprehensive:
  - Profiles: read/write only by the owning UID
  - Trips: published trips readable by anyone (for PIN sharing), unpublished restricted to owner/org members/trip members
  - Organisations: read by authenticated users, write restricted to org admins/owners
  - Trip members: create requires auth + valid trip_id + device_id or UID match
  - Push tokens: scoped to owning user, cron can read all for notifications
  - Storage: UID-scoped writes with file type and size validation (2MB avatars/logos, 25MB trip media), public reads
- **Server-side API keys** - Mapbox, Google, RapidAPI, Anthropic keys are only in Vercel env vars, never shipped to clients
- **Firebase Auth token verification** on push notification (`/api/push`) and cron (`/api/check-flight-status`) endpoints via JWT verification against Google's public JWKS
- **Sensitive field filtering on mobile** - Budget, PNR, supplier pricing, booking refs, invoices, commissions, and other sensitive info fields are regex-filtered from non-leader views (only trip leaders/agents see them)
- **HEIC to JPEG conversion** on mobile before upload (compatibility)
- **Supabase migration partially started** - `mobile/services/supabaseTrips.ts` has working fetch, upsert, delete, and PIN join operations already implemented

### 3.2 Remaining Concerns

| Concern | Detail |
|---------|--------|
| **Sensitive data plaintext in Firestore** | Confirmation numbers, PNR codes, budgets, and supplier pricing are stored as plain text. The mobile app filters these from non-leader views client-side, but the data is still readable by anyone with direct database access |
| **No rate limiting on open API routes** | 7 of 12 API endpoints are unprotected: flights, flight-number, hotels, dining, activities, geocode, and parse-itinerary. Anyone could spam these and run up third-party API costs |
| **Cron service account** | Uses email/password auth (`cron@dalefy.com`) with credentials in env vars instead of a proper Firebase Admin SDK service account |
| **No data deletion cascade** | Deleting an org or trip doesn't clean up related `trip_members`, `push_tokens`, or storage files |
| **No audit logging** | No record of who accessed what data or when |
| **Large embedded documents** | All events are embedded in the trip document - a trip with many events could approach Firestore's 1MB document limit |

---

## 4. Questions for the Development Team

### Data Storage and Security

1. **Database choice** - We currently use Firebase (Firestore) for all data. It works, but has limitations: no relational queries, 1MB document size limits, pricing scales per read/write, and vendor lock-in. A Supabase migration has already been partially started on the mobile side. Does the company have a preferred database solution, or can the team help us scope and complete a migration to something relational (Postgres/Supabase)?

2. **Data modelling** - All events, media refs, and metadata are embedded in a single trip document. This could hit Firestore's 1MB limit as trips grow. If we migrate to a relational DB, should we normalise into separate tables (trips, events, media, travelers, memberships) with proper foreign keys?

3. **Encryption of sensitive fields** - Confirmation numbers, PNR codes, supplier pricing, and budget data are stored as plaintext. We already filter these client-side for non-leader users on mobile, but the raw data is still accessible at the database level. Does the company have an encryption standard or service we should use for sensitive fields?

4. **Orphaned data** - When a trip or org is deleted, related membership docs, push tokens, and storage files are not cleaned up. Can the team help implement cascading deletes?

5. **GDPR / data retention** - Traveler data (device IDs, names, push tokens) persists indefinitely. Does the company have a data retention policy we should follow? Do we need right-to-delete workflows?

6. **Audit trail** - There is currently no logging of who accessed, edited, or shared a trip. Does the company require this for compliance? If so, what's the preferred approach?

7. **Anonymous mobile access** - Travelers join trips via a 6-digit PIN without creating an account (anonymous Firebase Auth + device UUID). Firestore rules still gate access, but there's no real identity verification. Is this acceptable, or does the company require proper user accounts on mobile?

8. **File storage** - Trip media (images, videos up to 25MB) is stored in Firebase Storage. Does the company have a preferred file/media storage solution, or should we stick with this?

### Using Company APIs Instead of Third-Party Services

We currently rely on several third-party APIs. If the company has its own services for any of these, we'd like to switch to reduce costs and dependency on external providers.

9. **Flight data** - We use AeroDataBox via RapidAPI for flight search, flight number lookup, and live flight status tracking (cron every 30 min). Does the company have its own flight data API or a preferred provider with better pricing/reliability?

10. **Hotel search** - We use Booking.com's API for hotel lookups. Does the company have access to a GDS (Amadeus, Sabre, Travelport) or its own hotel inventory API we could connect to?

11. **Activity and dining search** - We use Google Search APIs for activities and restaurant data. Does the company have a preferred source for destination content, or partnerships with any content providers (Viator, GetYourGuide, TripAdvisor)?

12. **Image sourcing** - We chain Google Image Search, Unsplash, and Pexels for trip and event cover images. Does the company have a media library or licensed image source we should use instead?

13. **Geocoding and maps** - We use Mapbox for maps and address geocoding on both web and mobile. Is this the preferred provider, or does the company have a mapping solution already in place?

14. **Push notifications** - We use Expo's push notification service. Does the company have an existing notification infrastructure (e.g. OneSignal, FCM directly) that we should integrate with?

15. **AI itinerary parsing** - We use Claude (Anthropic) to parse free-text itineraries into structured event data. Is the company OK with this, or is there a preferred AI provider or an in-house solution?

### Data and Scaling

16. **Multi-tenancy** - The org system currently adds branding (logo, accent colour, company name) per agency. As more agencies onboard, do we need proper tenant isolation - separate data per org, scoped queries, org-level usage tracking?

17. **Real-time requirements** - How critical is real-time sync for the business? Currently both apps use Firestore real-time listeners. If we migrate to Postgres, we could use Supabase Realtime or poll every 30-60 seconds - which is acceptable?

18. **Cron service account** - The flight status cron job authenticates as `cron@dalefy.com` using email/password. Can the team help us switch to a proper service account with key rotation?

19. **Rate limiting** - 7 of 12 API endpoints have no auth or rate limiting. These proxy paid third-party APIs, so they're a cost risk if abused. Can the team help us add rate limiting?

---

## 5. Priority Recommendations

In order of urgency:

1. **Switch to company APIs** where available - reduce third-party costs and dependency (flights, hotels, activities, images)
2. **Add rate limiting** to the 7 unprotected API endpoints to prevent abuse and cost spikes
3. **Encrypt sensitive fields** (confirmation numbers, PNR, budget, supplier data) at the database level
4. **Evaluate completing the Supabase migration** - partial implementation exists on mobile, decide whether to commit fully
5. **Implement cascading deletes** for trips and orgs to prevent orphaned data
6. **Add audit logging** for trip access and modifications
7. **Define data retention policy** for traveler PII and old trip data
8. **Implement proper service account** for cron jobs instead of email/password auth

---

## 6. Quick Reference - Tech Stack

| Layer | Technology |
|-------|-----------|
| Web frontend | React 19, TypeScript, Vite 8, Tailwind CSS 3 |
| Mobile frontend | Expo SDK, React Native, TypeScript |
| Routing (web) | react-router-dom v7 (HashRouter) |
| UI components | Custom (shadcn-style), cmdk, vaul, embla-carousel |
| Maps | Mapbox GL JS (web + mobile) |
| Charts | Recharts |
| Animations | Motion (web), React Native Reanimated (mobile) |
| Database | Cloud Firestore |
| Auth | Firebase Auth |
| File storage | Firebase Storage |
| Hosting | Vercel (web + API) |
| Push notifications | Expo Push Service |
| AI | Claude Haiku (itinerary parsing) |
| Flight data | AeroDataBox (RapidAPI) |
| Image search | Google, Unsplash, Pexels |
