import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let env;
const projectId = 'demo-dalefy-security';
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('Run with npm run test:security (emulators required)');
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [uid, role] of [['owner', 'owner'], ['admin', 'admin'], ['agent', 'agent'], ['viewer', 'viewer']]) {
      await db.doc(`org_members/${uid}_agency`).set({ user_id: uid, organization_id: 'agency', role });
    }
    await db.doc('org_members/outsider_other').set({ user_id: 'outsider', organization_id: 'other', role: 'admin' });
    await db.doc('profiles/outsider').set({ current_org_id: 'other' });
    await db.doc('app_config/server_identity').set({ uid: 'server' });
    for (const [id, status] of [['published', 'Published'], ['private', 'Draft']]) {
      await db.doc(`trips/${id}`).set({ user_id: 'owner', organization_id: 'agency', status, name: 'Original', events: [], published_snapshot: { events: [], publishedAt: 'now' } });
    }
    await db.doc('trip_members/traveler_published').set({ uid: 'traveler', device_id: 'device', trip_id: 'published', role: 'traveler' });
    await db.doc('trip_members/leader_published').set({ uid: 'leader', device_id: 'leader-device', trip_id: 'published', role: 'leader' });
    await db.doc('trip_members/traveler_private').set({ uid: 'traveler', device_id: 'device', trip_id: 'private', role: 'traveler' });
    const storage = c.storage();
    for (const path of ['trips/published/voucher.pdf', 'trips/private/secret.pdf', 'trips/published/events/event', 'trips/published/media/traveler/a.jpg']) {
      await storage.ref(path).put(new Uint8Array([1, 2]), { contentType: 'image/jpeg' });
    }
  });
});
after(async () => { await env?.cleanup(); });
const context = uid => uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();

for (const uid of [null, 'outsider', 'traveler', 'leader']) {
  test(`${uid ?? 'public'} cannot read/list working records`, async () => {
    const db = context(uid).firestore();
    await assertFails(db.doc('trips/published').get());
    await assertFails(db.collection('trips').where('status', '==', 'Published').get());
    await assertFails(db.doc('trips/private').get());
  });
  test(`${uid ?? 'public'} cannot change ownership, itinerary or delete trip`, async () => {
    const ref = context(uid).firestore().doc('trips/published');
    await assertFails(ref.update({ user_id: uid ?? 'attacker' }));
    await assertFails(ref.update({ events: [{ title: 'tampered' }] }));
    await assertFails(ref.update({ media: [] }));
    await assertFails(ref.delete());
  });
}
for (const uid of ['owner', 'admin', 'agent', 'viewer']) {
  test(`${uid} retains organization trip reads`, async () => {
    const db = context(uid).firestore();
    await assertSucceeds(db.doc('trips/private').get());
    await assertSucceeds(db.collection('trips').where('organization_id', '==', 'agency').get());
  });
}
test('editors retain writes, but identities are immutable and viewer cannot write', async () => {
  for (const uid of ['owner', 'admin', 'agent']) {
    const ref = context(uid).firestore().doc('trips/published');
    await assertSucceeds(ref.update({ name: 'Edited' }));
    await assertFails(ref.update({ user_id: uid === 'owner' ? 'outsider' : uid }));
    await assertFails(ref.update({ organization_id: 'other' }));
  }
  await assertFails(context('viewer').firestore().doc('trips/published').update({ name: 'No' }));
});
test('creation cannot inject a trip into another agency', async () => {
  await assertFails(context('outsider').firestore().doc('trips/injected').set({ user_id: 'outsider', organization_id: 'agency', status: 'Draft' }));
  await assertSucceeds(context('agent').firestore().doc('trips/created').set({ user_id: 'agent', organization_id: 'agency', status: 'Draft' }));
});
test('server identity is UID-bound, not a spoofable email', async () => {
  await assertSucceeds(context('server').firestore().doc('trips/private').get());
  await assertFails(env.authenticatedContext('attacker', { email: 'cron@dalefy.app' }).firestore().doc('trips/private').get());
  await assertFails(context('outsider').firestore().doc('app_config/server_identity').set({ uid: 'outsider' }));
});
test('valid traveler join works; forged membership and leader creation do not', async () => {
  const db = context('joiner').firestore();
  const data = { uid: 'joiner', device_id: 'new-device', trip_id: 'published', name: 'New', joined_at: 'now' };
  await assertSucceeds(db.doc('trip_members/joiner_published').set(data));
  await assertSucceeds(db.doc('trip_members/new-device_published').set(data));
  await assertFails(db.doc('trip_members/forged_published').set(data));
  await assertFails(db.doc('trip_members/another_published').set({ ...data, uid: 'another', role: 'leader' }));
  await assertFails(db.doc('trip_members/joiner_private').set({ ...data, trip_id: 'private' }));
  await assertFails(db.doc('trips/published').update({ user_id: 'joiner' }));
});
test('members cannot elevate roles or mutate other memberships', async () => {
  const db = context('traveler').firestore();
  await assertSucceeds(db.doc('trip_members/traveler_published').update({ name: 'Updated' }));
  await assertFails(db.doc('trip_members/traveler_published').update({ role: 'leader' }));
  await assertFails(db.doc('trip_members/leader_published').update({ role: 'traveler' }));
  await assertFails(db.doc('trip_members/leader_published').delete());
  await assertFails(context('outsider').firestore().doc('trip_members/leader_published').delete());
  await assertSucceeds(context('admin').firestore().doc('trip_members/leader_published').update({ role: 'leader' }));
});
for (const uid of [null, 'outsider', 'traveler', 'leader', 'viewer']) {
  test(`${uid ?? 'public'} cannot replace/delete protected attachments`, async () => {
    const storage = context(uid).storage();
    for (const path of ['trips/published/voucher.pdf', 'trips/private/secret.pdf', 'trips/published/events/event']) {
      await assertFails(storage.ref(path).put(new Uint8Array([3]), { contentType: 'image/jpeg' }));
      await assertFails(storage.ref(path).delete());
      if (uid !== 'viewer') await assertFails(storage.ref(path).getMetadata());
    }
  });
}
test('staff upload and read attachments; traveler gallery uploads remain scoped', async () => {
  const staff = context('agent').storage();
  await assertSucceeds(staff.ref('trips/published/new.pdf').put(new Uint8Array([1]), { contentType: 'application/pdf' }));
  await assertSucceeds(staff.ref('trips/published/new.pdf').getMetadata());
  await assertSucceeds(staff.ref('trips/published/new.pdf').delete());
  const traveler = context('traveler').storage();
  await assertSucceeds(traveler.ref('trips/published/media/traveler/new.jpg').put(new Uint8Array([1]), { contentType: 'image/jpeg' }));
  await assertSucceeds(traveler.ref('trips/published/media/traveler/new.jpg').delete());
  await assertFails(traveler.ref('trips/published/media/other/new.jpg').put(new Uint8Array([1]), { contentType: 'image/jpeg' }));
  await assertFails(traveler.ref('trips/private/media/traveler/new.jpg').put(new Uint8Array([1]), { contentType: 'image/jpeg' }));
  await assertFails(context('outsider').storage().ref('trips/published/media/outsider/new.jpg').put(new Uint8Array([1]), { contentType: 'image/jpeg' }));
});
