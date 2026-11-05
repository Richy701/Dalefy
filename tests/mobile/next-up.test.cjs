const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const output = mkdtempSync(path.join(tmpdir(), 'dalefy-next-'));
execFileSync(process.execPath, [path.join(root, 'mobile/node_modules/typescript/bin/tsc'), path.join(root, 'mobile/shared/tripSummary.ts'), path.join(root, 'mobile/shared/timezones.ts'), path.join(root, 'mobile/shared/eventDisplay.ts'), '--outDir', output, '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck', '--ignoreConfig', '--noCheck'], { cwd: output, stdio: 'pipe' });
// The app's @/ alias, which only Metro and Vite know about
const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolve.call(this, request.startsWith('@/shared/') ? path.join(output, request.slice('@/shared/'.length)) : request, ...rest);
};
const { inDayOrder, nextEvent } = require(path.join(output, 'tripSummary.js'));
const { terminalLabel, minutesBetween, gapText } = require(path.join(output, 'eventDisplay.js'));
after(() => rmSync(output, { recursive: true, force: true }));
const ev = (id, time, date = '2099-11-06') => ({ id, time, date });

test('an event added later still goes in time order', () => {
  const saved = [ev('flight', '08:35'), ev('doha', '19:45'), ev('meet', '06:00')];
  assert.deepEqual(inDayOrder(saved).map(e => e.id), ['meet', 'flight', 'doha']);
  assert.equal(nextEvent(saved, new Date('2099-11-01T12:00:00')).id, 'meet');
});
test('an untimed event keeps the place the organiser gave it', () => {
  const saved = [ev('late', '20:00'), ev('checkin', 'TBC'), ev('early', '07:00')];
  assert.deepEqual(inDayOrder(saved).map(e => e.id), ['early', 'checkin', 'late']);
});
test('a terminal says it is one', () => {
  assert.equal(terminalLabel('4'), 'Terminal 4');
  assert.equal(terminalLabel('T5'), 'Terminal 5');
  assert.equal(terminalLabel('B'), 'Terminal B');
  assert.equal(terminalLabel('North'), 'North terminal');
  assert.equal(terminalLabel('Terminal 2'), 'Terminal 2');
});
test('time between events, including overnight, and never a made-up gap', () => {
  assert.equal(minutesBetween('2026-11-06', '18:20', '2026-11-06', '19:45'), 85);
  assert.equal(gapText(85), '1h 25m');
  assert.equal(gapText(120), '2h');
  assert.equal(gapText(45), '45m');
  assert.equal(minutesBetween('2026-11-06', '23:30', '2026-11-07', '01:00'), 90);
  assert.equal(minutesBetween('2026-11-06', '19:45', '2026-11-06', '18:20'), null);
  assert.equal(minutesBetween('2026-11-06', 'TBC', '2026-11-06', '18:20'), null);
});

