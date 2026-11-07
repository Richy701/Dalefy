import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../api/_tripView.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { publishedTripView, membershipMatches, mergeTravelerMedia, listedAsCoordinator, listedAsTripLeader, oversightView } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
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
const refsTrip = { status: 'Published', published_snapshot: {
  name: 'Refs', publishedAt: '2026-09-11T00:00:00Z',
  travelers: [{ id: 'a', name: 'Amy' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cal' }],
  events: [
    { id: 'group', title: 'Group flight', confNumber: 'SHARED1' },
    { id: 'split', title: 'Split flight', confNumber: 'SHARED2', travelerRefs: { a: 'AMYREF', b: ' BENREF ', c: '  ' } },
    { id: 'private', title: 'Amy only', assignedTo: ['a'], confNumber: 'AMYSHARED', travelerRefs: { a: 'AMYONLY', b: 'NOTONEVENT' } },
    { id: 'none', title: 'No reference' },
  ],
} };
const refsFor = (...args) => Object.fromEntries(publishedTripView('trip', refsTrip, ...args).events.map(e => [e.id, e.confNumber]));
test('a linked traveller gets only their own booking reference, on events they are on', () => {
  assert.deepEqual(refsFor(false, true, 'a'), { group: 'SHARED1', split: 'AMYREF', private: 'AMYONLY', none: undefined });
  assert.deepEqual(refsFor(false, true, 'b'), { group: 'SHARED1', split: 'BENREF', private: undefined, none: undefined });
  // A blank individual reference falls back to the shared one
  assert.deepEqual(refsFor(false, true, 'c'), { group: 'SHARED1', split: 'SHARED2', private: undefined, none: undefined });
  for (const id of ['a', 'b', 'c']) {
    const json = JSON.stringify(publishedTripView('trip', refsTrip, false, true, id));
    assert.equal(json.includes('travelerRefs'), false);
    if (id !== 'a') assert.equal(/AMY/.test(json), false);
    if (id !== 'b') assert.equal(/BENREF|NOTONEVENT/.test(json), false);
  }
});
test('no booking reference without a join and a link to someone on the published list', () => {
  const none = { group: undefined, split: undefined, private: undefined, none: undefined };
  assert.deepEqual(refsFor(), none);
  assert.deepEqual(refsFor(false, false, 'a'), none);
  assert.deepEqual(refsFor(false, true, null), none);
  assert.deepEqual(refsFor(false, true, 'someone-removed'), none);
  assert.deepEqual(refsFor(false, true, { id: 'a' }), none);
});
test('leaders get the shared reference and everyone else\'s, without blanks', () => {
  const events = publishedTripView('trip', refsTrip, true, true, 'a').events;
  const split = events.find(e => e.id === 'split');
  assert.equal(split.confNumber, 'SHARED2');
  assert.deepEqual(split.travelerRefs, { a: 'AMYREF', b: 'BENREF' });
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
  export const touchTripVersion = async () => {};
  export const decodeValue = v => v;
  export const encodeValue = v => v;
`);
const authModule = moduleUrl(`export const verifyFirebaseToken = async token => token === 'traveler-token' ? { sub: 'traveler' } : token === 'coordinator-token' ? { sub: 'emma' } : null;`);
const limiterModule = moduleUrl(`export const rateLimit = () => true;`);
const handlerSource = readFileSync(new URL('../../api/trip.ts', import.meta.url), 'utf8');
const handlerJs = ts.transpileModule(handlerSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  .replace('./_firebaseAdmin.js', dbModule).replace('./_verifyToken.js', authModule)
  .replace('./_rateLimit.js', limiterModule).replace('./_tripView.js', moduleUrl(output));
const accessSource = readFileSync(new URL('../../api/_coordinatorAccess.ts', import.meta.url), 'utf8');
const accessJs = ts.transpileModule(accessSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  .replace('./_firebaseAdmin.js', dbModule).replace('./_tripView.js', moduleUrl(output));
const likesJs = ts.transpileModule(readFileSync(new URL('../../api/_mediaLikes.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  .replace('./_tripView.js', moduleUrl(output));
const { default: handler } = await import(moduleUrl(handlerJs.replace('./_coordinatorAccess.js', moduleUrl(accessJs)).replace('./_mediaLikes.js', moduleUrl(likesJs))));

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


test('missing or nameless organiser is null, never a truthy empty card', () => {
  for (const organizer of [undefined, null, {}, { name: '' }, { name: '   ' }, { company: 'Travel company' }]) {
    const result = publishedTripView('trip', { ...trip, published_snapshot: { ...trip.published_snapshot, organizer } });
    assert.equal(result.organizer, null);
  }
  const result = publishedTripView('trip', { ...trip, published_snapshot: { ...trip.published_snapshot, organizer: { name: 'Alex', secret: 'private' } } });
  assert.deepEqual(result.organizer, { name: 'Alex' });
});

test('coordinators: listed on a shared trip only, and never published to travellers', () => {
  const listed = { ...trip, coordinators: [{ userId: 'emma', name: 'Emma' }] };
  assert.equal(listedAsCoordinator(listed, 'emma'), true);
  assert.equal(listedAsCoordinator(listed, 'tony'), false);
  assert.equal(listedAsCoordinator({ ...listed, private: true }, 'emma'), false);
  assert.equal(listedAsCoordinator({ ...trip }, 'emma'), false);
  for (const view of [publishedTripView('trip', { ...listed, coordinator_ids: ['emma'] }), publishedTripView('trip', { ...listed, coordinator_ids: ['emma'] }, true, true)]) {
    assert.equal(JSON.stringify(view).includes('emma'), false);
    assert.equal(JSON.stringify(view).includes('coordinator'), false);
  }
});

test('oversight: who is in the app and leader phones, never emails', () => {
  const data = {
    published_snapshot: { travelers: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cal' }] },
    travelers: [{ id: 'a', name: 'Ann', email: 'ann@secret.example', phone: '+44 1' }, { id: 'b', name: 'Ben', email: 'ben@secret.example' }, { id: 'c', name: 'Cal' }],
  };
  const members = [
    { linked_traveler_id: 'a', role: 'leader', email: 'ann@secret.example', name: 'Ann' },
    { linked_traveler_id: 'b', role: 'traveler', name: 'Ben', uid: 'secret-uid', device_id: 'secret-device' },
  ];
  const result = oversightView(data, members);
  assert.deepEqual(result, { total: 3, inApp: 2, notInApp: ['Cal'], leaders: [{ name: 'Ann', phone: '+44 1' }] });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

function setupCoordinator({ onTeam = true, tripOverrides = {} } = {}) {
  const fields = { ...trip, organization_id: 'org', coordinators: [{ userId: 'emma', name: 'Emma' }], ...tripOverrides };
  const setup = setupHttp({});
  const previous = globalThis.__tripHttpTest;
  globalThis.__tripHttpTest = {
    ...previous,
    get: async (collection, id) => {
      if (collection === 'trips') return { name: 'projects/test/documents/trips/trip', fields, updateTime: 'revision-1' };
      if (collection === 'org_members') return onTeam && id === 'emma_org' ? { fields: { user_id: 'emma', organization_id: 'org', role: 'agent' } } : null;
      return null;
    },
    query: async () => [],
  };
  return setup;
}
const asCoordinator = { authorization: 'Bearer coordinator-token' };

test('a coordinator on the team sees leader details without joining', async () => {
  const { response } = setupCoordinator();
  await handler({ method: 'GET', headers: asCoordinator, query: { id: 'trip' } }, response);
  assert.equal(response.code, 200);
  assert.equal(response.data.trip.coordinator, true);
  assert.equal(response.data.trip.events[0].notes, 'SECRET_NOTES');
});

test('coordinator access ends when they leave the team, even if still ticked', async () => {
  const { response } = setupCoordinator({ onTeam: false });
  await handler({ method: 'GET', headers: asCoordinator, query: { id: 'trip' } }, response);
  assert.equal(response.data.trip.coordinator, undefined);
  assert.equal(JSON.stringify(response.data).includes('SECRET'), false);
});

test('private trips and people not ticked get no coordinator access', async () => {
  for (const tripOverrides of [{ private: true }, { coordinators: [{ userId: 'tony', name: 'Tony' }] }, { coordinators: [] }, { organization_id: null }]) {
    const { response } = setupCoordinator({ tripOverrides });
    await handler({ method: 'GET', headers: asCoordinator, query: { id: 'trip' } }, response);
    assert.equal(response.data.trip.coordinator, undefined);
    assert.equal(JSON.stringify(response.data).includes('SECRET'), false);
  }
});

test('only a coordinator can read oversight', async () => {
  for (const [headers, code] of [[{}, 403], [{ authorization: 'Bearer traveler-token' }, 403], [asCoordinator, 200]]) {
    const { response } = setupCoordinator();
    await handler({ method: 'GET', headers, query: { id: 'trip', oversight: '1' } }, response);
    assert.equal(response.code, code);
    if (code === 403) assert.equal(response.data.oversight, undefined);
  }
});

test('a coordinator who has not joined cannot change the gallery', async () => {
  const { response, writes } = setupCoordinator();
  await handler({ method: 'POST', headers: asCoordinator, query: {}, body: { tripId: 'trip', add: [], remove: [] } }, response);
  assert.equal(response.code, 403);
  assert.deepEqual(writes, []);
});

test('trip leader tick matches the ticked entry by email only, and stays off the published view', () => {
  const ticked = { ...trip, travelers: [
    { id: 'emma', name: 'Emma', email: 'Emma@Team.test ', tripLeader: true },
    { id: 'tony', name: 'Tony', email: 'tony@team.test' },
  ] };
  assert.equal(listedAsTripLeader(ticked, 'emma@team.test'), true);
  assert.equal(listedAsTripLeader(ticked, 'tony@team.test'), false);
  assert.equal(listedAsTripLeader(ticked, ''), false);
  assert.equal(listedAsTripLeader(ticked, undefined), false);
  assert.equal(listedAsTripLeader(trip, 'emma@team.test'), false);
  const snap = { ...trip.published_snapshot, travelers: [{ id: 'emma', name: 'Emma', email: 'e@team.test', tripLeader: true }] };
  assert.deepEqual(Object.keys(publishedTripView('trip', { ...trip, published_snapshot: snap }).travelers[0]).includes('tripLeader'), false);
});
test('a ticked leader who has joined counts in the coordinator overview', () => {
  const data = { published_snapshot: { travelers: [{ id: 'emma', name: 'Emma' }] }, travelers: [{ id: 'emma', name: 'Emma', phone: '+44 1', tripLeader: true }] };
  assert.deepEqual(oversightView(data, [{ linked_traveler_id: 'emma', role: 'traveler' }]).leaders, [{ name: 'Emma', phone: '+44 1' }]);
});

const seatsTrip = { status: 'Published', published_snapshot: {
  name: 'Seats', publishedAt: '2026-09-11T00:00:00Z',
  travelers: [{ id: 'a', name: 'Amy' }, { id: 'b', name: 'Ben' }],
  events: [
    { id: 'f', title: 'Flight', seatDetails: 'SECRET_GROUP_SEATS', travelerSeats: { a: '14E', b: 'SECRET_SEAT' }, travelerTickets: { a: '157111', b: 'SECRET_TICKET' } },
    { id: 'ben', title: 'Ben only', assignedTo: ['b'], travelerSeats: { a: 'SECRET_NOT_ON_IT' }, travelerTickets: { a: 'SECRET_NOT_ON_IT' } },
  ],
} };
test('a traveller gets only their own seat and ticket', () => {
  const view = publishedTripView('t', seatsTrip, false, true, 'a');
  assert.equal(view.events[0].seatDetails, '14E');
  assert.equal(view.events[0].ticketNumber, '157111');
  assert.equal(JSON.stringify(view).includes('SECRET'), false);
  assert.equal('travelerSeats' in view.events[0], false);
  assert.equal('travelerTickets' in view.events[0], false);
});
test('nobody unlinked or public gets a seat or ticket', () => {
  for (const view of [publishedTripView('t', seatsTrip), publishedTripView('t', seatsTrip, false, true, null), publishedTripView('t', seatsTrip, false, true, 'stranger')]) {
    assert.equal(/SECRET|14E|157111/.test(JSON.stringify(view)), false);
  }
});
test('a leader gets everyone, under their names', () => {
  const view = publishedTripView('t', seatsTrip, true, true, 'a');
  assert.deepEqual(view.events[0].travelerSeats, { a: '14E', b: 'SECRET_SEAT' });
  assert.deepEqual(view.events[0].travelerTickets, { a: '157111', b: 'SECRET_TICKET' });
  assert.equal(view.events[0].seatDetails, '14E');
});

const orgTrip = (published, working) => ({ status: 'Published', organizer: working, published_snapshot: { name: 'T', publishedAt: '2026-09-11T00:00:00Z', events: [], organizer: published } });
test('organiser contact comes from the working copy when blank, only for the same person', () => {
  const blank = orgTrip({ name: 'Laura Davies', email: '' }, { name: 'laura davies', email: 'l@x.test', phone: '+44 1' }).published_snapshot.organizer;
  const view = working => publishedTripView('t', orgTrip(blank, working)).organizer;
  assert.equal(view({ name: 'laura davies', email: 'l@x.test' }).email, 'l@x.test');
  assert.equal(view({ name: 'Laura Davies', phone: ' +44 1 ' }).phone, '+44 1');
  assert.equal(view({ name: 'Tony Marsh', email: 't@x.test', phone: '+44 2' }).email, '');
  assert.equal(view({ name: 'Tony Marsh', email: 't@x.test', phone: '+44 2' }).phone, undefined);
  assert.equal(publishedTripView('t', orgTrip({ name: 'Laura Davies', email: 'old@x.test', phone: '+44 9' }, { name: 'Laura Davies', email: 'new@x.test', phone: '+44 1' })).organizer.phone, '+44 9');
  assert.equal(publishedTripView('t', orgTrip({ name: 'Laura Davies', email: 'old@x.test' }, { name: 'Laura Davies', email: 'new@x.test' })).organizer.email, 'old@x.test');
  assert.equal(publishedTripView('t', orgTrip(null, { name: 'Laura Davies', email: 'l@x.test' })).organizer, null);
  const leaked = JSON.stringify(publishedTripView('t', orgTrip(blank, { name: 'Laura Davies', budget: 'SECRET_BUDGET' })));
  assert.equal(leaked.includes('SECRET'), false);
});

test('app gallery URLs merge and delete with the same account and trip ownership checks', () => {
  const photo = { ...item('me', 'app-photo'), url: url('me', 'member_app-photo') };
  const merged = mergeTravelerMedia([], [photo], [], 'me', 'trip', 'test-bucket');
  assert.equal(merged.length, 1);
  assert.equal(merged[0].uploaderId, 'me');
  assert.throws(() => mergeTravelerMedia([], [photo], [], 'other', 'trip', 'test-bucket'), /belong/);
  assert.throws(() => mergeTravelerMedia([], [photo], [], 'me', 'other-trip', 'test-bucket'), /belong/);
  assert.equal(mergeTravelerMedia(merged, [], ['app-photo'], 'me', 'trip', 'test-bucket').length, 0);
  assert.throws(() => mergeTravelerMedia(merged, [], ['app-photo'], 'other', 'trip', 'test-bucket'), /own uploads/);
});
