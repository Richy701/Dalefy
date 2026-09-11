import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

// No mutations without --apply. Run during a coordinated maintenance window.
const args = process.argv.slice(2);
const project = args.find(v => v.startsWith('--project='))?.slice('--project='.length);
const apply = args.includes('--apply');
if (!project || project !== process.env.VITE_FIREBASE_PROJECT_ID) {
  throw new Error('Pass --project=<VITE_FIREBASE_PROJECT_ID> explicitly; the values must match.');
}
if (!process.env.CRON_EMAIL || !process.env.VITE_FIREBASE_STORAGE_BUCKET) {
  throw new Error('CRON_EMAIL and VITE_FIREBASE_STORAGE_BUCKET are required.');
}
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
initializeApp({ credential: applicationDefault(), projectId: project, storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET });
const db = getFirestore();
const serverUser = await getAuth().getUserByEmail(process.env.CRON_EMAIL);
if (serverUser.disabled) throw new Error('The server account is disabled.');
const bucket = getStorage().bucket();
const [files] = await bucket.getFiles({ prefix: 'trips/' });
const trips = await db.collection('trips').get();
const members = await db.collection('trip_members').get();
let legacyTrips = 0;
for (const doc of trips.docs) {
  const data = doc.data();
  if (['Published', 'published'].includes(data.status) && !data.published_snapshot?.publishedAt) legacyTrips++;
}
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', project, tripFiles: files.length, trips: trips.size, memberships: members.size, publishedTripsNeedingRepublish: legacyTrips }));
if (!apply) {
  console.log('No changes made. Apply requires ADC with Firebase Auth, Firestore and Storage administration.');
  process.exit(0);
}
await db.doc('app_config/server_identity').set({ uid: serverUser.uid });

// Rotate every trip capability, including files no longer referenced by a trip.
// Re-running repairs stored references by path, even after a partial prior run.
const tokens = new Map();
for (const file of files) {
  const [metadata] = await file.getMetadata();
  const token = randomUUID();
  await file.setMetadata({ metadata: { ...metadata.metadata, firebaseStorageDownloadTokens: token } });
  tokens.set(file.name, token);
}
function rewrite(value) {
  if (typeof value === 'string') {
    return value.replace(/https:\/\/firebasestorage\.googleapis\.com\/[^\s<>"')]+/g, match => {
      try {
        const url = new URL(match);
        const prefix = `/v0/b/${bucket.name}/o/`;
        if (!url.pathname.startsWith(prefix)) return match;
        const token = tokens.get(decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!token) return match;
        url.searchParams.set('token', token);
        return url.toString();
      } catch { return match; }
    });
  }
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, rewrite(val)]));
  return value;
}
let updated = 0;
for (const original of trips.docs) {
  // Fetch after rotations so a rerun can repair references from a partial run.
  const doc = await original.ref.get();
  if (!doc.exists) continue;
  const data = doc.data();
  const patch = {};
  for (const [key, value] of Object.entries(data)) {
    const next = rewrite(value);
    if (JSON.stringify(next) !== JSON.stringify(value)) patch[key] = next;
  }
  // Preserve an already published roster only; legacy records stay redacted
  // until their organizer deliberately republishes.
  if (Object.keys(patch).length) {
    await doc.ref.update(patch, { lastUpdateTime: doc.updateTime });
    updated++;
  }
}
// Previous rules allowed role and identity forgery. Keep self-consistent IDs,
// remove malformed records, and require staff to reapprove all leader access.
let reset = 0;
let removed = 0;
for (const doc of members.docs) {
  const data = doc.data();
  const valid = typeof data.uid === 'string' && typeof data.device_id === 'string' && typeof data.trip_id === 'string'
    && [data.uid, data.device_id].some(key => doc.id === `${key}_${data.trip_id}`);
  if (!valid) { await doc.ref.delete({ lastUpdateTime: doc.updateTime }); removed++; }
  else if (data.role === 'leader') { await doc.ref.update({ role: 'traveler' }, { lastUpdateTime: doc.updateTime }); reset++; }
}
console.log(JSON.stringify({ updatedTrips: updated, rotatedFiles: tokens.size, resetLeaderMemberships: reset, removedMalformedMemberships: removed }));
console.log('Reapprove legitimate leaders, republish legacy trips, and verify old download URLs fail. Previously downloaded copies cannot be recalled.');
