import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let env;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run with npm run test:security (emulators required)');
  env = await initializeTestEnvironment({
    projectId: 'demo-dalefy-impersonation',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [uid, role] of [['owner', 'owner'], ['agent', 'agent']]) {
      await db.doc(`org_members/${uid}_agency`).set({ user_id: uid, organization_id: 'agency', role });
    }
    // The agent also belongs to another agency the owner has nothing to do with
    await db.doc('org_members/agent_other').set({ user_id: 'agent', organization_id: 'other', role: 'admin' });
    await db.doc('app_config/server_identity').set({ uid: 'server' });
    await db.doc('trips/shared').set({ user_id: 'agent', organization_id: 'agency', status: 'Draft', name: 'Shared', private: false, events: [] });
    await db.doc('trips/secret').set({ user_id: 'agent', organization_id: 'agency', status: 'Draft', name: 'Secret', private: true, events: [] });
    await db.doc('trips/personal').set({ user_id: 'agent', status: 'Draft', name: 'Personal', private: false, events: [] });
    await db.doc('trips/elsewhere').set({ user_id: 'agent', organization_id: 'other', status: 'Draft', name: 'Elsewhere', private: false, events: [] });
    await db.doc('directory_travelers/agency__p1').set({ organization_id: 'agency', user_id: 'agent', traveler: { id: 'p1' } });
    await db.doc('directory_travelers/other__p2').set({ organization_id: 'other', user_id: 'agent', traveler: { id: 'p2' } });
    await db.doc('profiles/agent').set({ name: 'Agent' });
    await db.doc('impersonation_log/log1').set({ organization_id: 'agency', by_uid: 'owner', as_uid: 'agent' });
  });
});
after(async () => { await env?.cleanup(); });

const signedInAs = (uid, untilMs = Date.now() + 3600_000) =>
  env.authenticatedContext(uid, { imp_by: 'owner', imp_org: 'agency', imp_until: untilMs }).firestore();
const db = uid => env.authenticatedContext(uid).firestore();

test('signed in as a teammate: their team trips read and save as usual', async () => {
  const as = signedInAs('agent');
  await assertSucceeds(as.doc('trips/shared').get());
  await assertSucceeds(as.collection('trips').where('organization_id', '==', 'agency').where('private', '==', false).get());
  await assertSucceeds(as.doc('trips/shared').update({ name: 'Edited as agent' }));
  await assertSucceeds(as.doc('trips/new-team-trip').set({ user_id: 'agent', organization_id: 'agency', status: 'Draft', private: false }));
  await assertSucceeds(as.collection('directory_travelers').where('organization_id', '==', 'agency').get());
});

test('signed in as a teammate: their private and personal trips stay hidden', async () => {
  const as = signedInAs('agent');
  await assertFails(as.doc('trips/secret').get());
  await assertFails(as.doc('trips/personal').get());
  await assertFails(as.collection('trips').where('organization_id', '==', 'agency').where('user_id', '==', 'agent').get());
  await assertFails(as.collection('trips').where('user_id', '==', 'agent').get());
  await assertFails(as.doc('trips/secret').update({ name: 'No' }));
  await assertFails(as.doc('trips/shared').update({ private: true }));
  await assertFails(as.doc('trips/new-personal').set({ user_id: 'agent', status: 'Draft' }));
});

test('signed in as a teammate: their other teams are out of reach', async () => {
  const as = signedInAs('agent');
  await assertFails(as.doc('trips/elsewhere').get());
  await assertFails(as.collection('trips').where('organization_id', '==', 'other').where('private', '==', false).get());
  await assertFails(as.collection('directory_travelers').where('organization_id', '==', 'other').get());
  await assertFails(as.doc('org_members/agent_other').delete());
  await assertFails(as.collection('org_members').where('organization_id', '==', 'other').get());
});

test('signed in as a teammate: their profile, presence and invites are left alone', async () => {
  const as = signedInAs('agent');
  await assertSucceeds(as.doc('profiles/agent').get());
  await assertFails(as.doc('profiles/agent').set({ name: 'Renamed' }, { merge: true }));
  await assertFails(as.doc('trip_presence/agent_shared').set({ user_id: 'agent', trip_id: 'shared' }));
});

test('a "Sign in as" session stops working when its hour is up', async () => {
  const as = signedInAs('agent', Date.now() - 1000);
  await assertFails(as.doc('trips/shared').get());
  await assertFails(as.collection('trips').where('organization_id', '==', 'agency').where('private', '==', false).get());
  await assertFails(as.doc('trips/shared').update({ name: 'Too late' }));
});

test('the teammate themselves is unaffected', async () => {
  await assertSucceeds(db('agent').doc('trips/secret').get());
  await assertSucceeds(db('agent').doc('trips/personal').get());
  await assertSucceeds(db('agent').doc('trips/elsewhere').get());
  await assertSucceeds(db('agent').collection('trips').where('organization_id', '==', 'agency').where('user_id', '==', 'agent').get());
  await assertSucceeds(db('agent').doc('profiles/agent').set({ name: 'Agent' }, { merge: true }));
});

test('the log is read by the team admins and written only by the server', async () => {
  await assertSucceeds(db('owner').doc('impersonation_log/log1').get());
  await assertFails(db('agent').doc('impersonation_log/log1').get());
  await assertFails(db('owner').doc('impersonation_log/log2').set({ organization_id: 'agency' }));
  await assertSucceeds(db('server').doc('impersonation_log/log2').set({ organization_id: 'agency' }));
});

test('team activity: members log what they did, admins read it, nobody rewrites it', async () => {
  const entry = { organization_id: 'agency', at: new Date().toISOString(), by_uid: 'agent', by_name: 'Agent', kind: 'team', summary: 'Left the team' };
  await assertSucceeds(db('agent').doc('team_activity/a1').set(entry));
  await assertFails(db('agent').doc('team_activity/a2').set({ ...entry, by_uid: 'owner' }));
  await assertFails(db('outsider').doc('team_activity/a3').set({ ...entry, by_uid: 'outsider' }));
  await assertSucceeds(db('owner').doc('team_activity/a1').get());
  await assertFails(db('agent').doc('team_activity/a1').get());
  await assertFails(db('owner').doc('team_activity/a1').update({ summary: 'Edited' }));
  await assertFails(db('owner').doc('team_activity/a1').delete());
});

test('only the server hands a trip to someone else', async () => {
  await assertFails(db('owner').doc('trips/shared').update({ user_id: 'owner' }));
  await assertSucceeds(db('server').doc('trips/shared').update({ user_id: 'owner' }));
});
