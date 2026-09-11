# Dalefy independent audit

Reviewed 11 September 2026. Scope: React web app, Expo mobile companion, Vercel API handlers, Firebase rules, Cloud Functions, persistence, publishing, notifications, dependency health, and interface implementation.

Follow-up: the first three security blockers have a tested local implementation. See [security fixes and required rollout](SECURITY_FIXES.md). The findings below remain the original audit baseline, not a statement that the follow-up has been deployed.

**Verdict: substantial product work, but not ready for sensitive customer data under the checked-in permissions. Fix access control and data integrity before adding features or doing visual polish.**

23 prioritized findings: **3 P0 blockers, 14 P1 major issues, 6 P2 issues, 0 P3 cosmetic issues.** P0 is used here for security release blockers; P1 includes data loss and significant accessibility failures. Dependency advisory counts are separate from these 23 findings.

This is an independent code audit with local compilation, dependency scans, and two synthetic data probes. It is not a certification or a completed penetration test. The deployed Firebase rules were not retrieved, no live customer data was queried or changed, and no notifications were sent. Security conclusions describe the rules in this checkout; confirm what is deployed urgently.

## Design verdict and score

**Provisional pass for a deliberate design identity.** Barlow typography, restrained teal, dense itinerary editing, and travel-specific layouts match the supplied `.impeccable.md` brief. Teal-on-dark is an explicit brand choice, so it is not itself a defect. Some hard-coded surfaces and repeated decorative containers dilute consistency. There is no browser surface available in this session; a definitive visual verdict, viewport measurements, and screen-reader testing remain outstanding.

| Dimension | Code-based score / 4 | Main evidence |
|---|---:|---|
| Accessibility | 1 | Mouse-only itinerary disclosures; measured light-theme accent contrast fails |
| Performance | 1 | 3.06 MB main JavaScript chunk; eager page imports |
| Responsive design | 2 | Real breakpoints and mobile panels exist; several small touch controls |
| Theming | 2 | Semantic tokens exist, but hard-coded colors and fixed event colors persist |
| Design anti-patterns | 3 | Distinct brand and domain-specific layout; visual confirmation pending |
| **Total** | **9 / 20** | **Poor technical UI health under the audit rubric; provisional, not a visual usability measurement** |

The score covers the interface implementation only. It must not obscure the more serious security findings below.

## Verification completed

| Check | Result |
|---|---|
| Web `npm run build` | Pass: TypeScript and Vite production bundle |
| Mobile native-package TypeScript `tsc --noEmit` | Pass using `mobile/node_modules/.bin/tsc` |
| Root `npm run lint` | Fail: 363 errors, 28 warnings; includes web, API and mobile source |
| Functions build | Blocked by missing local `firebase-admin` / `firebase-functions` dependencies; cannot classify resulting import/type errors as application defects |
| Web production dependency audit | 22 affected packages: 1 critical, 11 high, 9 moderate, 1 low |
| Mobile production dependency audit | 28 affected packages: 2 critical, 8 high, 17 moderate, 1 low |
| Secret scan | No private credential pattern matches in scanned tracked text files; real environment files are ignored. Limited pattern scan, not full Git-history verification |
| Task persistence probe | Confirmed: one input task becomes no stored/reloaded tasks through actual web mapping functions |
| Mobile stale-write probe | Confirmed data transformation: a displayed published event replaces a newer draft event when serialized as a full trip |
| Browser / physical device | Not available; no claim of tested login, upload, push delivery, keyboard navigation, or rendered responsiveness |
| Firebase rules emulator | Not run; permission findings established by tracing rule conditions and documented Firebase semantics |

Evidence files: [web build](web-build.log), [lint summary](lint-summary.txt), [web dependency scan](web-dependencies.json), [mobile dependency scan](mobile-dependencies.json).

## P0 — release blockers

### 1. A traveler can take ownership of a published trip — Critical

**Location:** [firestore.rules:195](/Users/richy/Dalefy/firestore.rules:195), [membership creation:215](/Users/richy/Dalefy/firestore.rules:215).

Membership creation only requires authentication, identifying fields, and a published trip. It does not require proof of the PIN. Anyone able to authenticate can create a membership at their UID/trip key. Membership then permits unrestricted updates of the entire published trip document, including `user_id`, `organization_id`, `events`, and `status`. After changing `user_id` to their own UID, the attacker satisfies the owner delete rule too. Anonymous Firebase sign-in is implemented in the mobile client, making “authenticated” a very low barrier if enabled in production.

**Fix:** Deny traveler writes to the main trip record. Put traveler media/claims in narrowly scoped records, enforce field allowlists, and make ownership/organization immutable except in a trusted transfer operation. Require validated joining through a server flow. Verify outsiders, anonymous users, travelers, viewers, agents, and admins independently in emulator tests. Suggested command: `/harden`.

```text
Before: trip member + published status → update any field
After:  trip updates → owner or authorized editor + immutable identity fields
        traveler updates → own media/claim record + allowed fields only
```

### 2. Publishing exposes the entire working trip record — Critical

**Location:** [firestore.rules:177](/Users/richy/Dalefy/firestore.rules:177), [firebaseTrips.ts:534](/Users/richy/Dalefy/src/services/firebaseTrips.ts:534).

The `Published` status grants unauthenticated read access to the full document. That document stores working events, budget, travelers with email fields, organizer contact information, information pages marked leader-only, attachment URLs, short code, and the published snapshot. An unauthenticated status-filtered collection query can enumerate published trips: knowledge of a PIN or shared link is not enforced. Actual exposure depends on which fields have been populated.

Filtering `leaderOnly` or selecting a snapshot in the UI cannot secure the other fields. Firestore reads are document-wide; sensitive data must be separated. [Firebase field-access documentation](https://firebase.google.com/docs/firestore/security/rules-fields).

**Fix:** Separate private working records, leader-only content, and sanitized published records. Decide explicitly which published content is public versus authenticated/member-only; use server-side capability/PIN validation for private sharing. Suggested command: `/harden`.

```text
Before: /trips/{id} contains public + private + draft fields; published → public read
After:  /trips/{id} is private; /publishedTrips/{id} contains only approved fields
        leader content lives in separately authorized documents
```

### 3. Any authenticated user can replace or delete another trip’s documents — Critical

**Location:** [storage.rules:49](/Users/richy/Dalefy/storage.rules:49), [storage.rules:57](/Users/richy/Dalefy/storage.rules:57).

Trip-level file writes/deletes require only a signed-in user. Event image writes similarly lack trip ownership or organization checks. A user who knows a path can replace vouchers, covers, or event images and delete trip-level documents. Reads are public regardless of draft status or leader-only designation. Published trip records expose attachment URLs, so path secrecy is not a dependable barrier.

**Fix:** Enforce editor/member permission against the trip, scope permitted uploads to identity, separate private attachments from public media, and explicitly authorize deletion. The comment saying Storage rules cannot consult Firestore is incorrect: supported rules can use `firestore.get()`/`firestore.exists()`. [Firebase Storage conditions](https://firebase.google.com/docs/storage/security/rules-conditions). Suggested command: `/harden`.

```text
Before: allow delete: if request.auth != null
After:  allow delete: if authenticated AND authorized editor of this trip
Before: allow read: if true
After:  allow read: if authorized for this attachment's audience
```

## P1 — major issues

### 4. Trip membership permits impersonation and role escalation — High

**Location:** [firestore.rules:215](/Users/richy/Dalefy/firestore.rules:215), [firestore.rules:224](/Users/richy/Dalefy/firestore.rules:224), [mobile role lookup:169](/Users/richy/Dalefy/mobile/services/firebaseTrips.ts:169).

Create does not constrain document ID, UID/device ownership, or role when a string `device_id` is supplied. Update has no field allowlist. The same-trip membership branch lets one member update/delete other members, including setting `role: "leader"`. The orphan-cleanup fallback lets an administrator of one organization manage unrelated membership records because it only checks their own current organization.

**Fix:** Bind membership IDs and immutable identity fields to the authenticated user; allow self-service only for safe profile fields. Gate role/claim changes and member deletion on an editor of the target trip. Remove the unrelated-org fallback. Suggested command: `/harden`.

```text
Before: membership in resource.trip_id → update/delete any member of that trip
After:  own membership → update name/avatar only
        target-trip editor → set permitted roles or remove members
```

### 5. Authenticated users can enumerate profiles and trip memberships — High

**Location:** [firestore.rules:45](/Users/richy/Dalefy/firestore.rules:45), [firestore.rules:209](/Users/richy/Dalefy/firestore.rules:209), [firebaseTrips.ts:190](/Users/richy/Dalefy/src/services/firebaseTrips.ts:190).

Global authenticated reads expose names, emails where stored, device identifiers, and trip associations across organizations. The web membership fetch actually loads the entire collection, making this more than an unused permission.

**Fix:** Scope both rules and queries to the caller’s organization/trip. Move cross-account email lookup behind an authorized server operation with a minimal response. Suggested command: `/harden`.

```text
Before: allow read: if authenticated; fetch all trip_members
After:  read own record or authorized target roster; query that roster only
```

### 6. Direct push endpoint allows cross-account messaging — High

**Location:** [api/send-push.ts:13](/Users/richy/Dalefy/api/send-push.ts:13), [api/push.ts:1](/Users/richy/Dalefy/api/push.ts:1).

`send-push` verifies a token but never verifies the sender may contact the requested device. It resolves device IDs against all stored push tokens using cron credentials. Finding 5 makes device IDs discoverable. This permits arbitrary push content to unrelated travelers. The generic `push` endpoint also accepts caller-supplied destinations without audience authorization, though the caller must already know those tokens.

**Fix:** Resolve recipients server-side from a trip the caller can administer; restrict generic dispatch to internal callers. Do not trust a caller-supplied device/token list as permission. Suggested command: `/harden`.

```text
Before: valid JWT + deviceId → send caller's message
After:  valid JWT + target-trip editor check → server-derived recipients → send
```

### 7. Image proxy SSRF protection stops before redirects and DNS resolution — High

**Location:** [api/_imageProxyCore.ts:43](/Users/richy/Dalefy/api/_imageProxyCore.ts:43), [fetchImage:81](/Users/richy/Dalefy/api/_imageProxyCore.ts:81).

The proxy rejects literal private hostnames/IPs in the initial URL, but `fetch` follows redirects and there is no DNS-address validation. An attacker-controlled HTTPS host can redirect toward a private address, or resolve to one. The request happens before the image content-type check. Reachable internal services and impact depend on deployment networking; internal access was not attempted.

The five-second timer is also cleared after response headers, before `arrayBuffer()`. The 5 MB check happens only after buffering the complete response. A slow or huge body therefore escapes the intended time/memory limits.

**Fix:** Prefer a bounded provider-host allowlist; validate resolved addresses and each redirect hop; reject unsafe schemes at every hop; enforce a streamed byte limit and timeout through body completion. Suggested command: `/harden`.

```text
Before: validate initial hostname → fetch with automatic redirects → buffer all
After:  validate host/IP → manual validated redirects → bounded timed stream
```

### 8. Paid APIs lack durable user/organization usage enforcement — High

**Location:** [api/parse-itinerary.ts:13](/Users/richy/Dalefy/api/parse-itinerary.ts:13), [api/_rateLimit.ts:11](/Users/richy/Dalefy/api/_rateLimit.ts:11), [api/images.ts:5](/Users/richy/Dalefy/api/images.ts:5), [api/geocode.ts:5](/Users/richy/Dalefy/api/geocode.ts:5).

AI parsing accepts any valid Firebase identity, including anonymous identities if enabled, without editor entitlement. The “per-user” throttle actually keys by IP and bucket. Counters are process-local and reset on instance replacement; parallel instances do not share quotas. Image, flight, places, and geocoding proxies also expose provider-funded work without application authentication. Provider account limits were not inspected.

**Fix:** Require appropriate membership for paid organizer features and persistent per-user/org quotas, with a separate IP throttle. Public traveler features need narrowly scoped access and separate budgets. Suggested command: `/harden`.

```text
Before: any valid Firebase token + in-memory IP counter → AI call
After:  authorized editor + durable account quota + IP throttle → AI call
```

### 9. Published views and notifications leak unpublished edits

**Location:** [SharedTripPage.tsx:16](/Users/richy/Dalefy/src/pages/SharedTripPage.tsx:16), [mobile/context/TripsContext.tsx:156](/Users/richy/Dalefy/mobile/context/TripsContext.tsx:156), [web sync:193](/Users/richy/Dalefy/src/context/TripsContext.tsx:193).

The shared web page reads live `events`, `info`, and documents and ignores `published_snapshot`. Mobile replaces events from the snapshot but prefers live `info` and organizer and leaves live documents in place. The web sync path sends event/date change notifications whenever status is not `Draft`, even without a new publish. An organizer editing an already-published trip can reveal unfinished changes or notify travelers prematurely.

**Fix:** Define one published view contract covering all publishable fields, use it on web and mobile, and emit itinerary notifications only after an acknowledged published-version change. Keep live operational flight status explicitly separate. Suggested command: `/harden`.

### 10. Full-trip writes can overwrite other people’s edits

**Location:** [web upsert:103](/Users/richy/Dalefy/src/services/firebaseTrips.ts:103), [web sync:164](/Users/richy/Dalefy/src/context/TripsContext.tsx:164), [mobile gallery:838](/Users/richy/Dalefy/mobile/app/(tabs)/media/index.tsx:838), [mobile update:213](/Users/richy/Dalefy/mobile/context/TripsContext.tsx:213).

Saving one change serializes the entire trip; `merge: true` still replaces fields and arrays supplied in that payload. Two editors with stale copies can overwrite each other. A particularly concrete path is mobile gallery deletion: it starts from the displayed trip (whose events come from the older published snapshot) and writes that entire trip, replacing newer working events. A synthetic serialization probe confirmed this old-published-event replacement.

**Fix:** Write only changed fields or use dedicated event/media documents. Add revision checks/transactions for conflicting edits and serialize outstanding changes to one record. Never write a presentation projection back as the working source. Suggested command: `/harden`.

### 11. Checklist tasks are lost because the persistence mapper omits them

**Location:** [WorkspacePage.tsx:1987](/Users/richy/Dalefy/src/pages/WorkspacePage.tsx:1987), [firebaseTrips.ts:534](/Users/richy/Dalefy/src/services/firebaseTrips.ts:534).

The checklist updates `trip.tasks`, but neither `tripToDoc` nor `docToTrip` includes tasks. They appear locally and disappear when authoritative cloud data reloads. Executing the actual mapping functions with a synthetic task confirmed the loss.

**Fix:** Include tasks in both mappings, support existing missing fields, and verify create/check/reload from another session. Suggested command: `/harden`.

### 12. Traveler/compliance records are browser-local and cleared at logout

**Location:** [TravelersPage.tsx:112](/Users/richy/Dalefy/src/pages/TravelersPage.tsx:112), [signing handler:609](/Users/richy/Dalefy/src/pages/TravelersPage.tsx:609), [AuthContext.tsx:101](/Users/richy/Dalefy/src/context/AuthContext.tsx:101).

New custom travelers and compliance overrides use localStorage. Marking a document signed updates only that browser; organization colleagues do not receive the change. Logout clears these keys, so compliance state is not durable. “Upload document” here creates a named status entry rather than uploading document evidence.

**Fix:** Persist organization-scoped traveler and compliance records, with actor/time metadata and actual evidence storage where required. Distinguish a manually recorded status from an uploaded or signed document in the UI. This is a reliability finding, not a legal assessment. Suggested commands: `/harden`, `/clarify`.

### 13. Flight cron updates fields that mobile hides behind the snapshot

**Location:** [api/check-flight-status.ts:34](/Users/richy/Dalefy/api/check-flight-status.ts:34), [cron write:89](/Users/richy/Dalefy/api/check-flight-status.ts:89), [mobile/context/TripsContext.tsx:156](/Users/richy/Dalefy/mobile/context/TripsContext.tsx:156).

The cron reads/writes working `events`; mobile displays `publishedSnapshot.events`. Its resulting flight state is therefore not reflected through this trip-data path until another publish, even if an alert was sent. Separate on-demand flight components may fetch fresh information; that does not repair the published trip source. Working flight edits can also diverge from what travelers were actually sent.

**Fix:** Store live flight state independently, keyed to stable published event IDs, and merge it consistently into traveler screens/widgets. Suggested command: `/harden`.

### 14. Dependency scans contain high/critical advisories

**Location:** [web scan](web-dependencies.json), [mobile scan](mobile-dependencies.json), root and mobile lockfiles.

Web: 22 affected packages. Mobile: 28. Counts include transitive dependencies and development-related tooling brought in as production dependencies; they are not counts of exploitable application endpoints. A high-priority candidate is installed `pdfjs-dist` 5.7.284, flagged for malicious PDF execution, because document import is an actual feature. Trace the precise parser path before declaring exploitability. Router SSR/RSC advisories may not apply to this HashRouter SPA; the Anthropic local-memory-tool advisory is not evidence that itinerary parsing itself is vulnerable. DOMPurify advisories also require checking the specific options/path used here.

**Fix:** Triage reachability, apply supported patched versions, rebuild both applications, and test document import and navigation. Avoid blindly forcing dependency upgrades across Expo/native version boundaries. Suggested command: `/harden`.

### 15. Shared itinerary details cannot be opened with a keyboard

**Location:** [SharedTripPage.tsx:43](/Users/richy/Dalefy/src/pages/SharedTripPage.tsx:43).

`EventRow` uses a clickable `div` without keyboard support, button semantics, focusability, or expanded state. Users who cannot use a pointer cannot reveal booking details and notes through that control. WCAG 2.1.1 / 4.1.2 concern; confirmed in markup, not by a screen-reader session.

**Fix:** Use an actual disclosure button with `aria-expanded` and an associated detail panel. Keep links in the expanded content separate from the trigger. Suggested command: `/harden`.

### 16. Teal text fails contrast in light mode

**Location:** [WorkspacePage.tsx:3151](/Users/richy/Dalefy/src/pages/WorkspacePage.tsx:3151), [tailwind.config.js:40](/Users/richy/Dalefy/tailwind.config.js:40), [src/index.css:27](/Users/richy/Dalefy/src/index.css:27).

Default `text-brand` resolves to `#0bd2b5` in both themes. Calculated contrast is **1.93:1 on white** and **1.80:1 on the light page background**, below the 4.5:1 normal-text threshold. The small “Add Page” label uses this foreground on a pale teal background. A darker theme-specific text token is needed even if the bright fill accent is preserved. Dark-card contrast for this teal is 9.21:1.

**Fix:** Separate accent-fill and accent-text tokens; verify custom accent choices on their actual surfaces. Suggested command: `/colorize`.

### 20. Mobile can retain trips after access or membership disappears

**Location:** [mobile/context/TripsContext.tsx:147](/Users/richy/Dalefy/mobile/context/TripsContext.tsx:147), [mobile/services/firebaseTrips.ts:27](/Users/richy/Dalefy/mobile/services/firebaseTrips.ts:27), [subscriptions:56](/Users/richy/Dalefy/mobile/services/firebaseTrips.ts:56).

An authoritative empty remote result falls back to non-empty cache instead of clearing it. The service subscribes to trip documents discovered at setup, not membership changes. A trip made private can also fail a multi-document fetch, leaving the cache in place. Together these can preserve removed/unpublished itineraries and obscure access changes. Offline downloads cannot be retroactively unread, but online revocation should not be treated as an offline error.

**Fix:** Distinguish offline/network failure from permission denial and a successful empty result. Subscribe to the current membership set and evict revoked records on acknowledged changes. Suggested command: `/harden`.

## P2 — reliability and quality gaps

### 17. Release checks do not enforce the available quality gates

**Location:** [vercel.json:3](/Users/richy/Dalefy/vercel.json:3), [package.json:7](/Users/richy/Dalefy/package.json:7), [eslint.config.js:9](/Users/richy/Dalefy/eslint.config.js:9).

Vercel runs `vite build`, bypassing the TypeScript step in `npm run build`. The root lint currently fails with 391 findings; not all represent runtime defects. No first-party automated test suite or CI workflow was found in the reviewed tracked sources. The current web and mobile type checks pass, so this is a missing future guard, not a claim that today's app fails to compile.

**Fix:** Make type checking and an intentional lint baseline required; add meaningful rules tests and persistence/publishing regressions first. Install the Functions package dependencies and complete its isolated build. Suggested command: `/harden`.

### 18. Mobile secure token storage falls back to plaintext — Medium

**Location:** [secureStorageAdapter.ts:54](/Users/richy/Dalefy/mobile/services/secureStorageAdapter.ts:54).

On a SecureStore exception, the adapter stores Firebase auth state in AsyncStorage. This can silently downgrade at-rest protection on devices where secure storage fails, rather than only in an explicitly selected development mode. Exploitation requires access to app storage, so this is lower priority than the remotely reachable rule defects.

**Fix:** Keep production authentication in the keychain/keystore; surface a recoverable storage failure or use a non-persistent session when secure persistence cannot work. Suggested command: `/harden`.

```text
Before: SecureStore throws → AsyncStorage.setItem(authState)
After:  SecureStore throws → explicit recoverable error / ephemeral session
```

### 19. Account deletion can partially erase data and falsely report cleanup — Medium

**Location:** [mobile/services/firebaseAuth.ts:287](/Users/richy/Dalefy/mobile/services/firebaseAuth.ts:287), [storage.rules:6](/Users/richy/Dalefy/storage.rules:6).

Memberships/profile/tokens are removed before Firebase `deleteUser`, which can demand recent authentication. Most cleanup errors are swallowed. Avatar rules require `request.resource.size/contentType` for writes and lack an explicit delete grant; deletion has no new resource, so avatar cleanup is denied. User-generated media also is not part of the stated cleanup sequence.

**Fix:** Reauthenticate before destructive cleanup and use an idempotent server cleanup job with an observable result. Add explicit owner avatar-delete rules and define retention/removal of uploaded media. Suggested command: `/harden`.

```text
Before: delete associated records (ignore errors) → delete auth user
After:  reauthenticate → durable cleanup request → retryable cleanup → report status
```

### 21. Initial bundle and mobile refresh patterns are unnecessarily heavy

**Location:** [App.tsx:27](/Users/richy/Dalefy/src/App.tsx:27), [mobile/services/firebaseTrips.ts:98](/Users/richy/Dalefy/mobile/services/firebaseTrips.ts:98), [build output](web-build.log).

The main chunk is **3,057 kB minified / 866 kB gzip**. Mapbox adds **1,742 kB / 474 kB gzip**. Pages are eagerly imported, and the build reports ineffective dynamic imports. PWA precache is approximately **7,234 KiB**, including assets beyond initial execution. These are artifact measurements, not measured load times.

Each mobile trip subscription callback refetches every joined trip, so initial callbacks or several changes multiply reads. This increases network cost and refresh work for frequent travelers.

**Fix:** Split routes, load maps/import/export tooling when needed, review precache coverage, and apply snapshot data directly with a membership-driven subscription set. Suggested command: `/optimize`.

### 22. Small controls and hover-only affordances need touch testing

**Location:** [WorkspacePage.tsx:1981](/Users/richy/Dalefy/src/pages/WorkspacePage.tsx:1981), [organizer edit:1516](/Users/richy/Dalefy/src/pages/WorkspacePage.tsx:1516).

Some mobile controls are 32 × 32 CSS pixels; organizer editing appears only on group hover. These fall below the audit’s 44 × 44 comfort target and can be hard to discover/use on touch. A 32 px control alone is not proof of a WCAG 2.2 minimum-target violation; spacing and exceptions matter.

**Fix:** Enlarge effective hit areas, expose important actions on touch and focus, and verify narrow phones, landscape, tablets, and enlarged text. Existing responsive side panels are a good foundation. Suggested command: `/adapt`.

### 23. Hard-coded styles weaken theme consistency

**Location:** [WorkspacePage.tsx:3051](/Users/richy/Dalefy/src/pages/WorkspacePage.tsx:3051), [eventStyles.ts:17](/Users/richy/Dalefy/src/config/eventStyles.ts:17).

Hard-coded dark form backgrounds and very dim placeholders bypass the elevation/text tokens. Fixed event colors in shared pages/maps do not track the runtime brand accent, while the core interface uses swappable tokens. These are consistency and readability risks; no blanket failure of dark mode is claimed.

**Fix:** Apply semantic surface/placeholder tokens and define intentional exceptions for event identity versus organization accent. Verify both themes and custom branding. Suggested commands: `/colorize`, `/polish`.

## What is working well

- Web production build and mobile TypeScript checks pass.
- Organization invites enforce verified email, matching organization/role, expiry, and restricted role updates in the rules. The server invite endpoint checks owner/admin membership.
- Firebase JWT verification checks signature, issuer and audience; cron HTTP authentication uses a configured secret and constant-time comparison.
- Real environment files are ignored, provider secrets are referenced server-side, and the limited tracked-file scan found no private-key patterns.
- There are shared API core modules, input validation, defensive image-proxy checks, and rate limiting to strengthen rather than discard.
- Semantic theme tokens, native UI primitives, labeled login inputs, global focus styles, reduced-motion CSS, and responsive panels already exist.
- Cloud Functions detect publication changes and batch recipient lookups. That is a useful base for a single authoritative notification path.

## Systemic causes and recommended order

The central architectural issue is that a trip document mixes private workspace data, published traveler data, membership-related edits, and live operational state. Both clients serialize large objects back into it. Permissions then become broad to make those writes work, and presentation filters are asked to provide privacy they cannot enforce.

1. **P0 `/harden`:** repair Firestore/Storage permissions with an explicit role matrix and emulator tests; split private/published/leader data. Coordinate the client migration so legitimate sharing still works.
2. **P1 `/harden`:** replace full-trip traveler writes with scoped mutations; implement one publish contract; fix task/compliance persistence and cache revocation.
3. **P1 `/harden`:** authorize push recipients, protect proxy fetches, add durable quotas, and triage dependency upgrades. Consolidate notifications around acknowledged changes.
4. **P1 `/colorize` and `/harden`:** repair measured contrast failures and keyboard disclosures.
5. **P2 `/optimize` and `/adapt`:** reduce loading/read amplification and verify actual touch layouts on devices.
6. **P2 `/polish`:** finish theme consistency after correctness and security checks pass.

These commands are categories for follow-up work, not evidence that fixes have already been applied. The report contains recommendations only; application code and cloud configuration were not changed. You can request these one at a time, together, or in another order. Re-run `/audit` after fixes.

## Checks still needed before release

- Confirm deployed Firestore/Storage rules match the reviewed source; run deny/allow tests for every role, including anonymous users and unrelated organizations.
- Exercise join, publish, edit-without-publish, leader-only access, concurrent edits, offline recovery, membership removal, and deletion against isolated test data.
- Complete Functions dependency installation/build and scan its separate dependency tree.
- Test browser/device flows, real notification receipts, PDF import/export, document upload/download, accessible names/focus, responsive overflow, and custom themes.
- Review full Git history for secrets and inspect provider restrictions, quotas, logging, backups, and restore procedures. None of those production settings were validated here.
- The session reports an outdated Vercel CLI. Upgrade with `npm i -g vercel@latest` before future deployment work; no global software was changed during this audit.

Firestore query behavior was cross-checked against [Firebase’s rules/query documentation](https://firebase.google.com/docs/firestore/security/rules-query): queries must be authorized for their potential results; UI filtering does not provide database access control.
