const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const output = mkdtempSync(path.join(tmpdir(), 'dalefy-today-'));
execFileSync(process.execPath, [path.join(root, 'mobile/node_modules/typescript/bin/tsc'), path.join(root, 'mobile/shared/today.ts'), '--outDir', output, '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck'], { cwd: output, stdio: 'pipe' });
const { scheduledMinutes, eventTiming, calendarDays, dayEvents, currentOrNext, selectTodayTrips, visibleTodayEvents } = require(path.join(output, 'today.js'));
after(() => rmSync(output, { recursive: true, force: true }));
const event = (extra = {}) => ({ id: 'event', title: 'Museum', type: 'activity', date: '2026-09-11', time: '10:00', ...extra });
test('unknown and invalid times never become appointments', () => {
  for (const value of ['TBD', '', '25:00', '12:60', '0:30 PM']) assert.equal(scheduledMinutes(value), null);
  assert.equal(scheduledMinutes('12:00 AM'), 0);
  assert.equal(scheduledMinutes('2:30 PM'), 870);
  assert.equal(eventTiming(event({time:'TBD'}), 'UTC', Date.now()).phase, 'unscheduled');
});
test('ongoing event stays current until its end, then becomes earlier', () => {
  const ev = event({endTime:'12:00'});
  assert.equal(eventTiming(ev, 'UTC', Date.parse('2026-09-11T11:00Z')).phase, 'current');
  assert.equal(eventTiming(ev, 'UTC', Date.parse('2026-09-11T12:00Z')).phase, 'earlier');
});
test('flight countdown uses departure timezone', () => {
  const timing = eventTiming(event({type:'flight', depAirport:'LHR'}), 'Asia/Bangkok', Date.parse('2026-09-11T08:30Z'));
  assert.equal(timing.minsUntil, 30);
});
test('overnight event appears on both days', () => {
  const ev = event({time:'23:00', endTime:'01:00'});
  const now = Date.parse('2026-09-12T00:30Z');
  assert.equal(dayEvents([ev], '2026-09-12', 'UTC', now).length, 1);
  assert.equal(eventTiming(ev, 'UTC', now).phase, 'current');
});
test('DST calendar days and nonexistent times stay correct', () => {
  assert.equal(calendarDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(eventTiming(event({date:'2026-03-29', time:'01:30'}), 'Europe/London', Date.now()).start, null);
});
test('current activity takes precedence over hotel stay and later events', () => {
  const events = [event({id:'hotel', type:'hotel', endTime:'23:00'}), event({id:'activity', endTime:'12:00'}), event({id:'later', time:'15:00'})];
  assert.equal(currentOrNext(events, 'UTC', Date.parse('2026-09-11T11:00Z')).event.id, 'activity');
});
test('trip selection changes at destination midnight', () => {
  const trip = {id:'trip', start:'2026-09-12', end:'2026-09-13', destination:'Thailand'};
  assert.equal(selectTodayTrips([trip], Date.parse('2026-09-11T16:59Z')).upcoming?.id, 'trip');
  assert.equal(selectTodayTrips([trip], Date.parse('2026-09-11T17:00Z')).active?.id, 'trip');
  assert.equal(selectTodayTrips([trip], Date.parse('2026-09-13T17:00Z')).past?.id, 'trip');
});
test('traveller sees shared events and their own assignments', () => {
  assert.deepEqual(visibleTodayEvents([event({id:'shared'}), event({id:'mine', assignedTo:['me']}), event({id:'other', assignedTo:['them']})], 'me').map(e => e.id), ['shared', 'mine']);
});
