const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const output = mkdtempSync(path.join(tmpdir(), 'dalefy-time-input-'));
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), path.join(root, 'src/lib/timeInput.ts'), '--outDir', output, '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck'], { cwd: output, stdio: 'pipe' });
const { parseTimeInput, formatTimeInput, isValidTimeInput } = require(path.join(output, 'timeInput.js'));
after(() => rmSync(output, { recursive: true, force: true }));

test('common typed times normalize consistently for saving and validation', () => {
  for (const [input, expected] of Object.entries({ '11:00': '11:00', '4pm': '16:00', '4.30pm': '16:30', '4 p.m.': '16:00', '09.30': '09:30', '930': '09:30', '1630': '16:30', '430pm': '16:30', '12am': '00:00', '12pm': '12:00', '0': '00:00', '23:59': '23:59' })) {
    assert.equal(formatTimeInput(input), expected, input);
    assert.equal(isValidTimeInput(input), true, input);
  }
});

test('unconfirmed times save as empty rather than a made-up appointment', () => {
  for (const input of [undefined, '', '  ', 'TBC', 'tbd', 'To be confirmed', 'to be decided']) {
    assert.equal(parseTimeInput(input), '');
    assert.equal(isValidTimeInput(input), true);
  }
});

test('invalid times stay editable and cannot pass validation', () => {
  for (const input of ['24:00', '11:60', '1260', '0pm', '13pm', '25:30', '4:3', 'tomorrow', '-1', '4pm extra']) {
    assert.equal(isValidTimeInput(input), false, input);
    assert.equal(formatTimeInput(input), input, input);
  }
});
