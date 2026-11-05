import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookableEvents, connectingLegs, parseRefsPaste } from '../../src/lib/bookingRefs.ts';

const flight = (id, date, depAirport, arrAirport, extra = {}) => ({ id, type: 'flight', date, depAirport, arrAirport, ...extra });
const ids = list => list.map(item => item.id);

test('the list shows flights and hotels, and anything else only if it already has a reference', () => {
  const events = [
    { id: 'f', type: 'flight' }, { id: 'h', type: 'hotel' }, { id: 'lunch', type: 'dining' },
    { id: 'shared', type: 'transfer', confNumber: 'T1' }, { id: 'own', type: 'activity', travelerRefs: { a: 'A1' } },
    { id: 'blank', type: 'activity', travelerRefs: { a: '  ' } },
  ];
  assert.deepEqual(ids(bookableEvents(events)), ['f', 'h', 'shared', 'own']);
});

test('connecting flights are found from any leg, overnight included', () => {
  const route = [flight('a', '2026-06-03', 'MAN', 'DOH'), flight('b', '2026-06-04', 'DOH', 'BKK'), flight('home', '2026-06-12', 'BKK', 'MAN')];
  assert.deepEqual(ids(connectingLegs(route, 'a')), ['b']);
  assert.deepEqual(ids(connectingLegs(route, 'b')), ['a']);
  assert.deepEqual(ids(connectingLegs(route, 'home')), []);
  assert.deepEqual(ids(connectingLegs(route, 'missing')), []);
});

test('a three leg journey is one connection', () => {
  const route = [flight('a', '2026-06-03', 'MAN', 'AMS'), flight('b', '2026-06-03', 'AMS', 'DOH'), flight('c', '2026-06-04', 'DOH', 'BKK')];
  assert.deepEqual(ids(connectingLegs(route, 'b')), ['a', 'c']);
});

test('different airports, or the flight back the next day, are not a connection', () => {
  assert.deepEqual(ids(connectingLegs([flight('a', '2026-06-03', 'MAN', 'DOH'), flight('b', '2026-06-03', 'DXB', 'BKK')], 'a')), []);
  assert.deepEqual(ids(connectingLegs([flight('a', '2026-06-03', 'MAN', 'DUB'), flight('b', '2026-06-04', 'DUB', 'MAN')], 'a')), []);
});

test('a late arrival counts from the day it lands, and unknown airports go by date', () => {
  assert.deepEqual(ids(connectingLegs([flight('a', '2026-06-03', 'MAN', 'DOH', { endDate: '2026-06-04' }), flight('b', '2026-06-05', 'DOH', 'BKK')], 'a')), ['b']);
  assert.deepEqual(ids(connectingLegs([flight('a', '2026-06-03'), flight('b', '2026-06-04')], 'a')), ['b']);
});

const travellers = [{ id: 'laura', name: 'Laura Davies' }, { id: 'tom', name: 'Tom Reid' }, { id: 'sam1', name: 'Sam Lee' }, { id: 'sam2', name: 'Sam Lee' }];
const events = [
  { id: 'qr', title: 'Manchester to Doha', flightNum: 'QR 022', assignedTo: ['laura'] },
  { id: 'ek', title: 'London to Dubai', flightNum: 'EK18', assignedTo: ['tom'] },
  { id: 'hotel', title: 'Hilton Bangkok' },
  { id: 'daily1', title: 'Shuttle out', flightNum: 'BA1' },
  { id: 'daily2', title: 'Shuttle back', flightNum: 'BA1' },
];

test('pasted rows fill exact matches, however the flight number is written', () => {
  const { filled, skipped } = parseRefsPaste('laura  davies\tQR22\tZK91LM\nTom Reid\tek-18\tQR7X2P\r\nTom Reid\thilton bangkok\t88214\n', events, travellers);
  assert.deepEqual(filled, [
    { eventId: 'qr', travellerId: 'laura', ref: 'ZK91LM' },
    { eventId: 'ek', travellerId: 'tom', ref: 'QR7X2P' },
    { eventId: 'hotel', travellerId: 'tom', ref: '88214' },
  ]);
  assert.deepEqual(skipped, []);
});

test('nothing is guessed: every doubtful row is reported, not filled', () => {
  const { filled, skipped } = parseRefsPaste([
    'Laura D\tQR22\tAAA', 'Laura Davies\tXX9\tBBB', 'Tom Reid\tQR22\tCCC',
    'Sam Lee\tHilton Bangkok\tDDD', 'Tom Reid\tBA1\tEEE', 'Tom Reid\tQR22', 'Tom Reid\tEK18\t ',
  ].join('\n'), events, travellers);
  assert.deepEqual(filled, []);
  assert.deepEqual(skipped.map(s => s.problem), ['person', 'event', 'not-on-event', 'ambiguous', 'ambiguous', 'format', 'format']);
});

test('a header row is ignored, a first row of real data is not', () => {
  assert.deepEqual(parseRefsPaste('Name\tFlight\tPNR\nTom Reid\tEK18\tR1', events, travellers), { filled: [{ eventId: 'ek', travellerId: 'tom', ref: 'R1' }], skipped: [] });
  assert.equal(parseRefsPaste('Tom Reid\tEK18\tREF1', events, travellers).filled.length, 1);
});
