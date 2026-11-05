import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, modules = {}) {
  const exports = {};
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: name => modules[name], Date, Intl });
  return exports;
}
const { publishedChanges } = load('src/lib/tripChanges.ts', {
  '@/lib/timeInput': load('src/lib/timeInput.ts'),
  '@/lib/dates': load('src/lib/dates.ts'),
});

const ev = (id, title, date, time, extra = {}) => ({ id, title, date, time, type: 'activity', ...extra });
const version = (events, info = []) => ({ events, info, start: '2026-11-06', end: '2026-11-12' });
const lines = (a, b) => [...publishedChanges(a, b)];

test('re-uploading the same itinerary, with new ids, is no change at all', () => {
  const before = [ev('a', 'Temple tour', '2026-11-07', '09:00'), ev('b', 'Dinner', '2026-11-07', '19:00', { type: 'dining' })];
  const after = [ev('imp-1', 'Temple tour', '2026-11-07', '9:00 AM'), ev('imp-2', 'Dinner', '2026-11-07', '19:00', { type: 'dining' })];
  assert.deepEqual(lines(version(before), version(after)), []);
});

test('a re-upload only reports what really changed', () => {
  const before = [ev('a', 'Temple tour', '2026-11-07', '09:00'), ev('b', 'Boat trip', '2026-11-08', '10:00'), ev('c', 'Dinner', '2026-11-08', '19:00', { type: 'dining' })];
  const after = [ev('imp-1', 'Temple tour', '2026-11-07', '10:30'), ev('imp-2', 'Dinner', '2026-11-08', '19:00', { type: 'dining' }), ev('imp-3', 'Cooking class', '2026-11-09', '11:00')];
  assert.deepEqual(lines(version(before), version(after)), ['Cooking class added', 'Boat trip removed', 'Temple tour now 10:30, was 09:00']);
});

test('a reworded title on the same day is the same event, and says so', () => {
  const before = [ev('a', 'Arrival & Transfer', '2026-11-06', '14:00', { type: 'transfer' })];
  const after = [ev('imp-1', 'Arrival and Hotel Transfer', '2026-11-06', '14:00', { type: 'transfer' })];
  assert.deepEqual(lines(version(before), version(after)), ['Arrival & Transfer now called Arrival and Hotel Transfer']);
});

test('two events with the same title on the same day pair one to one', () => {
  const before = [ev('a', 'Transfer', '2026-11-06', '09:00'), ev('b', 'Transfer', '2026-11-06', '17:00')];
  const after = [ev('imp-1', 'Transfer', '2026-11-06', '09:00'), ev('imp-2', 'Transfer', '2026-11-06', '17:00'), ev('imp-3', 'Transfer', '2026-11-06', '21:00')];
  assert.equal(lines(version(before), version(after)).filter(l => l === 'Transfer added').length, 1);
  assert.equal(lines(version(before), version(after)).filter(l => l.endsWith('removed')).length, 0);
});

test('a different event at the same time on another day is not paired', () => {
  const before = [ev('a', 'Temple tour', '2026-11-07', '09:00')];
  const after = [ev('imp-1', 'Temple tour', '2026-11-08', '09:00')];
  assert.deepEqual(lines(version(before), version(after)), ['Temple tour added', 'Temple tour removed']);
});

test('edits with the same ids still report as before', () => {
  const before = [ev('a', 'Temple tour', '2026-11-07', '09:00', { location: 'Wat Pho' })];
  const after = [ev('a', 'Temple tour', '2026-11-07', '09:00', { location: 'Wat Arun' })];
  assert.deepEqual(lines(version(before), version(after)), ['Temple tour now at Wat Arun']);
});
