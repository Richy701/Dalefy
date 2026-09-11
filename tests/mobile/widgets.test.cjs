const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const output = mkdtempSync(path.join(tmpdir(), 'dalefy-widgets-'));
execFileSync(process.execPath, [path.join(root, 'mobile/node_modules/typescript/bin/tsc'), path.join(root, 'mobile/shared/widgetSchedule.ts'), '--outDir', output, '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck'], { cwd: output, stdio: 'pipe' });
const { surfaceEvents, surfaceCandidates, widgetProps, widgetTimeline, tripDayUrl } = require(path.join(output, 'widgetSchedule.js'));
after(() => rmSync(output, { recursive: true, force: true }));
const ev = (id, date, time, extra = {}) => ({ id, title: id, date, time, type: 'activity', location: 'Meeting point', ...extra });
const trip = (events) => ({ id: 'one', name: 'Thailand adventure', destination: 'Thailand', start: '2026-09-11', end: '2026-09-13', events });
test('tomorrow uses tomorrow’s itinerary, and completed events advance', () => {
  const trips = [trip([ev('day one', '2026-09-11', '10:00'), ev('day two', '2026-09-12', '10:00')])];
  assert.equal(widgetProps(trips, Date.parse('2026-09-12T01:00Z'), '#fff').eventTitle, 'day two');
  assert.equal(widgetProps(trips, Date.parse('2026-09-12T04:00Z'), '#fff').eventTitle, '');
});
test('timeline includes exact destination midnight and event transitions', () => {
  const trips = [trip([ev('Museum', '2026-09-12', '10:00', {endTime:'12:00'})])];
  const timeline = widgetTimeline(trips, Date.parse('2026-09-11T12:17Z'), '#fff', {});
  const midnight = timeline.find(entry => +entry.date === Date.parse('2026-09-11T17:00Z'));
  assert.equal(midnight.props.currentDay, 2);
  assert.equal(midnight.props.eventTitle, 'Museum');
  assert.equal(timeline.find(entry => +entry.date === Date.parse('2026-09-12T05:00Z')).props.eventTitle, '');
});
test('live activities reject unknown times and flights outside four-hour window', () => {
  const events = [ev('TBD','2026-09-11','TBD'), ev('later','2026-09-11','19:00',{type:'flight'}), ev('near','2026-09-11','10:00',{type:'flight',depTz:'Asia/Bangkok'})];
  assert.deepEqual(surfaceCandidates([trip(events)], Date.parse('2026-09-11T01:00Z'), true).map(item => item.event.id), ['near']);
  assert.equal(surfaceCandidates([trip(events)], Date.parse('2026-09-11T01:00Z'), false).length, 0);
});
test('ongoing overnight activity remains until its real end', () => {
  const trips = [trip([ev('night','2026-09-11','23:00',{endTime:'02:00'})])];
  assert.equal(surfaceCandidates(trips, Date.parse('2026-09-11T18:00Z'), false)[0].event.id, 'night');
  assert.equal(surfaceCandidates(trips, Date.parse('2026-09-11T19:00Z'), false).length, 0);
});
test('flight selection uses instants rather than trip array order', () => {
  const trips = [trip([ev('later','2026-09-11','12:00',{type:'flight',depTz:'Asia/Bangkok'}), ev('first','2026-09-11','10:00',{type:'flight',depTz:'Asia/Bangkok'})])];
  assert.equal(surfaceCandidates(trips, Date.parse('2026-09-11T01:00Z'), true)[0].event.id, 'first');
});
test('links preserve trip identity and date', () => {
  assert.equal(tripDayUrl('trip & one','2026-09-11'), '/trip/day?tripId=trip%20%26%20one&date=2026-09-11');
});

test('device surfaces hide other assignments, including while identity is loading', () => {
  const events = [ev('shared','2026-09-11','10:00'), ev('mine','2026-09-11','11:00',{assignedTo:['me']}), ev('other','2026-09-11','12:00',{assignedTo:['them']})];
  assert.deepEqual(surfaceEvents(events, 'me').map(e => e.id), ['shared','mine']);
  assert.deepEqual(surfaceEvents(events, null).map(e => e.id), ['shared']);
});
