import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const viewUrl = url(compile('../../api/_tripView.ts'));
const likesUrl = url(compile('../../api/_mediaLikes.ts').replace('./_tripView.js', viewUrl));
const { applyPhotoLike } = await import(likesUrl);
const { publishedTripView } = await import(viewUrl);
const base = { status: 'Published', name: 'Trip', published_snapshot: { name: 'Trip', publishedAt: '2026-11-06', events: [] }, media: [{ id: 'photo', uploaderId: 'owner', url: 'image', likes: [{ uid: 'other', name: 'Other' }] }, { id: 'untouched' }] };
test('like retries are idempotent and unlike only removes the caller', () => {
  const first = applyPhotoLike(base.media, 'photo', 'me', 'Me', true);
  const retry = applyPhotoLike(first.media, 'photo', 'me', 'Me', true);
  assert.equal(first.added, true); assert.equal(retry.added, false); assert.equal(retry.likes.length, 2);
  const unlike = applyPhotoLike(retry.media, 'photo', 'me', 'Me', false);
  assert.deepEqual(unlike.likes, [{ uid: 'other', name: 'Other' }]);
  assert.equal(unlike.media[1], base.media[1]); assert.equal(base.media[0].likes.length, 1);
});
test('missing photo fails without creating a ghost record', () => {
  assert.throws(() => applyPhotoLike(base.media, 'deleted', 'me', 'Me', true), /Photo not found/);
});
test('likes are member-only and expose only uid and display name', () => {
  const trip = { ...base, media: [{ ...base.media[0], likes: [{ uid: 'me', name: 'Me', email: 'private' }] }] };
  assert.deepEqual(publishedTripView('trip', trip).media, []);
  assert.deepEqual(publishedTripView('trip', trip, false, true).media[0].likes, [{ uid: 'me', name: 'Me' }]);
});
const db = url(`export const getDocument=(...a)=>globalThis.__likes.get(...a); export const updateDocument=(...a)=>globalThis.__likes.update(...a); export const touchTripVersion=async()=>{}; export const decodeValue=v=>v; export const encodeValue=v=>v;`);
const auth = url(`export const verifyFirebaseToken=async t=>t==='valid'?{sub:'me'}:null;`);
const logs = url(`export const logPush=async (...a)=>globalThis.__likes.logs.push(a);`);
const handlerCode = compile('../../api/media-like.ts').replace('./_firebaseAdmin.js', db).replace('./_verifyToken.js', auth).replace('./_rateLimit.js', url('export const rateLimit=()=>true;')).replace('./_tripView.js', viewUrl).replace('./_mediaLikes.js', likesUrl).replace('./_expoPush.js', logs);
const { default: handler } = await import(url(handlerCode));
function setup(member = { uid: 'me', trip_id: 'trip', name: 'Member' }, conflict = false) {
  let trip = structuredClone(base), revision = 1;
  const state = { logs: [], writes: [], get: async collection => collection === 'trip_members' ? { fields: member } : { fields: trip, updateTime: String(revision) }, update: async (_c, _id, fields, mask, expected) => {
    if (conflict) { conflict = false; trip.media[0].likes.push({ uid: 'concurrent', name: 'Concurrent' }); revision++; throw Error('Database conflict'); }
    assert.equal(expected, String(revision)); assert.deepEqual(mask, ['media']);
    trip = { ...trip, ...fields }; revision++; state.writes.push(fields);
  } };
  globalThis.__likes = state;
  return state;
}
async function request(body = {}, token = 'valid') {
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await handler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body: { tripId: 'trip', mediaId: 'photo', liked: true, ...body } }, res);
  return res;
}
test('unauthenticated, outsiders and malformed requests cannot mutate likes', async () => {
  let state = setup(); assert.equal((await request({}, 'bad')).code, 401); assert.equal(state.writes.length, 0);
  state = setup({ uid: 'me', trip_id: 'different' }); assert.equal((await request()).code, 403); assert.equal(state.writes.length, 0);
  setup(); assert.equal((await request({ liked: 'true' })).code, 400);
});
test('concurrent likes survive a revision retry; duplicate like produces no extra notification', async () => {
  const state = setup(undefined, true);
  const res = await request({ uid: 'forged', name: 'Forged' });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.likes.map(like => like.uid), ['other', 'concurrent', 'me']);
  assert.equal(res.body.likes.at(-1).name, 'Member');
  assert.equal(state.logs.length, 1); assert.deepEqual(state.logs[0][0].recipients, ['owner']);
  assert.equal((await request()).body.likes.length, 3); assert.equal(state.logs.length, 1);
  assert.equal((await request({ liked: false })).body.likes.length, 2); assert.equal(state.logs.length, 1);
});
const { notificationPath } = await import(url(compile('../../mobile/services/notificationTarget.ts')));
test('like notification opens the target photo, preserving safe URL encoding', () => {
  assert.equal(notificationPath({ tripId: 'trip & one', mediaId: 'photo/one' }), '/(tabs)/media?tripId=trip%20%26%20one&mediaId=photo%2Fone');
});
test('deleted photos and unpublished trips reject likes without writes or alerts', async () => {
  const state = setup();
  assert.equal((await request({ mediaId: 'missing' })).code, 404);
  assert.equal(state.writes.length, 0); assert.equal(state.logs.length, 0);
  const get = state.get;
  state.get = async (...args) => { const doc = await get(...args); if (args[0] === 'trips') doc.fields = { ...doc.fields, status: 'Draft' }; return doc; };
  assert.equal((await request()).code, 404);
  assert.equal(state.writes.length, 0);
});
