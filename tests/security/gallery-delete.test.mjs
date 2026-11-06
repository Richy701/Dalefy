import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../../mobile/services/galleryDelete.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function harness(fail = false) {
  const calls = [], exports = {};
  vm.runInNewContext(code, { exports, require: () => ({ changeTripMedia: async (...args) => { calls.push(args); if (fail) throw Error('Offline'); } }) });
  return { ...exports, calls };
}
test('deleting an old photo sends only its ID, preserving later uploads and other trips', async () => {
  const h = harness();
  await h.deleteGalleryPhoto('trip', 'old');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [['trip', [], ['old']]]);
  const current = [{ id: 'trip', media: [{ id: 'old' }, { id: 'new-a' }, { id: 'new-b' }] }, { id: 'other', media: [{ id: 'old' }] }];
  const result = h.withoutGalleryPhoto(current, 'trip', 'old');
  assert.deepEqual(result[0].media.map(p => p.id), ['new-a', 'new-b']);
  assert.equal(result[1], current[1]);
  assert.equal(current[0].media.length, 3);
});
test('failed delete rejects so the caller does not change the gallery cache', async () => {
  await assert.rejects(harness(true).deleteGalleryPhoto('trip', 'old'), /Offline/);
});
test('missing identity never sends a delete request', async () => {
  const h = harness();
  await assert.rejects(h.deleteGalleryPhoto('trip', ''), /identity/);
  assert.equal(h.calls.length, 0);
});
