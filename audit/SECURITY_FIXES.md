# Trip security fixes — release notes

The first three blockers from `SECOND_OPINION.md` are addressed. The web/API, Firebase rules, server identity, and file-link migration were deployed on 11 September 2026. The API-enabled iOS client is build 65; its TestFlight submission was queued at cutover. Earlier build 64 uses the old reader and must be replaced.

## Changed behavior

- Firestore working trip documents are readable only by their owner, organization staff, and the configured server UID. Travelers cannot update them. Owner UID and existing organization identity cannot be changed by client writes.
- `/api/trip` returns an explicit allowlist from `published_snapshot`; there is no fallback to live working data. Drafts and published legacy records without a valid snapshot fail closed. Public sharing intentionally exposes the approved itinerary, organizer contact fields, and published traveler display names; emails in the traveler roster, budget, internal event notes, supplier/price/reference fields, and leader-only pages are excluded from public responses.
- Leader-only published information is included only for an authenticated UID with its own matching leader membership. Membership rules block self-promotion, identity reassignment, and unrelated-organization moderation.
- Gallery changes use a member-authorized server endpoint. Only additions under the caller's own Storage path and deletion of that caller's uploads are accepted. The server writes only `media` with a Firestore update-time precondition, so it cannot overwrite working events.
- Storage changes check the target trip's editor permissions. Travelers can upload/delete under their own gallery folder on a joined, published trip. Draft and leader-only file metadata cannot be fetched by ordinary travelers. Approved published attachment download URLs are bearer capabilities, intentionally delivered only by the filtered view.
- Mobile reads the filtered API and refreshes every 30 seconds, with membership-driven refreshes. The old private-document cache is discarded on upgrade. New trip IDs use cryptographic UUIDs; existing shared links retain their current IDs.

## Required rollout

1. Back up Firestore and Storage metadata. Identify the dedicated server Firebase Auth user, existing leader assignments, and old mobile versions. The migration resets leader assignments because the old rules allowed self-promotion; export and review legitimate assignments before the maintenance window.
2. Ensure Vercel/server environment has `CRON_EMAIL`, `CRON_PASSWORD`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_STORAGE_BUCKET`. Provision `app_config/server_identity` with `{ uid: <dedicated server Firebase UID> }` using an administrator. No client can change it. This replaces email-based server privilege checks. Existing cron jobs also need this document.
3. Build and distribute the updated mobile client and deploy the web/API together. The new API works with existing valid published snapshots; legacy trips must be deliberately republished. The Vite local server forwards `/api/trip` to the same handler and needs the same server environment variables. Existing clients that query working records directly will stop working after rule lockdown; treat the mobile update as required.
4. During a maintenance window, deploy Firestore and Storage rules together. Firebase Storage may prompt to enable its cross-service Firestore permission; approve it for this project. Verify the dedicated server can read working trips, and public clients cannot.
5. Rotate old Firebase download tokens and rewrite references. **Rules alone do not revoke previously exposed download capabilities.** Use the preparation script below after rule lockdown, with application writes paused. It rotates tokens even for unreferenced files, repairs nested references in working/published trip data, resets old leader roles, and removes malformed membership records. Re-running can repair interrupted token/reference updates. If a concurrent write causes a precondition error, stop application writes and rerun before ending maintenance.
6. Reapprove legitimate leaders using the organizer UI. Republish trips lacking snapshots or published traveler display names. Refresh clients so old URLs are replaced. Verify an old captured private download URL now fails and the replacement opens only through its intended authorized flow.
7. Test owner/agent editing, unrelated-user denial, PIN/shared-link viewing, draft edits staying private, leader promotion/demotion, mobile gallery upload/deletion, and cron access against isolated release-test trips.

The changes deliberately do not tighten unrelated global profile/roster reads, repair compliance persistence, or address every other audit finding. Published information remains shareable; changing shared-link product semantics is a separate decision. Existing timestamp-based shared IDs remain guessable, but no longer reveal the full working record. Offline copies and already downloaded information cannot be recalled.

## Migration commands

The script uses Firebase Admin from the existing Functions package and Application Default Credentials (ADC), never bundled client credentials. Run `npm ci --prefix functions` first if needed. An administrator must authenticate ADC for the intended project. The script does not log file URLs, tokens, or traveler information.

```sh
# Read-only inventory. Replace YOUR_PROJECT with the exact project ID.
node --env-file=.env.local scripts/prepare-trip-security.mjs --project=YOUR_PROJECT

# Consequential production action: run only as part of the approved maintenance release.
node --env-file=.env.local scripts/prepare-trip-security.mjs --project=YOUR_PROJECT --apply
```

Do not run `--apply` before the new rules block public Storage metadata reads, or an attacker could recover replacement tokens. Public attachment URLs intentionally issued after migration are capabilities; recipients can share those links. If strict per-request authorization is required, migrate attachment delivery to authenticated streaming instead.

## Tests

```sh
npm run test:security:unit
# Requires firebase CLI and Java 21+, local synthetic demo project only:
npm run test:security
npm run build
cd mobile && npx tsc --noEmit
```

The emulator tests cover direct reads/writes, ownership takeover, organization injection, server UID spoofing, membership escalation, attachment replacement/deletion, and permitted editor/gallery operations. Pure tests check private-field redaction, published-snapshot selection, membership identity, and media ownership/merge behavior.

## Verification result — 11 September 2026

- **35/35 tests passed** in the combined Firestore/Storage emulator and HTTP-handler regression suite. All data was synthetic in `demo-dalefy-security`.
- Web production build, mobile TypeScript check, Functions build, and the new API's strict TypeScript check passed.
- ESLint passed for the two new API modules. Existing React lint findings remain in SharedTripPage (set-state-in-effect and preserved memoization); no broad lint cleanup was performed.
- A real HTTP request through the local Vite adapter returned `400 Invalid trip ID` with `Cache-Control: private, no-store`, confirming route wiring without accessing production data.
- Migration syntax and Admin SDK imports were validated; **neither dry-run inventory nor apply was run against production**. Production token revocation, rules deployment, leader reassignment, and mobile distribution remain release actions.
- No browser or physical-device surface was available. Rendered/native end-to-end sharing and upload tests remain part of release verification.
- Concurrent mobile navigation/theme/empty-state changes were observed in the shared workspace and preserved; they are not part of this security fix.


## Simulator recovery, 11 September 2026

The first mobile security patch cleared the legacy cache and activated `/api/trip` before that API was deployed. The simulator consequently showed no trips. Read-only checks under its existing Firebase account confirmed five linked cloud trips still existed, each with a published snapshot.

Recovery removes automatic legacy-cache deletion, avoids saving an empty initial render, and distinguishes initial auth restoration from a later account switch. Mobile reads temporarily use the existing deployed Firestore path, combining account and legacy device memberships without writing or promoting memberships. Published snapshots are used for itinerary content. The API reader now requires `EXPO_PUBLIC_TRIP_API_ENABLED=true`, and a deployment-level 404 throws instead of returning an authoritative empty list.

This compatibility path is not a replacement for the pending server security rollout. Deploy and verify the API/server identity/migration/rules together before enabling the mobile flag. Gallery mutations still require the new API; this recovery only restores trip reading. No production data migration or rules deployment was performed.

Verification: all five trips reappeared in the running iPhone 17 Pro simulator after an Expo reload, and all five were persisted in its local cache. Six focused recovery regression tests and the mobile TypeScript check passed. Remaining simulator storage was backed up to `/tmp/dalefy-trip-recovery-backup` before edits; it contains private app data and must not be committed.

## Production cutover — 11 September 2026

- Production web/API: `https://dalefy.vercel.app`; the filtered published view was checked against all seven production trips.
- Private backups of affected Firestore documents, file metadata, and prior rules were taken under `.release-backups/`, excluded from Git and deployment uploads. A fresh document/metadata backup was taken while client writes were paused.
- Provisioned the dedicated server identity and deployed temporary maintenance rules. Confirmed unauthenticated working-trip and Storage metadata requests were denied before rotating tokens.
- Rotated 904 file tokens and repaired references in all seven trips. Reset 412 legacy leader records; removed zero memberships. Organisers must reapprove legitimate leaders. No trips required republishing for missing snapshots.
- Deployed final Firestore/Storage rules and restored authorized writes. Added `roles/firebaserules.firestoreServiceAgent` to the project's Firebase Storage service agent; live upload testing identified this missing cross-service permission.
- Updated the trip notification function so download-token rotation alone does not notify travellers. Three focused tests and the Functions build passed.
- Mobile now defaults to the filtered API and uses a new sanitized cache. The old cache is removed only after a new cache write succeeds. Seven recovery/API tests and mobile TypeScript passed; the combined security suite passed 42 tests before the notification tests were added.
- Build 65 (`af5af51f-cffd-4099-af99-68daba8cd18a`) completed with runtime `1.0.0-security-20260911`. Submission `73d9bdee-fa14-48db-b23f-ce8baf4cc0a2` was queued by Expo. No OTA was sent to older native builds sharing runtime 1.0.0.
- Earlier historical sections above describe the staged work and simulator recovery before this cutover; the temporary direct-reader compatibility path is no longer the production default.

- Final live verification: **29 checks passed**, covering all seven published trips, private-read denial, old-token revocation, replacement file access, owner editing, unchanged published content after draft edits, joining, leader promotion/demotion, and gallery upload/add/remove/delete. Synthetic test data and Auth accounts were removed successfully. Storage probes use the Firebase SDK’s `Authorization: Firebase` token format.
