import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../api/_tripView.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { publishedTripView, membershipMatches, mergeTravelerMedia } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const trip = {
  status: 'Published', user_id: 'owner', budget: 'SECRET_BUDGET', short_code: 'SECRET_CODE',
  events: [{ title: 'SECRET_DRAFT' }],
  info: [{ title: 'SECRET_DRAFT_INFO' }],
  travelers: [{ id: 't', name: 'SECRET_DRAFT_NAME', email: 'private@example.test' }],
  documents: [{ url: 'SECRET_DRAFT_ATTACHMENT' }],
  published_snapshot: {
    name: 'Published trip', start: '2026-09-11', end: '2026-09-12', publishedAt: '2026-09-11T00:00:00Z',
    travelers: [{ id: 't', name: 'Traveler', initials: 'T', email: 'SECRET_EMAIL' }],
    events: [{ id: 'flight', title: 'Published flight', notes: 'SECRET_NOTES', supplier: 'SECRET_SUPPLIER', price: 'SECRET_PRICE', confNumber: 'SECRET_PNR', unknownField: { secret: 'SECRET_FUTURE' } }],
    info: [{ id: 'public', title: 'Meet here', documents: [{ url: 'approved.pdf' }] }, { id: 'leader', title: 'SECRET_LEADER', leaderOnly: true, documents: [{ url: 'SECRET_LEADER_FILE' }] }],
    documents: [{ url: 'approved-voucher.pdf' }],
  },
};

test('public view contains only approved snapshot fields and no private data', () => {
  const result = publishedTripView('trip', trip);
  assert.equal(result.events[0].title, 'Published flight');
  assert.equal(result.documents[0].url, 'approved-voucher.pdf');
  assert.equal(result.travelers[0].name, 'Traveler');
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
  assert.equal('published_snapshot' in result, false);
  assert.equal('user_id' in result, false);
});
test('draft and legacy unsnapshotted records fail closed', () => {
  assert.equal(publishedTripView('trip', { ...trip, status: 'Draft' }), null);
  assert.equal(publishedTripView('trip', { ...trip, published_snapshot: null }), null);
});
test('leader access includes published leader content, never draft fields', () => {
  const result = publishedTripView('trip', trip, true, true);
  assert.equal(result.info[1].title, 'SECRET_LEADER');
  assert.equal(result.events[0].notes, 'SECRET_NOTES');
  assert.equal(JSON.stringify(result).includes('SECRET_DRAFT'), false);
});
test('membership requires both the matching authenticated UID and target trip', () => {
  assert.equal(membershipMatches({ uid: 'other', trip_id: 'trip' }, 'me', 'trip'), false);
  assert.equal(membershipMatches({ uid: 'me', trip_id: 'other' }, 'me', 'trip'), false);
  assert.equal(membershipMatches({ uid: 'me', trip_id: 'trip' }, 'me', 'trip'), true);
});
const url = (uid, id = 'a', target = 'trip') => `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${encodeURIComponent(`trips/${target}/media/${uid}/${id}.jpg`)}?alt=media&token=test`;
const item = (uid, id) => ({ id, type: 'image', name: 'Photo', url: url(uid, id), size: 100 });
test('gallery mutation preserves other users and rejects forged ownership', () => {
  const foreign = item('other', 'a');
  const next = mergeTravelerMedia([foreign], [item('me', 'b')], [], 'me', 'trip', 'test-bucket');
  assert.deepEqual(next[0], foreign);
  assert.equal(next[1].uploaderId, 'me');
  assert.throws(() => mergeTravelerMedia([foreign], [], ['a'], 'me', 'trip', 'test-bucket'));
  assert.throws(() => mergeTravelerMedia([], [item('other', 'a')], [], 'me', 'trip', 'test-bucket'));
  assert.throws(() => mergeTravelerMedia([], [{ ...item('me', 'a'), url: url('me', 'a', 'other-trip') }], [], 'me', 'trip', 'test-bucket'));
});
test('gallery retries cannot alter metadata of an existing upload', () => {
  const original = item('other', 'a');
  assert.deepEqual(mergeTravelerMedia([original], [{ ...original, name: 'Forged' }], [], 'me', 'trip', 'test-bucket'), [original]);
});
test('gallery writes omit arbitrary private fields and allow own deletion', () => {
  const result = mergeTravelerMedia([], [{ ...item('me', 'a'), events: ['malicious'], user_id: 'me' }], [], 'me', 'trip', 'test-bucket');
  assert.equal('events' in result[0], false);
  assert.equal('user_id' in result[0], false);
  assert.deepEqual(mergeTravelerMedia(result, [], ['a'], 'me', 'trip', 'test-bucket'), []);
});

// Exercise the real HTTP handler with isolated database/auth boundaries.
const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const dbModule = moduleUrl(`
  export const getDocument = (...args) => globalThis.__tripHttpTest.get(...args);
  export const queryDocuments = (...args) => globalThis.__tripHttpTest.query(...args);
  export const updateDocument = (...args) => globalThis.__tripHttpTest.update(...args);
  export const decodeValue = v => v;
  export const encodeValue = v => v;
`);
const authModule = moduleUrl(`export const verifyFirebaseToken = async token => token === 'traveler-token' ? { sub: 'traveler' } : null;`);
const limiterModule = moduleUrl(`export const rateLimit = () => true;`);
const handlerSource = readFileSync(new URL('../../api/trip.ts', import.meta.url), 'utf8');
const handlerJs = ts.transpileModule(handlerSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  .replace('./_firebaseAdmin.js', dbModule).replace('./_verifyToken.js', authModule)
  .replace('./_rateLimit.js', limiterModule).replace('./_tripView.js', moduleUrl(output));
const { default: handler } = await import(moduleUrl(handlerJs));

function setupHttp(member = { uid: 'traveler', trip_id: 'trip', role: 'traveler' }) {
  const writes = [];
  globalThis.__tripHttpTest = {
    get: async collection => collection === 'trips' ? { name: 'projects/test/documents/trips/trip', fields: trip, updateTime: 'revision-1' } : { fields: member },
    query: async () => [{ name: 'projects/test/documents/trips/trip', fields: trip, updateTime: 'revision-1' }],
    update: async (...args) => { writes.push(args); },
  };
  process.env.VITE_FIREBASE_STORAGE_BUCKET = 'test-bucket';
  const response = {
    code: 200, headers: {}, data: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(data) { this.data = data; },
  };
  return { writes, response };
}
test('GET shared link and PIN return filtered data with no-store cache headers', async () => {
  for (const query of [{ id: 'trip' }, { code: 'ABC123' }]) {
    const { response, writes } = setupHttp();
    await handler({ method: 'GET', headers: {}, query }, response);
    assert.equal(response.code, 200);
    assert.equal(JSON.stringify(response.data).includes('SECRET'), false);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.deepEqual(writes, []);
  }
});
test('POST refuses unauthenticated or mismatched membership requests', async () => {
  for (const [headers, member] of [[{}, {}], [{ authorization: 'Bearer traveler-token' }, { uid: 'someone-else', trip_id: 'trip' }]]) {
    const { response, writes } = setupHttp(member);
    await handler({ method: 'POST', headers, query: {}, body: { tripId: 'trip', add: [] } }, response);
    assert.equal(response.code, 403);
    assert.deepEqual(writes, []);
  }
});
test('POST gallery uses only media field mask plus source revision', async () => {
  const { response, writes } = setupHttp();
  await handler({ method: 'POST', headers: { authorization: 'Bearer traveler-token' }, query: {}, body: {
    tripId: 'trip', add: [item('traveler', 'photo')], events: ['malicious'], user_id: 'traveler',
  } }, response);
  assert.equal(response.code, 200);
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0][2]), ['media']);
  assert.deepEqual(writes[0][3], ['media']);
  assert.equal(writes[0][4], 'revision-1');
});
test('stale gallery writes return conflict rather than retrying a stale trip', async () => {
  const { response } = setupHttp();
  globalThis.__tripHttpTest.update = async () => { throw new Error('Database conflict'); };
  await handler({ method: 'POST', headers: { authorization: 'Bearer traveler-token' }, query: {}, body: { tripId: 'trip', add: [] } }, response);
  assert.equal(response.code, 409);
});
test('unavailable trip never falls back to private data or accepts gallery changes', async () => {
  const { response, writes } = setupHttp();
  globalThis.__tripHttpTest.get = async () => ({ name: 'trips/trip', fields: { ...trip, status: 'Draft' } });
  await handler({ method: 'GET', headers: {}, query: { id: 'trip' } }, response);
  assert.equal(response.code, 404);
  assert.equal(JSON.stringify(response.data).includes('SECRET'), false);
  assert.deepEqual(writes, []);
});
