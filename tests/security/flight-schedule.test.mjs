import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const load = async (file, replace = s => s) => {
  const source = replace(readFileSync(new URL(`../../api/${file}`, import.meta.url), 'utf8'));
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
};
const { isDue, isFarOut, arrivalMs, scheduleDifference } = await load('_flightSchedule.ts', s => s.replace(/import \{ airportTz \} from "\.\/_airportTz\.js";/, 'const airportTz = () => null;'));
const { readAllowance, allowanceLevel, shouldWarn, isAllowanceRefusal } = await load('_flightAllowance.ts');

const dep = Date.UTC(2026, 10, 6, 8, 35);
const flight = (extra = {}) => ({ date: '2026-11-06', time: '08:35', endTime: '15:35', depTz: 'UTC', arrTz: 'UTC', ...extra });
const runs = (ev, fromH, toH) => {
  const hits = [];
  for (let t = Math.floor((dep + fromH * 36e5) / 9e5) * 9e5; t < dep + toH * 36e5; t += 9e5) if (isDue(ev, new Date(t))) hits.push(t);
  return hits;
};

test('nothing is looked up more than 7 days out', () => assert.equal(runs(flight(), -24 * 12, -24 * 7 - 1).length, 0));
test('days out it is checked once a day, at 06:00 UTC', () => {
  const hits = runs(flight(), -24 * 7, -24);
  assert.equal(hits.length, 6);
  for (const t of hits) assert.equal(new Date(t).getUTCHours(), 6);
});
test('the last day is hourly, then every run from 3 hours out', () => {
  assert.equal(runs(flight(), -24, -3).length, 21);
  assert.equal(runs(flight(), -3, 1).length, 16);
});
test('every run around expected landing, hourly before that', () => {
  const air = runs(flight(), 1.25, 6);
  assert.equal(air.length, 5);
  assert.equal(runs(flight(), 6, 7.5).length, 6);
});
test('a late estimate moves the landing checks', () => assert.equal(runs(flight({ revisedEndTime: '17:35' }), 8, 9.5).length, 6));
test('no arrival details falls back to hourly', () => assert.equal(runs(flight({ endTime: undefined, arrTz: undefined }), 6, 7.5).length, 2));
test('belts are checked for 75 minutes after landing, and not once posted', () => {
  const at = new Date(dep + 7 * 36e5);
  const arrived = flight({ status: 'Arrived', arrivedAt: at.toISOString() });
  assert.equal(isDue(arrived, new Date(at.getTime() + 75 * 6e4)), true);
  assert.equal(isDue(arrived, new Date(at.getTime() + 90 * 6e4)), false);
  assert.equal(isDue({ ...arrived, baggageBelt: '5' }, new Date(at.getTime() + 15 * 6e4)), false);
});
test('cancelled flights are never looked up', () => assert.equal(runs(flight({ status: 'Canceled' }), -48, 8).length, 0));
test('an overnight arrival with no date lands the next day', () => {
  const ev = flight({ time: '22:00', endTime: '06:00' });
  const d = Date.UTC(2026, 10, 6, 22, 0);
  assert.equal(arrivalMs(ev, d), Date.UTC(2026, 10, 7, 6, 0));
});
test('only flights over a day away count as far out', () => {
  assert.equal(isFarOut(flight(), new Date(dep - 25 * 36e5)), true);
  assert.equal(isFarOut(flight(), new Date(dep - 23 * 36e5)), false);
});
test('schedule differences: time, cancellation, once only, and never another leg', () => {
  const saved = { time: '08:35', endTime: '15:35', depAirport: 'LHR', arrAirport: 'DOH' };
  assert.equal(scheduleDifference(saved, { departTime: '8:35 AM', arriveTime: '15:35', depAirport: 'LHR', arrAirport: 'DOH' }), null);
  const moved = scheduleDifference(saved, { departTime: '09:10', arriveTime: '15:35', depAirport: 'LHR', arrAirport: 'DOH' });
  assert.deepEqual(moved.lines, ['Departure: saved as 08:35, now 09:10']);
  assert.equal(scheduleDifference({ ...saved, scheduleNotified: moved.key }, { departTime: '09:10', arriveTime: '15:35' }), null);
  assert.equal(scheduleDifference(saved, { departTime: '12:00', depAirport: 'DOH', arrAirport: 'BKK' }), null);
  assert.deepEqual(scheduleDifference(saved, { status: 'Canceled' }).lines, ['The flight now shows as cancelled']);
});

const headers = o => ({ get: n => o[n] ?? null });
const a = (remaining, limit = 5000) => ({ limit, remaining, resetsInSeconds: 100 });
test('allowance is read from the response headers', () => {
  assert.deepEqual(readAllowance(headers({ 'x-ratelimit-api-units-limit': '5000', 'x-ratelimit-api-units-remaining': '4990', 'x-ratelimit-api-units-reset': '2591848' })), { limit: 5000, remaining: 4990, resetsInSeconds: 2591848 });
  assert.equal(readAllowance(headers({})), null);
});
test('warning levels', () => {
  assert.equal(allowanceLevel(a(1001)), null);
  assert.equal(allowanceLevel(a(1000)), 'low');
  assert.equal(allowanceLevel(a(250)), 'very-low');
  assert.equal(allowanceLevel(a(0)), 'exhausted');
  assert.equal(allowanceLevel(null, true), 'exhausted');
  assert.equal(allowanceLevel(null), null);
  assert.equal(isAllowanceRefusal(429), true);
  assert.equal(isAllowanceRefusal(200), false);
});
test('each level warns once per billing period', () => {
  assert.equal(shouldWarn('low', {}, 'p1'), true);
  assert.equal(shouldWarn('low', { level: 'low', period: 'p1' }, 'p1'), false);
  assert.equal(shouldWarn('very-low', { level: 'low', period: 'p1' }, 'p1'), true);
  assert.equal(shouldWarn('low', { level: 'exhausted', period: 'p1' }, 'p1'), false);
  assert.equal(shouldWarn('low', { level: 'exhausted', period: 'p1' }, 'p2'), true);
  assert.equal(shouldWarn(null, {}, 'p1'), false);
});
