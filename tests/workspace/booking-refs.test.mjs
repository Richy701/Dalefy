import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookableEvents, connectingLegs, flightNumberOf, matchBookingRows, parseBookingTable, parseRefsPaste, suggestTraveller } from '../../src/lib/bookingRefs.ts';

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

const qr = [
  { id: 'out', type: 'flight', title: 'To Doha', flightNum: 'QR10' },
  { id: 'next', type: 'flight', title: 'To Bangkok', flightNum: 'QR 830' },
  { id: 'hotel', type: 'hotel', title: 'Hotel' },
];
const pax = [{ id: 'j', name: 'Jordan Fell' }, { id: 'l', name: 'Laura Davies' }, { id: 's', name: 'Seymour Fernandez' }];
const table = [
  'Passenger Name\tQR Booking Ref\tQR Ticket Numbers\tQR0010\tQR0830',
  '\t\t\t06 Nov LHR-DOH\t06 Nov DOH-BKK',
  'Jordan Fell\t8B9PEC\t1573951755377\t14E\t02E',
  'Laura Davies\t8UNQLY\t1573951755399\t18K\t03A',
  'Seymour Fernandez Rodriguez\t8B9PEC\t1573951755379\t14F\t02F',
].join('\n');

test('a booking table from Excel gives one row per person per flight', () => {
  const rows = parseBookingTable(table);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[1], { passenger: 'Jordan Fell', flight: 'QR0830', bookingRef: '8B9PEC', ticketNumber: '1573951755377', seat: '02E' });
});
test('the old three column paste is not mistaken for a table', () => {
  assert.equal(parseBookingTable('Laura Davies\tQR22\tZK91LM'), null);
  assert.equal(parseBookingTable('Passenger\tFlight\tReference\nLaura Davies\tQR22\tZK91LM'), null);
});
test('rows fill only exact matches, and flight numbers match however they are written', () => {
  const { filled, skipped } = matchBookingRows(parseBookingTable(table), qr, pax);
  assert.deepEqual(filled[2], { eventId: 'out', travellerId: 'l', ref: '8UNQLY', ticket: '1573951755399', seat: '18K' });
  assert.equal(filled.length, 4);
  assert.deepEqual(skipped.map(s => s.problem), ['person', 'person']);
});
test('a name the organiser points at the right person fills in', () => {
  const { filled, skipped } = matchBookingRows(parseBookingTable(table), qr, pax, { 'Seymour Fernandez Rodriguez': 's' });
  assert.equal(skipped.length, 0);
  assert.equal(filled.find(f => f.travellerId === 's' && f.eventId === 'next').seat, '02F');
});
test('accents, hyphens and case are the same person; a different name is not', () => {
  const row = passenger => ({ passenger, flight: 'QR10', bookingRef: 'R', ticketNumber: '', seat: '' });
  const people = [{ id: 'p', name: 'José Pérez-Ruiz' }];
  assert.equal(matchBookingRows([row('JOSE PEREZ RUIZ')], qr, people).filled.length, 1);
  assert.equal(matchBookingRows([row('Jose Perez')], qr, people).filled.length, 0);
});
test('someone not on the flight, an unknown flight and an empty row are never filled', () => {
  const row = (flight, seat = '1A') => ({ passenger: 'Jordan Fell', flight, bookingRef: '', ticketNumber: '', seat });
  const assigned = [{ id: 'x', title: 'X', flightNum: 'QR10', assignedTo: ['l'] }];
  assert.equal(matchBookingRows([row('QR10')], assigned, pax).skipped[0].problem, 'not-on-event');
  assert.equal(matchBookingRows([row('EK1')], qr, pax).skipped[0].problem, 'event');
  assert.deepEqual(matchBookingRows([row('QR10', ' ')], qr, pax), { filled: [], skipped: [] });
});

test('a flight number only in the title still counts, for logos and for matching', () => {
  const titled = { id: 'q', type: 'flight', title: 'QR847 \u2014 Phuket to Doha' };
  assert.equal(flightNumberOf(titled), 'QR847');
  assert.equal(flightNumberOf({ type: 'flight', title: 'Flight to Doha' }), '');
  assert.equal(flightNumberOf({ type: 'transfer', title: 'M25 transfer' }), '');
  assert.equal(flightNumberOf({ type: 'flight', title: 'QR847', flightNum: 'BA1' }), 'BA1');
  assert.equal(flightNumberOf({ type: 'flight', title: 'EK1 to London' }), 'EK1');
  assert.equal(flightNumberOf({ type: 'flight', title: 'IndiGo 6E 123' }), '6E 123');
  assert.equal(flightNumberOf({ type: 'flight', title: 'A380 service QR10' }), 'QR10');
  const row = { passenger: 'Jordan Fell', flight: 'QR0847', bookingRef: 'R', ticketNumber: '', seat: '1A' };
  assert.equal(matchBookingRows([row], [titled], pax).filled[0].eventId, 'q');
});

test('a suggestion needs exactly one traveller with that surname', () => {
  const people = [{ id: 'tony', name: 'Tony Griffiths' }, { id: 'ann', name: 'Ann Lee' }, { id: 'bob', name: 'Bob Lee' }];
  assert.equal(suggestTraveller('Anthony Howard Griffiths', people)?.id, 'tony');
  assert.equal(suggestTraveller('GRIFFITHS/ANTHONY MR', people)?.id, 'tony');
  assert.equal(suggestTraveller('Michael Lee', people), null);
  assert.equal(suggestTraveller('Nobody Known', people), null);
  assert.equal(suggestTraveller('', people), null);
});
