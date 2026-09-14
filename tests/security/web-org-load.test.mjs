import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/hooks/useOrgLoad.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const uid = 'existing-account-1234567890';

function mount({ empty = false, offline = false, missingOrg = false, failOrg = false, otherOrgFails = false, authUid = uid } = {}) {
  const state = [];
  let cursor = 0;
  let effect;
  let user = { id: uid };
  const exports = {};
  const membership = id => ({ id, data: () => ({ organization_id: id, role: 'owner' }) });
  vm.runInNewContext(code, {
    exports, setTimeout: () => 1, clearTimeout: () => {},
    require: name => {
      if (name === 'react') return {
        useState: initial => {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
        },
        useEffect: callback => { effect = callback; },
        useCallback: callback => callback,
      };
      if (name === '@/context/AuthContext') return { useAuth: () => ({ user, isAuthenticated: !!user }) };
      if (name === '@/services/firebase') return { isFirebaseConfigured: () => true, firebaseDb: () => ({}) };
      if (name === '@/services/firebaseTrips') return { waitForAuth: async () => authUid };
      if (name === '@/lib/logger') return { logger: { log() {}, warn() {} } };
      if (name === '@/config/constants') return { ORG_LOAD_TIMEOUT_MS: 10000 };
      if (name === 'firebase/firestore') return {
        collection: (_db, name) => name, where: () => ({}), query: collection => collection,
        doc: (_db, collection, id) => ({ collection, id }),
        getDocsFromServer: async () => {
          if (offline) throw Error('Offline');
          return { empty, docs: empty ? [] : [membership('existing'), ...(otherOrgFails ? [membership('other')] : [])] };
        },
        getDocs: async () => ({ docs: [] }),
        getDoc: async ({ collection, id }) => {
          if (collection === 'organizations' && (failOrg || id === 'other')) throw Error('Request failed');
          return { id, exists: () => !missingOrg, data: () => collection === 'profiles' ? {} : { name: 'Existing agency' } };
        },
      };
      throw Error(name);
    },
  });
  const render = () => { cursor = 0; return exports.useOrgLoad(); };
  render();
  const cleanup = effect();
  return { render, cleanup, rerun: () => effect(), changeUser: id => { user = id ? { id } : null; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

for (const [label, options] of [
  ['failed current organisation request', { failOrg: true }],
  ['missing organisation document with an existing membership', { missingOrg: true }],
  ['offline membership lookup', { offline: true }],
  ['restored account does not match Firebase auth', { authUid: 'another-account' }],
]) {
  test(`${label} must not send the user to organisation setup`, async () => {
    const hook = mount(options);
    await settle();
    const result = hook.render();
    assert.equal(result.tablesReady, false);
    assert.equal(result.isLoading, false);
    hook.cleanup();
  });
}

test('confirmed empty server membership allows onboarding', async () => {
  const hook = mount({ empty: true });
  await settle();
  assert.equal(hook.render().tablesReady, true);
  assert.equal(hook.render().currentOrg, null);
});

test('existing organisation loads even if an unrelated organisation fails', async () => {
  const hook = mount({ otherOrgFails: true });
  await settle();
  assert.equal(hook.render().currentOrg.id, 'existing');
  assert.equal(hook.render().tablesReady, true);
});

test('previous account onboarding decision cannot be used by a new account', async () => {
  const hook = mount({ empty: true });
  await settle();
  assert.equal(hook.render().tablesReady, true);
  hook.changeUser('another-account-1234567890');
  assert.equal(hook.render().tablesReady, false);
});

test('refresh clears a previous onboarding decision while rechecking', async () => {
  const hook = mount({ empty: true });
  await settle();
  hook.render().refreshOrg();
  hook.cleanup();
  hook.render();
  hook.rerun();
  assert.equal(hook.render().tablesReady, false);
  await settle();
  assert.equal(hook.render().tablesReady, true);
});
