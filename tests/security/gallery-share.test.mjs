import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../../mobile/services/galleryShare.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const photo = (id, cloud = false) => ({ id, url: cloud ? `https://firebasestorage.googleapis.com/${id}` : `file://${id}` });
function harness(uploaded, failSave = false) {
  const writes = [], progress = [], exports = {};
  vm.runInNewContext(code, { exports, require: name => name === './mediaUpload'
    ? { uploadTripMedia: async (_items, _trip, progress) => { progress(0, uploaded.length, 0.5); return uploaded; } }
    : { changeTripMedia: async (_trip, photos) => { writes.push(photos); if (failSave) throw Error('Offline'); } } });
  return { run: () => exports.shareGalleryPhotos(uploaded, 'trip', (...args) => progress.push(args)), writes, progress };
}
test('all uploads rejected: no gallery write and no success count', async () => {
  const h = harness([photo('a'), photo('b')]); const result = await h.run();
  assert.equal(result.saved.length, 0); assert.equal(result.retry.length, 2); assert.equal(h.writes.length, 0);
});
test('partial batch: save only successful uploads and retain failed selections', async () => {
  const h = harness([photo('a', true), photo('b')]); const result = await h.run();
  assert.equal(result.saved.length, 1); assert.equal(result.retry[0].id, 'b'); assert.equal(h.writes[0].length, 1);
});
test('gallery save rejected: retain cloud URLs for retry and report no success', async () => {
  const h = harness([photo('a', true), photo('b')], true); const result = await h.run();
  assert.equal(result.saved.length, 0); assert.equal(result.retry.length, 2); assert.ok(result.retry[0].url.startsWith('https://'));
});
test('success requires the gallery save, with a distinct saving stage', async () => {
  const h = harness([photo('a', true)]); const result = await h.run();
  assert.equal(result.saved.length, 1); assert.equal(result.retry.length, 0); assert.equal(h.writes.length, 1);
  assert.equal(h.progress.at(-1)[2], true);
  assert.equal(h.progress[0][2], false);
  assert.equal(h.progress[0][3], 0.5);
});
