const { test } = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const vm = require('node:vm'); const ts = require('typescript');
function load(file, modules = {}) { const exports = {}; vm.runInThisContext(`(function(exports,require){${ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText}\n})`)(exports, n => { if (!(n in modules)) throw Error(n); return modules[n]; }); return exports; }
const dates = load('src/lib/dates.ts');
const names = load('src/lib/names.ts');
const sync = load('src/lib/travelerSync.ts', { '@/lib/names': names });
const costs = load('src/lib/tripCosts.ts', { '@/lib/travelerSync': sync });
const filters = load('src/lib/reportFilters.ts', { '@/lib/dates': dates });
const money = load('src/lib/reportMoney.ts', { '@/lib/tripCosts': costs });

const today = new Date(2026, 9, 29); // 29 Oct 2026
const trip = (id, start, end, extra = {}) => ({ id, name: id, start, end, status: 'Published', events: [], travelers: [], attendees: '', image: '', ...extra });
const base = { ...filters.DEFAULT_REPORT_FILTERS };

test('periods keep trips that overlap them, including ones that span the edge', () => {
  const trips = [trip('sep', '2026-09-10', '2026-09-14'), trip('spans', '2026-09-28', '2026-10-03'), trip('oct', '2026-10-12', '2026-10-15'), trip('nov', '2026-11-05', '2026-11-09'), trip('2025', '2025-06-01', '2025-06-05')];
  const ids = f => filters.filterReportTrips(trips, { ...base, ...f }, today).map(t => t.id);
  assert.deepEqual(ids({ period: 'this-month' }), ['spans', 'oct']);
  assert.deepEqual(ids({ period: 'last-month' }), ['sep', 'spans']);
  assert.deepEqual(ids({ period: 'this-quarter' }), ['spans', 'oct', 'nov']);
  assert.deepEqual(ids({ period: 'last-quarter' }), ['sep', 'spans']);
  assert.deepEqual(ids({ period: 'this-year' }), ['sep', 'spans', 'oct', 'nov']);
  assert.deepEqual(ids({ period: 'last-year' }), ['2025']);
  assert.deepEqual(ids({ period: 'upcoming' }), ['nov']);
  assert.deepEqual(ids({ period: 'custom', from: '2026-10-01', to: '2026-10-12' }), ['spans', 'oct']);
  assert.deepEqual(ids({ period: 'custom', from: '', to: '' }).length, 5);
  assert.deepEqual(ids({}).length, 5);
});

test('trip and status filters combine with the period', () => {
  const trips = [trip('a', '2026-10-01', '2026-10-02', { status: 'Draft' }), trip('b', '2026-10-05', '2026-10-06')];
  assert.deepEqual(filters.filterReportTrips(trips, { ...base, status: 'Draft' }, today).map(t => t.id), ['a']);
  assert.deepEqual(filters.filterReportTrips(trips, { ...base, tripId: 'b', period: 'this-month' }, today).map(t => t.id), ['b']);
  assert.deepEqual(filters.filterReportTrips(trips, { ...base, tripId: 'b', status: 'Draft' }, today), []);
});

test('describeFilters reads like a sentence', () => {
  assert.equal(filters.describeFilters({ ...base, period: 'this-year', status: 'Published' }), 'This year, Published');
  assert.equal(filters.describeFilters({ ...base, period: 'custom', from: '2026-10-01', to: '2026-10-31' }, 'Barbados'), 'Barbados, 1 Oct 2026 to 31 Oct 2026');
});

test('money is totalled per currency, never across currencies', () => {
  const ev = (type, price) => ({ id: Math.random().toString(), type, title: type, date: '2026-10-01', time: '09:00', location: '', price });
  const gbp = trip('gbp', '2026-10-01', '2026-10-05', { currency: 'GBP', budget: '1,000', travelers: [{ id: '1', name: 'A', initials: 'A' }, { id: '2', name: 'B', initials: 'B' }], events: [ev('hotel', '£400'), ev('flight', '£300 pp'), ev('dining', 'tbc'), ev('activity', '')] });
  const usd = trip('usd', '2026-10-01', '2026-10-05', { currency: 'USD', budget: '5000', events: [ev('hotel', '$1,200')] });
  const { rows, currencies } = money.moneyByCurrency([gbp, usd]);
  const g = currencies.find(c => c.currency === 'GBP'), u = currencies.find(c => c.currency === 'USD');
  assert.equal(g.spend, 1000); // 400 + 300 x 2 travellers
  assert.equal(g.overBudget, 0);
  assert.equal(g.unpriced, 1);
  assert.equal(u.spend, 1200);
  const gRow = rows.find(r => r.trip.id === 'gbp');
  assert.equal(gRow.left, 0);
  assert.equal(gRow.missing, 1);
  assert.equal(gRow.perHead, 500);
  assert.deepEqual(g.byType.map(t => t.type), ['flight', 'hotel']);
});

test('over budget is counted and a trip with no budget is left out of budget use', () => {
  const ev = price => ({ id: price, type: 'hotel', title: 'h', date: '2026-10-01', time: '09:00', location: '', price });
  const over = trip('over', '2026-10-01', '2026-10-02', { currency: 'GBP', budget: '100', events: [ev('150')] });
  const none = trip('none', '2026-10-01', '2026-10-02', { currency: 'GBP', events: [ev('50')] });
  const [c] = money.moneyByCurrency([over, none]).currencies;
  assert.equal(c.overBudget, 1);
  assert.equal(c.budget, 100);
  assert.equal(c.spendOnBudgeted, 150);
  assert.equal(c.spend, 200);
});
