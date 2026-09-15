import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadService(popupCode) {
  const calls = { popup: 0, redirect: 0, parameters: null };
  const exports = {};
  const source = readFileSync(new URL('../../src/services/firebaseAuth.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modules = {
    'firebase/auth': {
      GoogleAuthProvider: class { setCustomParameters(value) { calls.parameters = value; } },
      signInWithPopup: async () => { calls.popup++; if (popupCode) throw { code: popupCode }; return { user: { uid: 'owner', email: 'owner@example.test' } }; },
      signInWithRedirect: async () => { calls.redirect++; },
    },
    'firebase/firestore': { doc: () => ({}), getDoc: async () => ({ exists: () => true, id: 'owner', data: () => ({ name: 'Owner', email: 'owner@example.test', role: 'Admin', initials: 'O' }) }) },
    './firebase': { isFirebaseConfigured: () => true, firebaseAuth: () => ({}), firebaseDb: () => ({}) },
    '@/lib/names': { initialsFrom: () => 'O' },
    '@/lib/api': {},
  };
  vm.runInNewContext(compiled, { exports, require: name => { if (!(name in modules)) throw new Error(name); return modules[name]; } });
  return { signIn: exports.signInWithGoogle, calls };
}
for (const code of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request']) {
  test(`${code} stops without opening another sign-in flow`, async () => {
    const { signIn, calls } = loadService(code);
    const result = await signIn();
    assert.match(result.error, /cancelled/);
    assert.equal(calls.redirect, 0);
    assert.equal(result.user, null);
  });
}
test('blocked popup still has a redirect fallback', async () => {
  const { signIn, calls } = loadService('auth/popup-blocked');
  await signIn();
  assert.equal(calls.redirect, 1);
});
test('successful Google login returns the selected account and requests account selection', async () => {
  const { signIn, calls } = loadService();
  const result = await signIn();
  assert.equal(result.user.id, 'owner');
  assert.equal(result.error, null);
  assert.equal(calls.parameters.prompt, 'select_account');
  assert.equal(calls.redirect, 0);
});
test('a new invite without an email does not inherit the previous test account', () => {
  const source = readFileSync(new URL('../../src/lib/pendingInvite.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const storage = () => { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }; };
  const exports = {};
  vm.runInNewContext(compiled, { exports, localStorage: storage(), sessionStorage: storage() });
  exports.setPendingInvite('first', 'test@example.test');
  exports.setPendingInvite('second');
  assert.equal(exports.getPendingInviteEmail(), null);
  exports.clearPendingInvite();
  assert.equal(exports.getPendingInvite(), null);
});
