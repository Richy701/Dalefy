const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

async function run(tokens) {
  const pushed = [];
  const mocks = {
    './_tripPermissions.js': { canEditTrip: async () => true },
    './_firebaseAdmin.js': {
      getDocument: async () => ({ fields: { user_id: 'owner', travelers: [{ email: 'ash@example.com' }] } }),
      decodeValue: value => value,
      queryDocuments: async () => [{ fields: { trip_id: 'trip', device_id: 'phone', email: 'ash@example.com' } }],
      queryDocumentsIn: async () => tokens.map(token => ({ fields: { device_id: 'phone', token } })),
    },
    './_verifyToken.js': { verifyFirebaseToken: async () => ({ sub: 'owner' }) },
    './_rateLimit.js': { rateLimit: () => true },
    './_expoPush.js': { sendPush: async messages => { pushed.push(...messages); return []; }, logPush: async () => {}, newPushLogId: () => 'log' },
  };
  const code = ts.transpileModule(fs.readFileSync('api/notify-trip-update.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, require: name => {
    assert.ok(mocks[name], `Unexpected dependency (email must not be loaded): ${name}`);
    return mocks[name];
  } });
  let body;
  const res = { status() { return this; }, json(value) { body = value; return this; } };
  await exports.default({ method: 'POST', headers: { authorization: 'Bearer test' }, body: { tripId: 'trip', tripName: 'Test trip', changes: ['Flight has a new time'] } }, res);
  return { body, pushed };
}

test('travellers without push tokens receive no automatic email', async () => {
  const { body, pushed } = await run([]);
  assert.equal(body.sent, 0);
  assert.equal(body.emailed, 0);
  assert.equal(pushed.length, 0);
});

test('automatic app push updates still work without sending email', async () => {
  const { body, pushed } = await run(['ExponentPushToken[test]']);
  assert.equal(body.sent, 1);
  assert.equal(body.emailed, 0);
  assert.equal(pushed[0].to, 'ExponentPushToken[test]');
  assert.equal(pushed[0].data.tripId, 'trip');
});
