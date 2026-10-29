import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let env;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run with npm run test:security (emulators required)');
  env = await initializeTestEnvironment({
    projectId: 'demo-dalefy-private-trips',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [uid, role] of [['owner', 'owner'], ['admin', 'admin'], ['agent', 'agent'], ['agent2', 'agent'], ['viewer', 'viewer']]) {
      await db.doc(`org_members/${uid}_agency`).set({ user_id: uid, organization_id: 'agency', role });
    }
    await db.doc('trips/secret').set({ user_id: 'agent', organization_id: 'agency', status: 'Draft', name: 'Secret', private: true, events: [] });
    await db.doc('trips/shared').set({ user_id: 'agent', organization_id: 'agency', status: 'Draft', name: 'Shared', private: false, events: [] });
    await db.doc('trips/legacy').set({ user_id: 'agent2', organization_id: 'agency', status: 'Draft', name: 'Legacy', events: [] });
    await db.doc('trip_members/t_secret').set({ uid: 'traveler', device_id: 'd', trip_id: 'secret', role: 'traveler' });
  });
});
after(async () => { await env?.cleanup(); });
const db = uid => env.authenticatedContext(uid).firestore();

test('only the creator reads a private trip, not even owners or admins', async () => {
  await assertSucceeds(db('agent').doc('trips/secret').get());
  for (const uid of ['owner', 'admin', 'agent2', 'viewer']) await assertFails(db(uid).doc('trips/secret').get());
});

test('shared and older trips without the flag stay readable by the whole team', async () => {
  for (const uid of ['agent2', 'viewer']) {
    await assertSucceeds(db(uid).doc('trips/shared').get());
    await assertSucceeds(db(uid).doc('trips/legacy').get());
  }
});

test('teammates list shared trips plus their own; a whole-team query is refused for them', async () => {
  await assertSucceeds(db('agent2').collection('trips').where('organization_id', '==', 'agency').where('private', '==', false).get());
  await assertSucceeds(db('agent2').collection('trips').where('organization_id', '==', 'agency').where('user_id', '==', 'agent2').get());
  await assertSucceeds(db('agent').collection('trips').where('organization_id', '==', 'agency').where('user_id', '==', 'agent').get());
  await assertFails(db('agent2').collection('trips').where('organization_id', '==', 'agency').get());
  await assertFails(db('admin').collection('trips').where('organization_id', '==', 'agency').get());
  await assertSucceeds(db('admin').collection('trips').where('organization_id', '==', 'agency').where('private', '==', false).get());
});

test('only the creator edits a private trip or flips the switch', async () => {
  await assertSucceeds(db('agent').doc('trips/secret').update({ name: 'Mine' }));
  for (const uid of ['admin', 'owner', 'agent2']) await assertFails(db(uid).doc('trips/secret').update({ name: 'Nope' }));
  await assertFails(db('agent2').doc('trips/shared').update({ private: true }));
  await assertFails(db('admin').doc('trips/shared').update({ private: true }));
  await assertSucceeds(db('agent2').doc('trips/shared').update({ name: 'Team edit' }));
  await assertSucceeds(db('agent').doc('trips/shared').update({ private: true }));
  await assertSucceeds(db('agent').doc('trips/shared').update({ private: false }));
});

test('admins can stamp older trips as shared', async () => {
  await assertSucceeds(db('admin').doc('trips/legacy').update({ private: false }));
});

test('a private trip roster is hidden from other teammates', async () => {
  await assertSucceeds(db('agent').collection('trip_members').where('trip_id', '==', 'secret').get());
  await assertFails(db('agent2').collection('trip_members').where('trip_id', '==', 'secret').get());
});

