import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let env;
const projectId = 'demo-dalefy-security';
const item = { organization_id: 'agency', title: 'Travel insurance', body: 'Policy details', documents: [], automatic: true };

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [uid, role] of [['owner', 'owner'], ['admin', 'admin'], ['agent', 'agent'], ['viewer', 'viewer']]) {
      await db.doc(`org_members/${uid}_agency`).set({ user_id: uid, organization_id: 'agency', role });
    }
    await db.doc('org_members/outsider_other').set({ user_id: 'outsider', organization_id: 'other', role: 'admin' });
    await db.doc('profiles/outsider').set({ current_org_id: 'other' });
    await db.doc('org_saved_info/existing').set(item);
  });
});
after(async () => { await env?.cleanup(); });
const context = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext());
const file = new Uint8Array([1, 2]);

for (const uid of ['owner', 'admin', 'agent', 'viewer']) {
  test(`${uid} can read and list the team's saved info`, async () => {
    const db = context(uid).firestore();
    await assertSucceeds(db.doc('org_saved_info/existing').get());
    await assertSucceeds(db.collection('org_saved_info').where('organization_id', '==', 'agency').get());
  });
}

for (const uid of ['owner', 'admin', 'agent']) {
  test(`${uid} can add, change and remove saved info and upload its forms`, async () => {
    const c = context(uid);
    const ref = c.firestore().doc(`org_saved_info/made-by-${uid}`);
    await assertSucceeds(ref.set(item));
    await assertSucceeds(ref.set({ ...item, title: 'Changed' }));
    await assertSucceeds(ref.delete());
    await assertSucceeds(c.storage().ref(`saved-info/agency/${uid}/form.pdf`).put(file, { contentType: 'application/pdf' }));
  });
}

test('saved info cannot be moved to another team', async () => {
  await assertFails(context('owner').firestore().doc('org_saved_info/existing').set({ ...item, organization_id: 'other' }));
});

for (const uid of ['viewer', 'outsider', null]) {
  test(`${uid ?? 'public'} cannot change saved info or upload forms`, async () => {
    const c = context(uid);
    const db = c.firestore();
    await assertFails(db.doc('org_saved_info/new-one').set(item));
    await assertFails(db.doc('org_saved_info/existing').set({ ...item, title: 'Hacked' }));
    await assertFails(db.doc('org_saved_info/existing').delete());
    await assertFails(c.storage().ref(`saved-info/agency/${uid ?? 'public'}/form.pdf`).put(file, { contentType: 'application/pdf' }));
  });
}

for (const uid of ['outsider', 'traveler', null]) {
  test(`${uid ?? 'public'} cannot read saved info`, async () => {
    const db = context(uid).firestore();
    await assertFails(db.doc('org_saved_info/existing').get());
    await assertFails(db.collection('org_saved_info').where('organization_id', '==', 'agency').get());
  });
}

test("nobody can upload a form into a teammate's folder", async () => {
  await assertFails(context('agent').storage().ref('saved-info/agency/owner/form.pdf').put(file, { contentType: 'application/pdf' }));
});
