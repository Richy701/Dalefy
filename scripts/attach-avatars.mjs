/**
 * Attach a folder of headshots to the traveller directory, matched by file name.
 *
 *   node scripts/attach-avatars.mjs --project=<VITE_FIREBASE_PROJECT_ID> [--folder="/Volumes/My Passport for Mac/Avatars"] [--org=<orgId>] [--from-trips] [--only="Name, Name"] [--replace] [--apply]
 *
 * Staff travel too, so --from-trips adds anyone a photo names who is on a trip but not yet in the directory,
 * using the trip's own entry for them. A person's photo goes onto every trip entry with their id or full name,
 * and onto the organiser card of trips they organise.
 *
 * Without --apply it only prints what would happen. Each matched photo is shrunk to 512px JPEG with sips,
 * uploaded under avatars/directory/, and the URL is written on the directory entry, on every trip's traveller
 * list and on the published copies, which is how the phone picks it up. Matching: the file name (without
 * extension and any " - suffix") against the full name first, then a bare first name when exactly one
 * person has it. Anything ambiguous or unmatched is listed and skipped.
 *
 * --by-email matches each file to the person whose work email starts with it (the broker name: "ElliotA.png" is
 * elliota@..., "Ash.png" is ash.murray@... when no one else's email starts with ash). Files are named that way,
 * so it beats name matching. Pair it with --replace to correct photos an earlier name match got wrong.
 *
 * --clear --only="Name, Name" takes those people's photos off everywhere (directory, trips, published copies,
 * organiser cards), for a photo that turned out to be someone else. Needs no folder.
 *
 * --resync needs no folder: it copies each person's directory photo back onto trip entries (and published
 * copies and organiser cards) that have lost it, e.g. after a re-import blanked them. Existing photos stay.
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
const fromTrips = has('from-trips');
const resync = has('resync');
const byEmail = has('by-email');
const clear = has('clear');
// Just these people, by full name, when the rest of a match list is still under review
const only = (flag('only') ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
if (clear && !only.length) throw new Error('--clear needs --only="Name, Name" so it never clears everyone');

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
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
if (!resync && !clear && !existsSync(folder)) throw new Error(`Folder not found: ${folder}`);
const photos = resync || clear ? [] : walk(folder);
if (!resync && !clear) console.log(`${photos.length} photos in ${folder}`);

// ── People in the directory ─────────────────────────────────────────────────
const dirSnap = await db.collection('directory_travelers').get();
const people = dirSnap.docs
  .map(d => ({ ref: d.ref, org: d.data().organization_id ?? null, ...d.data().traveler }))
  .filter(p => p && typeof p.id === 'string' && typeof p.name === 'string')
  .filter(p => !orgFilter || p.org === orgFilter);
console.log(`${people.length} people in the directory${orgFilter ? ` for org ${orgFilter}` : ''}`);

// ── People on trips, by full name, with every id they have been given ───────
const tripSnap = await db.collection('trips').get();
const trips = tripSnap.docs.map(d => ({ ref: d.ref, data: d.data() }));
const tripPeople = new Map();
for (const trip of trips) {
  const org = trip.data.organization_id ?? null;
  if (orgFilter && org !== orgFilter) continue;
  for (const t of trip.data.travelers ?? []) {
    if (!t?.id || typeof t.name !== 'string' || !t.name.trim()) continue;
    const key = norm(t.name);
    const entry = tripPeople.get(key) ?? { name: t.name.trim(), ids: [], email: '', initials: t.initials ?? '', org };
    if (!entry.ids.includes(t.id)) entry.ids.push(t.id);
    if (!entry.email && t.email) entry.email = t.email.trim();
    tripPeople.set(key, entry);
  }
}
const idsFor = (person) => [...new Set([person.id, ...(tripPeople.get(norm(person.name))?.ids ?? [])])];
// The directory doc id and the uploader on record follow the existing entries of the same organisation
const userIdFor = (org) => dirSnap.docs.find(d => d.data().organization_id === org)?.data().user_id ?? null;

// ── Clear: take named people's photos off everywhere ─────────────────────────
if (clear) {
  const targets = people.filter(p => only.includes(norm(p.name)));
  const missingNames = only.filter(n => !targets.some(p => norm(p.name) === n));
  if (missingNames.length) console.log(`Not in the directory: ${missingNames.join(', ')}`);
  for (const person of targets) {
    const ids = idsFor(person);
    const onTrips = trips.filter(t => [...(t.data.travelers ?? []), ...(t.data.published_snapshot?.travelers ?? [])].some(x => ids.includes(x?.id) && x.avatar)
      || [t.data.organizer, t.data.published_snapshot?.organizer].some(o => o?.name && norm(o.name) === norm(person.name) && o.avatar && o.avatar === person.avatar));
    console.log(`  ${person.name}: photo ${person.avatar ? 'in the directory' : 'not in the directory'}, on ${onTrips.length} trip(s)${onTrips.length ? `: ${onTrips.map(t => t.data.name).join(', ')}` : ''}`);
  }
  if (!apply) { console.log('\nDry run. Add --apply to remove these photos.'); process.exit(0); }
  for (const person of targets) {
    const ids = idsFor(person);
    const batch = db.batch();
    batch.update(person.ref, { 'traveler.avatar': FieldValue.delete(), updated_at: new Date().toISOString() });
    const strip = (list) => Array.isArray(list) && list.some(t => ids.includes(t?.id) && t.avatar)
      ? list.map(t => { if (!ids.includes(t?.id)) return t; const { avatar: _gone, ...rest } = t; return rest; })
      : null;
    // Only an organiser card showing this very photo loses it; a card with its own photo stays
    const unOrg = (o) => o?.name && norm(o.name) === norm(person.name) && o.avatar && o.avatar === person.avatar ? (({ avatar: _gone, ...rest }) => rest)(o) : null;
    for (const trip of trips) {
      const travelers = strip(trip.data.travelers);
      const snapTravelers = strip(trip.data.published_snapshot?.travelers);
      const organiser = unOrg(trip.data.organizer);
      const snapOrganiser = unOrg(trip.data.published_snapshot?.organizer);
      if (!travelers && !snapTravelers && !organiser && !snapOrganiser) continue;
      const updates = {};
      if (travelers) updates.travelers = travelers;
      if (snapTravelers) updates['published_snapshot.travelers'] = snapTravelers;
      if (organiser) updates.organizer = organiser;
      if (snapOrganiser) updates['published_snapshot.organizer'] = snapOrganiser;
      batch.update(trip.ref, updates);
      batch.set(db.collection('trip_versions').doc(trip.ref.id), { updated_at: FieldValue.serverTimestamp() });
      if (travelers) trip.data.travelers = travelers;
      if (snapTravelers) trip.data.published_snapshot = { ...trip.data.published_snapshot, travelers: snapTravelers };
    }
    await batch.commit();
    console.log(`Cleared ${person.name}`);
  }
  process.exit(0);
}

function matchTripPerson(file) {
  const stem = stemOf(file);
  const exact = tripPeople.get(stem);
  if (exact) return exact;
  if (stem.includes(' ')) return null;
  const byFirst = [...tripPeople.values()].filter(p => norm(p.name).split(' ')[0] === stem);
  return byFirst.length === 1 ? byFirst[0] : null;
}

// The broker name: the part of a work email before the @, and its first piece before a dot
const key = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const emailKeys = (email) => {
  const local = String(email ?? '').split('@')[0].toLowerCase();
  return local ? { whole: key(local), first: key(local.split(/[._-]/)[0]) } : null;
};
function matchByEmail(file, list) {
  const stem = key(stemOf(file));
  const whole = list.filter(p => emailKeys(p.email)?.whole === stem);
  if (whole.length === 1) return { person: whole[0] };
  if (whole.length > 1) return { ambiguous: whole };
  const first = list.filter(p => emailKeys(p.email)?.first === stem);
  if (first.length === 1) return { person: first[0] };
  return first.length ? { ambiguous: first } : {};
}

function matchPerson(file) {
  if (byEmail) return matchByEmail(file, people);
  const stem = stemOf(file);
  const exact = people.filter(p => norm(p.name) === stem);
  if (exact.length === 1) return { person: exact[0] };
  if (exact.length > 1) return { ambiguous: exact };
  // "Lee Graham.png" must not land on Lee Birkett: a first name alone only stands in when that is all the file gives
  if (stem.includes(' ')) return {};
  const byFirst = people.filter(p => norm(p.name).split(' ')[0] === stem);
  if (byFirst.length === 1) return { person: byFirst[0] };
  return byFirst.length ? { ambiguous: byFirst } : {};
}

const plan = [];
const skipped = { ambiguous: [], unmatched: [], hasPhoto: [], duplicate: [] };
const taken = new Set();
// A traveller's own photo wins over a same-named staff photo in Admin/, so staff folders are looked at last
const depth = (f) => path.relative(folder, f).split(path.sep).length;
for (const file of photos.sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))) {
  const m = matchPerson(file);
  const label = path.relative(folder, file);
  if (m.ambiguous) { skipped.ambiguous.push(`${label} -> ${m.ambiguous.map(p => p.name).join(' | ')}`); continue; }
  if (!m.person && fromTrips) {
    const tp = byEmail ? matchByEmail(file, [...tripPeople.values()].filter(t => t.email)).person : matchTripPerson(file);
    if (tp && !people.some(p => norm(p.name) === norm(tp.name))) {
      const id = tp.ids[0];
      const org = tp.org;
      if (!org || !userIdFor(org)) { skipped.unmatched.push(`${label} -> ${tp.name} (trip has no organisation on record)`); continue; }
      m.person = { id, name: tp.name, email: tp.email, initials: tp.initials, org, create: true, ref: db.collection('directory_travelers').doc(`${org}__${id}`) };
    }
  }
  if (!m.person) { skipped.unmatched.push(label); continue; }
  if (only.length && !only.includes(norm(m.person.name))) continue;
  if (taken.has(m.person.id)) { skipped.duplicate.push(`${label} -> ${m.person.name} (already matched by another file)`); continue; }
  if (m.person.avatar && !replace) { skipped.hasPhoto.push(`${label} -> ${m.person.name}`); continue; }
  taken.add(m.person.id);
  plan.push({ file, label, person: m.person });
}

// Resync: everyone in the directory who has a photo, put back where a trip copy lost it
if (resync) for (const person of people) {
  if (!person.avatar || (only.length && !only.includes(norm(person.name)))) continue;
  const ids = idsFor(person);
  const missing = trips.filter(t => [...(t.data.travelers ?? []), ...(t.data.published_snapshot?.travelers ?? [])].some(x => ids.includes(x?.id) && !x.avatar)).map(t => t.data.name);
  if (missing.length) plan.push({ label: `${person.name} (missing on: ${[...new Set(missing)].join(', ')})`, person, url: person.avatar });
}

console.log(`\n${plan.length} to ${resync ? 'resync' : 'attach'}:`);
for (const p of plan) console.log(`  ${p.label}  ->  ${p.person.name}${p.person.email ? ` <${p.person.email}>` : ''}${p.person.create ? '  (new in the directory, from their trips)' : ''}${p.person.avatar && !resync ? '  (replaces their current photo)' : ''}`);
// Photos an earlier first-name match may have got wrong: nobody's file answers to their email
if (byEmail) {
  const planned = new Set(plan.map(p => p.person.id));
  const doubtful = people.filter(p => p.avatar && !planned.has(p.id) && !photos.some(f => matchByEmail(f, [p]).person));
  if (doubtful.length) { console.log(`\nHave a photo but no file matches their email, check these by eye (${doubtful.length}):`); for (const p of doubtful) console.log(`  ${p.name}${p.email ? ` <${p.email}>` : '  (no email)'}`); }
  const noEmail = people.filter(p => !p.email);
  if (noEmail.length) { console.log(`\nNo email in the directory, so not matched (${noEmail.length}):`); for (const p of noEmail) console.log(`  ${p.name}`); }
}
const show = (title, list) => { if (list.length) { console.log(`\n${title} (${list.length}):`); for (const l of list) console.log(`  ${l}`); } };
show('Ambiguous, pick by renaming the file to the full name', skipped.ambiguous);
show('No one by that name', skipped.unmatched);
show('Already have a photo, pass --replace to overwrite', skipped.hasPhoto);
show('Second file for the same person', skipped.duplicate);

if (!apply) { console.log(`\nDry run. Add --apply to ${resync ? 'write these photos back onto the trips' : 'upload and attach'}.`); process.exit(0); }

// ── Shrink, upload, write ───────────────────────────────────────────────────
const tmp = mkdtempSync(path.join(tmpdir(), 'avatars-'));
let done = 0;
for (const { file, person, url: existingUrl } of plan) {
  let url = existingUrl;
  if (!resync) {
    const small = path.join(tmp, `${person.id}.jpg`);
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', '-Z', '512', file, '--out', small], { stdio: 'ignore' });
    const dest = `avatars/directory/${person.id}-${Date.now()}.jpg`;
    const token = randomUUID();
    await bucket.upload(small, { destination: dest, contentType: 'image/jpeg', metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
    url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
  }

  const batch = db.batch();
  if (resync) { /* the directory already has this photo */ } else if (person.create) {
    const initials = person.initials || person.name.split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);
    batch.set(person.ref, {
      organization_id: person.org,
      user_id: userIdFor(person.org),
      updated_at: new Date().toISOString(),
      traveler: { id: person.id, name: person.name, email: person.email ?? '', role: 'Traveler', initials, status: 'Active', avatar: url },
    });
  } else {
    batch.update(person.ref, { 'traveler.avatar': url, updated_at: new Date().toISOString() });
  }
  const ids = idsFor(person);
  for (const trip of trips) {
    // A resync only fills entries that lost their photo
    const wants = (t) => ids.includes(t?.id) && (!resync || !t.avatar);
    const withPhoto = (list) => Array.isArray(list) && list.some(wants)
      ? list.map(t => (wants(t) ? { ...t, avatar: url } : t))
      : null;
    const travelers = withPhoto(trip.data.travelers);
    const snapTravelers = withPhoto(trip.data.published_snapshot?.travelers);
    // Staff travel too: a trip they organise shows their face on the organiser card as well
    const organiser = trip.data.organizer?.name && norm(trip.data.organizer.name) === norm(person.name) && (!trip.data.organizer.avatar || replace)
      ? { ...trip.data.organizer, avatar: url } : null;
    // Phones read the published copy's organiser, so the photo goes there as well
    const snapOrg = trip.data.published_snapshot?.organizer;
    const snapOrganiser = snapOrg?.name && norm(snapOrg.name) === norm(person.name) && (!snapOrg.avatar || replace)
      ? { ...snapOrg, avatar: url } : null;
    if (!travelers && !snapTravelers && !organiser && !snapOrganiser) continue;
    const updates = {};
    if (organiser) { updates.organizer = organiser; trip.data.organizer = organiser; }
    if (snapOrganiser) { updates['published_snapshot.organizer'] = snapOrganiser; trip.data.published_snapshot = { ...trip.data.published_snapshot, organizer: snapOrganiser }; }
    if (travelers) updates.travelers = travelers;
    if (snapTravelers) updates['published_snapshot.travelers'] = snapTravelers;
    batch.update(trip.ref, updates);
    // Phones reload a trip only when its change stamp moves
    batch.set(db.collection('trip_versions').doc(trip.ref.id), { updated_at: FieldValue.serverTimestamp() });
    // Keep the local copy current, so the next person's write carries this one's photo too
    if (travelers) trip.data.travelers = travelers;
    if (snapTravelers) trip.data.published_snapshot = { ...trip.data.published_snapshot, travelers: snapTravelers };
  }
  await batch.commit();
  done += 1;
  console.log(`${done}/${plan.length} ${person.name}`);
}
console.log(`\nAttached ${done} photos.`);
