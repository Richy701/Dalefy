import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripPatch } from '../../src/lib/tripSave.ts';

const ev = (id, title, time = '09:00') => ({ id, title, time, date: '2026-11-12' });
const base = { name: 'Barbados', events: [ev('a', 'Flight'), ev('b', 'Hotel'), ev('c', 'Dinner')] };

test('two people editing different events both keep their change', () => {
  const mine = { ...base, events: [ev('a', 'Flight'), ev('b', 'Hotel', '15:00'), ev('c', 'Dinner')] };
  const theirs = { ...base, events: [ev('a', 'Flight'), ev('b', 'Hotel'), ev('c', 'Dinner', '20:00')] };
  const patch = tripPatch(base, mine, theirs);
  assert.deepEqual(patch.events, [ev('a', 'Flight'), ev('b', 'Hotel', '15:00'), ev('c', 'Dinner', '20:00')]);
});

test('an event someone else added is kept, and mine is added too', () => {
  const mine = { ...base, events: [...base.events, ev('d', 'Spa')] };
  const theirs = { ...base, events: [...base.events, ev('e', 'Boat trip')] };
  const ids = tripPatch(base, mine, theirs).events.map(e => e.id);
  assert.deepEqual(ids.sort(), ['a', 'b', 'c', 'd', 'e']);
});

test('deleting an event while someone edits another works', () => {
  const mine = { ...base, events: [ev('a', 'Flight'), ev('c', 'Dinner')] };
  const theirs = { ...base, events: [ev('a', 'Flight', '07:00'), ev('b', 'Hotel'), ev('c', 'Dinner')] };
  assert.deepEqual(tripPatch(base, mine, theirs).events, [ev('a', 'Flight', '07:00'), ev('c', 'Dinner')]);
});

test('editing the same event differently is refused and names the event', () => {
  const mine = { ...base, events: [ev('a', 'Flight'), ev('b', 'Hotel', '15:00'), ev('c', 'Dinner')] };
  const theirs = { ...base, events: [ev('a', 'Flight'), ev('b', 'Hotel', '16:00'), ev('c', 'Dinner')] };
  assert.throws(() => tripPatch(base, mine, theirs), /"Hotel" was changed in another session/);
});

test('editing an event someone else deleted is refused', () => {
  const mine = { ...base, events: [ev('a', 'Flight'), ev('b', 'Hotel', '15:00'), ev('c', 'Dinner')] };
  const theirs = { ...base, events: [ev('a', 'Flight'), ev('c', 'Dinner')] };
  assert.throws(() => tripPatch(base, mine, theirs), /"Hotel" was changed/);
});

test('the same edit made twice is not a clash', () => {
  const both = { ...base, events: [ev('a', 'Flight'), ev('b', 'Hotel', '15:00'), ev('c', 'Dinner')] };
  assert.deepEqual(tripPatch(base, both, both).events, both.events);
});

test('their reorder survives my unrelated edit; my reorder survives theirs', () => {
  const theirsReordered = { ...base, events: [ev('c', 'Dinner'), ev('a', 'Flight'), ev('b', 'Hotel')] };
  const myEdit = { ...base, events: [ev('a', 'Flight', '06:00'), ev('b', 'Hotel'), ev('c', 'Dinner')] };
  assert.deepEqual(tripPatch(base, myEdit, theirsReordered).events.map(e => e.id), ['c', 'a', 'b']);
  const myReorder = { ...base, events: [ev('b', 'Hotel'), ev('c', 'Dinner'), ev('a', 'Flight')] };
  const theirEdit = { ...base, events: [ev('a', 'Flight', '06:00'), ev('b', 'Hotel'), ev('c', 'Dinner')] };
  const merged = tripPatch(base, myReorder, theirEdit).events;
  assert.deepEqual(merged.map(e => e.id), ['b', 'c', 'a']);
  assert.equal(merged[2].time, '06:00');
});

test('travellers merge person by person', () => {
  const p = (id, name, email = '') => ({ id, name, initials: name.slice(0, 2), email });
  const b = { travelers: [p('1', 'Sam'), p('2', 'Alex')] };
  const mine = { travelers: [p('1', 'Sam', 'sam@x.com'), p('2', 'Alex')] };
  const theirs = { travelers: [p('1', 'Sam'), p('2', 'Alex'), p('3', 'Jo')] };
  assert.deepEqual(tripPatch(b, mine, theirs).travelers.map(t => t.id), ['1', '2', '3']);
  assert.equal(tripPatch(b, mine, theirs).travelers[0].email, 'sam@x.com');
});

test('plain fields still refuse a clash, and untouched fields pass through', () => {
  assert.throws(() => tripPatch({ name: 'A' }, { name: 'B' }, { name: 'C' }), /This trip's name was changed/);
  assert.deepEqual(tripPatch({ name: 'A', budget: '1' }, { name: 'A', budget: '2' }, { name: 'Z', budget: '1' }), { budget: '2' });
});
