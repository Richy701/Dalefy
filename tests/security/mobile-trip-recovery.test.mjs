import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../mobile/services/firebaseTrips.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function service({ api = false, uid = 'account', response, queryError = false } = {}) {
  const calls = [];
  const row = id => ({ data: () => ({ trip_id: id }) });
  const currentUser = uid ? { uid, getIdToken: async () => 'test-token' } : null;
  const firestore = {
    collection: (_db, name) => name,
    doc: (_db, collection, id) => ({ collection, id }),
    where: (field, _op, value) => ({ field, value }),
    query: (collection, filter) => ({ collection, filter }),
    getDocs: async q => {
      if (queryError) throw new Error('Network unavailable');
      calls.push(q.filter.field);
      return { docs: q.filter.field === 'uid' ? [row('shared'), row('account-only')] : [row('shared'), row('device-only')] };
    },
    getDoc: async ({ id }) => ({ id, exists: () => true, data: () => ({
      name: 'Unpublished edit', start: '2026-01-01', end_date: '2026-01-02', status: 'Published',
      budget: 'private', events: [{ title: 'Draft event' }], travelers: [{ id: 'person', name: 'Person', initials: 'P', email: 'private@example.test' }],
      published_snapshot: { name: id, start: '2026-01-01', end: '2026-01-02', events: [{ title: 'Published event' }], documents: [{ id: 'approved' }] },
    }) }),
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: name => {
      if (name === 'firebase/firestore') return firestore;
      if (name === './firebase') return { firebaseDb: () => ({}), firebaseAuth: () => ({ currentUser }), waitForAuth: async () => {} };
      if (name === './deviceId') return { getDeviceId: async () => 'device' };
      if (name === 'firebase/auth') return {};
      throw Error(name);
    },
    process: { env: api === null ? {} : { EXPO_PUBLIC_TRIP_API_ENABLED: String(api) } },
    fetch: async () => { if (api === false) throw Error('Undeployed API must not be called'); return response; },
    setTimeout, clearTimeout, AbortController, console,
  });
  return { service: exports, calls };
}

test('current deployment restores account and legacy device trips without duplicates', async () => {
  const { service: trips, calls } = service();
  const result = await trips.fetchTrips();
  assert.deepEqual(Array.from(result, trip => trip.id).sort(), ['account-only', 'device-only', 'shared']);
  assert.deepEqual(calls, ['uid', 'device_id']);
  assert.equal(result[0].events[0].title, 'Published event');
  assert.equal(result[0].documents[0].id, 'approved');
  assert.equal(result[0].budget, undefined);
  assert.equal(result[0].travelers[0].email, undefined);
  assert.equal(result[0].publishedSnapshot, undefined);
});
test('auth still restoring must not report an authoritative empty list', async () => {
  await assert.rejects(service({ uid: null }).service.fetchTrips(), /Waiting for sign-in/);
});
test('failed membership requests remain errors so the cached trips survive', async () => {
  await assert.rejects(service({ queryError: true }).service.fetchTrips(), /Network unavailable/);
});
test('missing API deployment cannot turn existing memberships into zero trips', async () => {
  const response = { status: 404, ok: false, json: async () => { throw Error('HTML deployment 404'); } };
  await assert.rejects(service({ api: true, response }).service.fetchTrips(), /not deployed/);
});
test('deployed API can authoritatively report an unavailable trip', async () => {
  const response = { status: 404, ok: false, json: async () => ({ error: 'Itinerary unavailable' }) };
  assert.equal(await service({ api: true, response }).service.fetchTripById('removed'), null);
});
test('API rollout uses authenticated account membership only', async () => {
  const response = { status: 200, ok: true, json: async () => ({ trip: { name: 'Published', start: '2026-01-01' } }) };
  const { service: trips, calls } = service({ api: true, response });
  assert.equal((await trips.fetchTrips()).length, 2);
  assert.deepEqual(calls, ['uid']);
});

test('production defaults to the filtered API without an environment flag', async () => {
  const response = { status: 200, ok: true, json: async () => ({ trip: { name: 'Published', start: '2026-01-01' } }) };
  const { service: trips, calls } = service({ api: null, response });
  assert.equal((await trips.fetchTrips()).length, 2);
  assert.deepEqual(calls, ['uid']);
});
