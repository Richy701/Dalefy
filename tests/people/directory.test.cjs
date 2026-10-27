const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/peopleDirectory.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject });
const { combinePeople, removePeopleById } = exportsObject;
test('deleting a duplicate cannot delete a same-named directory record', () => {
  const laura = { id: 'original', name: 'Laura', email: 'laura@example.com', avatar: 'photo.jpg' };
  const result = removePeopleById([laura, { id: 'duplicate', name: 'Laura' }], new Set(['duplicate']));
  assert.equal(result.length, 1);
  assert.equal(result[0], laura);
});
test('same names with different IDs remain distinct for review', () => {
  assert.equal(combinePeople([{ id: 'one', name: 'Laura' }, { id: 'two', name: 'Laura' }]).length, 2);
});
test('blank copies do not hide an existing photo or email', () => {
  const result = combinePeople([{ id: 'one', name: 'Laura', avatar: 'photo.jpg', email: 'laura@example.com' }, { id: 'one', name: 'Laura', avatar: '', email: '' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].avatar, 'photo.jpg');
  assert.equal(result[0].email, 'laura@example.com');
});
