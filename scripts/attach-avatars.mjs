/**
 * Attach a folder of headshots to the traveller directory, matched by file name.
 *
 *   node scripts/attach-avatars.mjs --project=<VITE_FIREBASE_PROJECT_ID> [--folder="/Volumes/My Passport for Mac/Avatars"] [--org=<orgId>] [--replace] [--apply]
 *
 * Without --apply it only prints what would happen. Each matched photo is shrunk to 512px JPEG with sips,
 * uploaded under avatars/directory/, and the URL is written on the directory entry, on every trip's traveller
 * list and on the published copies, which is how the phone picks it up. Matching: the file name (without
 * extension and any " - suffix") against the full name first, then a bare first name when exactly one
 * person has it. Anything ambiguous or unmatched is listed and skipped.
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name) => args.includes(`--${name}`);

const root = new URL('..', import.meta.url).pathname;
for (const envFile of ['.env', '.env.local']) {
  const file = path.join(root, envFile);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const project = flag('project');
if (!project || project !== process.env.VITE_FIREBASE_PROJECT_ID) {
  throw new Error('Pass --project=<VITE_FIREBASE_PROJECT_ID> explicitly; the values must match.');
}
const bucketName = process.env.VITE_FIREBASE_STORAGE_BUCKET;
if (!bucketName) throw new Error('VITE_FIREBASE_STORAGE_BUCKET is not set');
const folder = flag('folder') ?? '/Volumes/My Passport for Mac/Avatars';
const orgFilter = flag('org') ?? null;
const apply = has('apply');
const replace = has('replace');

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
initializeApp({ credential: applicationDefault(), projectId: project, storageBucket: bucketName });
const db = getFirestore();
const bucket = getStorage().bucket();

// ── Photos on disk ──────────────────────────────────────────────────────────
const norm = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const stemOf = (file) => norm(path.basename(file).replace(/\.[a-z0-9]+$/i, '').split(/\s+-\s+/)[0].replace(/_+/g, ' '));
const isImage = (f) => /\.(png|jpe?g|webp)$/i.test(f) && !path.basename(f).startsWith('.');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (isImage(full)) out.push(full);
  }
  return out;
}
if (!existsSync(folder)) throw new Error(`Folder not found: ${folder}`);
const photos = walk(folder);
console.log(`${photos.length} photos in ${folder}`);

// ── People in the directory ─────────────────────────────────────────────────
const dirSnap = await db.collection('directory_travelers').get();
const people = dirSnap.docs
  .map(d => ({ ref: d.ref, org: d.data().organization_id ?? null, ...d.data().traveler }))
  .filter(p => p && typeof p.id === 'string' && typeof p.name === 'string')
  .filter(p => !orgFilter || p.org === orgFilter);
console.log(`${people.length} people in the directory${orgFilter ? ` for org ${orgFilter}` : ''}`);

function matchPerson(file) {
  const stem = stemOf(file);
  const exact = people.filter(p => norm(p.name) === stem);
  if (exact.length === 1) return { person: exact[0] };
  if (exact.length > 1) return { ambiguous: exact };
  const first = stem.split(' ')[0];
  const byFirst = people.filter(p => norm(p.name).split(' ')[0] === first);
  if (byFirst.length === 1) return { person: byFirst[0] };
  return byFirst.length ? { ambiguous: byFirst } : {};
}

const plan = [];
const skipped = { ambiguous: [], unmatched: [], hasPhoto: [], duplicate: [] };
const taken = new Set();
for (const file of photos.sort()) {
  const m = matchPerson(file);
  const label = path.relative(folder, file);
  if (m.ambiguous) { skipped.ambiguous.push(`${label} -> ${m.ambiguous.map(p => p.name).join(' | ')}`); continue; }
  if (!m.person) { skipped.unmatched.push(label); continue; }
  if (taken.has(m.person.id)) { skipped.duplicate.push(`${label} -> ${m.person.name} (already matched by another file)`); continue; }
  if (m.person.avatar && !replace) { skipped.hasPhoto.push(`${label} -> ${m.person.name}`); continue; }
  taken.add(m.person.id);
  plan.push({ file, label, person: m.person });
}

console.log(`\n${plan.length} to attach:`);
for (const p of plan) console.log(`  ${p.label}  ->  ${p.person.name}`);
const show = (title, list) => { if (list.length) { console.log(`\n${title} (${list.length}):`); for (const l of list) console.log(`  ${l}`); } };
show('Ambiguous, pick by renaming the file to the full name', skipped.ambiguous);
show('No one by that name', skipped.unmatched);
show('Already have a photo, pass --replace to overwrite', skipped.hasPhoto);
show('Second file for the same person', skipped.duplicate);

if (!apply) { console.log('\nDry run. Add --apply to upload and attach.'); process.exit(0); }

// ── Shrink, upload, write ───────────────────────────────────────────────────
const tmp = mkdtempSync(path.join(tmpdir(), 'avatars-'));
const tripSnap = await db.collection('trips').get();
const trips = tripSnap.docs.map(d => ({ ref: d.ref, data: d.data() }));
let done = 0;
for (const { file, person } of plan) {
  const small = path.join(tmp, `${person.id}.jpg`);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', '-Z', '512', file, '--out', small], { stdio: 'ignore' });
  const dest = `avatars/directory/${person.id}-${Date.now()}.jpg`;
  const token = randomUUID();
  await bucket.upload(small, { destination: dest, contentType: 'image/jpeg', metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;

  const batch = db.batch();
  batch.update(person.ref, { 'traveler.avatar': url, updated_at: new Date().toISOString() });
  for (const trip of trips) {
    const withPhoto = (list) => Array.isArray(list) && list.some(t => t?.id === person.id)
      ? list.map(t => (t?.id === person.id ? { ...t, avatar: url } : t))
      : null;
    const travelers = withPhoto(trip.data.travelers);
    const snapTravelers = withPhoto(trip.data.published_snapshot?.travelers);
    if (!travelers && !snapTravelers) continue;
    const updates = {};
    if (travelers) updates.travelers = travelers;
    if (snapTravelers) updates['published_snapshot.travelers'] = snapTravelers;
    batch.update(trip.ref, updates);
  }
  await batch.commit();
  done += 1;
  console.log(`${done}/${plan.length} ${person.name}`);
}
console.log(`\nAttached ${done} photos.`);
