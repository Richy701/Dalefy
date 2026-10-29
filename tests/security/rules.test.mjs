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
    await db.doc('trips/mine-only').set({ user_id: 'agent', organization_id: 'agency', status: 'Draft', name: 'Private', private: true, events: [] });
    await db.doc('trip_members/traveler_published').set({ uid: 'traveler', device_id: 'device', trip_id: 'published', role: 'traveler' });
    await db.doc('trip_members/leader_published').set({ uid: 'leader', device_id: 'leader-device', trip_id: 'published', role: 'leader' });
    await db.doc('trip_members/traveler_private').set({ uid: 'traveler', device_id: 'device', trip_id: 'private', role: 'traveler' });
    const storage = c.storage();
    for (const path of ['trips/mine-only/voucher.pdf', 'trips/mine-only/events/e1/photo.jpg', 'trips/mine-only/media/agent/a.jpg', 'trips/published/voucher.pdf', 'trips/private/secret.pdf', 'trips/published/events/event', 'trips/published/media/traveler/a.jpg']) {
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
    // Team lists ask for shared trips explicitly, so private trips can never ride along
    await assertSucceeds(db.collection('trips').where('organization_id', '==', 'agency').where('private', '==', false).get());
    await assertFails(db.collection('trips').where('organization_id', '==', 'agency').get());
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
test('app user rosters stay inside the agency that owns the trip', async () => {
  // Nobody outside the trip's staff can list members (names, emails, devices), across trips or for one trip
  for (const uid of [null, 'outsider', 'traveler', 'leader', 'stranger']) {
    const db = context(uid).firestore();
    await assertFails(db.collection('trip_members').get());
    await assertFails(db.collection('trip_members').where('trip_id', '==', 'published').get());
    await assertFails(db.collection('trip_members').where('device_id', '==', 'device').get());
  }
  await assertFails(context('traveler').firestore().doc('trip_members/leader_published').get());
  // A member still reads their own record, by id and by their uid
  const traveler = context('traveler').firestore();
  await assertSucceeds(traveler.doc('trip_members/traveler_published').get());
  await assertSucceeds(traveler.collection('trip_members').where('uid', '==', 'traveler').get());
  // The trip's own staff read its roster by trip, including viewers; the server reads for notifications
  for (const uid of ['owner', 'admin', 'agent', 'viewer']) {
    await assertSucceeds(context(uid).firestore().collection('trip_members').where('trip_id', '==', 'published').get());
  }
  await assertSucceeds(context('server').firestore().collection('trip_members').where('trip_id', '==', 'published').get());
});
test('the traveller directory and compliance belong to one organisation', async () => {
  const rec = (org, uid) => ({ organization_id: org, user_id: uid, traveler: { id: 't1', name: 'Tony' }, updated_at: 'now' });
  const comp = (org, uid) => ({ organization_id: org, user_id: uid, traveler_id: 't1', docs: [{ name: 'Passport', status: 'Signed' }], updated_at: 'now' });
  // Editors write their organisation's directory; viewers, outsiders and travellers can't
  await assertSucceeds(context('agent').firestore().doc('directory_travelers/agency__t1').set(rec('agency', 'agent')));
  await assertSucceeds(context('admin').firestore().doc('traveler_compliance/agency__t1').set(comp('agency', 'admin')));
  for (const uid of ['viewer', 'outsider', 'traveler']) {
    await assertFails(context(uid).firestore().doc('directory_travelers/agency__t2').set(rec('agency', uid)));
  }
  // Nobody plants a record under another organisation's ID, or moves one between organisations
  await assertFails(context('outsider').firestore().doc('directory_travelers/agency__t3').set(rec('other', 'outsider')));
  await assertFails(context('outsider').firestore().doc('directory_travelers/agency__t1').set(rec('other', 'outsider')));
  // Everyone in the organisation reads it, by organisation; nobody else does
  for (const uid of ['owner', 'admin', 'agent', 'viewer']) {
    await assertSucceeds(context(uid).firestore().collection('directory_travelers').where('organization_id', '==', 'agency').get());
    await assertSucceeds(context(uid).firestore().collection('traveler_compliance').where('organization_id', '==', 'agency').get());
  }
  for (const uid of [null, 'outsider', 'traveler']) {
    await assertFails(context(uid).firestore().collection('directory_travelers').where('organization_id', '==', 'agency').get());
    await assertFails(context(uid).firestore().collection('traveler_compliance').get());
  }
  // Without an organisation, a user's directory is theirs alone
  await assertSucceeds(context('solo').firestore().doc('directory_travelers/u-solo__t1').set(rec(null, 'solo')));
  await assertFails(context('outsider').firestore().doc('directory_travelers/u-solo__t9').set(rec(null, 'solo')));
  await assertSucceeds(context('solo').firestore().collection('directory_travelers').where('organization_id', '==', null).where('user_id', '==', 'solo').get());
  await assertFails(context('outsider').firestore().collection('directory_travelers').where('organization_id', '==', null).where('user_id', '==', 'solo').get());
  await assertFails(context('viewer').firestore().doc('directory_travelers/agency__t1').delete());
  await assertSucceeds(context('agent').firestore().doc('directory_travelers/agency__t1').delete());
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

test('push log: trip staff read it per trip, travellers and outsiders cannot, only the server writes', async () => {
  await env.withSecurityRulesDisabled(async c => {
    await c.firestore().doc('push_log/1-abc').set({ trip_id: 'published', trip_name: 'Original', category: 'message', title: 'Hi', body: 'There', recipients: ['traveler', 'device'], sent_by: 'owner', sent_at: '2026-01-01T00:00:00.000Z', sent: 1, failed: 0 });
  });
  const byTrip = db => db.collection('push_log').where('trip_id', '==', 'published').get();
  await assertSucceeds(byTrip(context('owner').firestore()));
  await assertSucceeds(byTrip(context('agent').firestore()));
  await assertFails(byTrip(context('traveler').firestore()));
  await assertFails(byTrip(context('outsider').firestore()));
  await assertFails(context('owner').firestore().collection('push_log').get());
  await assertFails(context('owner').firestore().doc('push_log/2-forged').set({ trip_id: 'published', title: 'x', body: 'y', recipients: [], sent_at: 'now' }));
  await assertSucceeds(context('server').firestore().doc('push_log/3-server').set({ trip_id: 'published', title: 'x', body: 'y', recipients: [], sent_at: 'now' }));
});

test('push log: travellers read what was sent to their own account, as their inbox, and nobody else\'s', async () => {
  await env.withSecurityRulesDisabled(async c => {
    await c.firestore().doc('push_log/4-inbox').set({ trip_id: 'published', trip_name: 'Original', category: 'message', title: 'Hi', body: 'There', recipients: ['traveler', 'device'], sent_by: 'owner', sent_at: '2026-01-01T00:00:00.000Z', sent: 1, failed: 0 });
  });
  const inbox = (db, uid) => db.collection('push_log').where('recipients', 'array-contains', uid).get();
  await assertSucceeds(inbox(context('traveler').firestore(), 'traveler'));
  await assertFails(inbox(context('outsider').firestore(), 'traveler'));
  await assertSucceeds(context('traveler').firestore().doc('push_log/4-inbox').get());
  await assertFails(context('outsider').firestore().doc('push_log/4-inbox').get());
});

test('travellers stamp when they last opened the app, and nothing else that way', async () => {
  const mine = context('traveler').firestore().doc('trip_members/traveler_published');
  await assertSucceeds(mine.set({ last_seen_at: '2026-01-02T00:00:00.000Z', platform: 'ios' }, { merge: true }));
  await assertFails(mine.set({ last_seen_at: '2026-01-02T00:00:00.000Z', role: 'leader' }, { merge: true }));
  await assertFails(context('leader').firestore().doc('trip_members/traveler_published').set({ last_seen_at: 'x' }, { merge: true }));
});

test('a private trip\'s files are its creator\'s alone; shared trip files stay team-wide', async () => {
  const storage = uid => context(uid).storage();
  for (const path of ['trips/mine-only/voucher.pdf', 'trips/mine-only/events/e1/photo.jpg', 'trips/mine-only/media/agent/a.jpg']) {
    await assertSucceeds(storage('agent').ref(path).getMetadata());
    for (const uid of ['owner', 'admin', 'viewer']) await assertFails(storage(uid).ref(path).getMetadata());
  }
  for (const uid of ['owner', 'admin']) {
    await assertFails(storage(uid).ref('trips/mine-only/new.pdf').put(new Uint8Array([1]), { contentType: 'application/pdf' }));
    await assertFails(storage(uid).ref('trips/mine-only/voucher.pdf').delete());
  }
  await assertSucceeds(storage('agent').ref('trips/mine-only/new.pdf').put(new Uint8Array([1]), { contentType: 'application/pdf' }));
  for (const uid of ['owner', 'admin', 'agent', 'viewer']) await assertSucceeds(storage(uid).ref('trips/published/voucher.pdf').getMetadata());
});
