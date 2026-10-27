import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/admin-analytics.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const runtime = { exports: {} };
new Function('require', 'module', 'exports', compiled)(name => { throw new Error(`Unexpected dependency: ${name}`); }, runtime, runtime.exports);
const { buildAdminAnalytics, getAnalyticsPeriod, analyticsToCsv } = runtime.exports;

const now = new Date('2026-10-26T12:00:00Z');
const options = { range: '7d', basis: 'orders', now };
function snapshot(extra = {}) { return { orders: [], users: [], products: [], categories: [], brands: [], trash: [], settings: {}, ...extra }; }
function product(id, extra = {}) { return { id, name: `Product ${id}`, brand: 'Brand', category: 'c1', status: 'active', hasVariants: false, variants: [], trackStock: true, stock: 10, availability: 'in_stock', ...extra }; }
function order(id, date, extra = {}) { return { id, userId: 'u1', createdAt: date, status: 'processing', items: [{ productId: 'p1', name: 'Snapshot name', quantity: 2, price: 100 }], ...extra }; }
function checkout(fee = 25, extra = {}) { return { paymentStatus: 'unpaid', shipping: { id: 's1', name: 'Shipping', fee, postpaid: false }, discount: 50, total: 200 + fee, ...extra }; }
function user(id, date, extra = {}) { return { id, name: `User ${id}`, phone: '09121234567', city: 'Tehran', joinedAt: date, active: true, ...extra }; }

test('empty analytics preserves zero-filled days and never manufactures confirmed revenue', () => {
  const result = buildAdminAnalytics(snapshot(), options);
  assert.equal(result.summary.productSales, 0);
  assert.equal(result.summary.confirmedRevenue, null);
  assert.equal(result.kpis.sales.previous, 0);
  assert.equal(result.kpis.sales.change, null);
  assert.equal(result.trend.length, 7);
  assert.ok(result.trend.every(point => point.sales === 0 && point.orders === 0));
  assert.deepEqual(result.statuses.map(status => status.count), [0, 0, 0, 0]);
  assert.equal(result.customers.repeatRate, 0);
  assert.ok(!JSON.stringify(result).includes('NaN'));
});

test('booked sales reconcile items, fees and payment unknowns without inferring legacy payment', () => {
  const data = snapshot({ orders: [order('unpaid', '2026-10-24', { checkout: checkout() }), order('legacy', '2026-10-25', { status: 'delivered' }), order('cancelled', '2026-10-26', { status: 'cancelled', checkout: checkout(0) })] });
  const result = buildAdminAnalytics(data, options);
  assert.equal(result.summary.productSales, 400);
  assert.equal(result.summary.shippingFees, 25);
  assert.equal(result.summary.orderValue, 425);
  assert.equal(result.summary.discount, 50);
  assert.equal(result.summary.knownUnpaidValue, 225);
  assert.equal(result.summary.unknownPaymentValue, 200);
  assert.equal(result.summary.knownUnpaidValue + result.summary.unknownPaymentValue, result.summary.orderValue);
  assert.equal(result.summary.confirmedRevenue, null);
  assert.equal(result.summary.cancelledValue, 200);
  assert.equal(result.kpis.orders.value, 3);
  assert.equal(result.summary.qualifiedOrders, 2);
  assert.equal(result.kpis.units.value, 4);
  assert.equal(result.kpis.averageOrder.value, 200);
  assert.equal(result.topProducts[0].orderCount, 2);
  assert.equal(result.trend.reduce((sum, point) => sum + point.sales, 0), result.summary.productSales);
  assert.equal(result.trend.reduce((sum, point) => sum + point.orders, 0), result.summary.totalOrders);
});

test('approved payment counts each order once and reconciles with unpaid and unknown values', () => {
  const data = snapshot({ orders: [order('paid', '2026-10-24', { checkout: checkout(25, { paymentStatus: 'paid' }) }), order('unpaid', '2026-10-25', { checkout: checkout(0) }), order('unknown', '2026-10-25'), order('cancelled-paid', '2026-10-25', { status: 'cancelled', checkout: checkout(0, { paymentStatus: 'paid' }) })] });
  const result = buildAdminAnalytics(data, options);
  assert.equal(result.summary.confirmedRevenue, 225);
  assert.equal(result.summary.confirmedRevenue + result.summary.knownUnpaidValue + result.summary.unknownPaymentValue, result.summary.orderValue);
  assert.match(analyticsToCsv(result), /"درآمد تأییدشده","225"/);
});

test('delivered basis limits sales, buyers and rankings but keeps all-order status context', () => {
  const data = snapshot({ orders: [order('processing', '2026-10-24', { userId: 'u2', checkout: checkout() }), order('delivered', '2026-10-25', { status: 'delivered', checkout: checkout(0) }), order('cancelled', '2026-10-26', { status: 'cancelled' })] });
  const result = buildAdminAnalytics(data, { ...options, basis: 'delivered' });
  assert.equal(result.basis, 'delivered');
  assert.equal(result.summary.productSales, 200);
  assert.equal(result.summary.qualifiedOrders, 1);
  assert.equal(result.kpis.orders.value, 3);
  assert.equal(result.kpis.buyers.value, 1);
  assert.equal(result.summary.knownUnpaidCount, 1);
  assert.deepEqual(result.statuses.map(status => status.count), [1, 0, 1, 1]);
});

test('Tehran dates use inclusive start and exclusive end and compare adjacent equal calendar periods', () => {
  const data = snapshot({ orders: [
    order('before', '2026-10-19T20:29:59Z'),
    order('start', '2026-10-19T20:30:00Z'),
    order('today', '2026-10-26T11:59:59Z'),
    order('future-today', '2026-10-26T12:00:01Z'),
    order('after', '2026-10-26T20:30:00Z'),
  ] });
  const result = buildAdminAnalytics(data, options);
  assert.equal(result.period.from, '2026-10-20');
  assert.equal(result.period.to, '2026-10-26');
  assert.equal(result.period.previousFrom, '2026-10-13');
  assert.equal(result.period.previousTo, '2026-10-19');
  assert.equal(result.kpis.orders.value, 2);
  assert.equal(result.kpis.orders.previous, 1);
  assert.equal(result.kpis.sales.change, 100);
  assert.ok(result.notices.some(notice => notice.includes('تاریخ آینده')));
});

test('date-only legacy values mean midnight in Tehran rather than midnight UTC', () => {
  const data = snapshot({ orders: [order('previous', '2026-10-19'), order('first', '2026-10-20')] });
  const result = buildAdminAnalytics(data, options);
  assert.equal(result.kpis.orders.value, 1);
  assert.equal(result.kpis.orders.previous, 1);
  assert.equal(result.trend[0].orders, 1);
});

test('invalid custom input blocks calculations instead of silently showing fallback totals', () => {
  const data = snapshot({ orders: [order('one', '2026-10-24')] });
  for (const pair of [{ from: '2026-02-31', to: '2026-10-26' }, { from: '2026-10-26', to: '2026-10-20' }, { from: '2026-10-20', to: '2026-10-27' }, { from: '0000-01-01', to: '2026-10-26' }]) {
    const result = buildAdminAnalytics(data, { ...options, range: 'custom', ...pair });
    assert.ok(result.period.error);
    assert.equal(result.kpis.orders.value, 0);
    assert.equal(result.kpis.sales.previous, null);
    assert.equal(result.summary.productSales, 0);
  }
  const oneDay = buildAdminAnalytics(data, { ...options, range: 'custom', from: '2026-10-24', to: '2026-10-24' });
  assert.equal(oneDay.period.error, null);
  assert.equal(oneDay.kpis.orders.value, 1);
  assert.equal(oneDay.trend.length, 1);
  assert.equal(oneDay.period.previousFrom, '2026-10-23');
});

test('all-time includes old records, suppresses comparisons and bounds long trends', () => {
  const data = snapshot({ orders: [order('old', '1901-01-02'), order('now', '2026-10-24'), order('future', '2027-01-01')] });
  const result = buildAdminAnalytics(data, { ...options, range: 'all' });
  assert.equal(result.period.from, '1901-01-02');
  assert.equal(result.period.to, '2026-10-26');
  assert.equal(result.period.previousFrom, null);
  assert.equal(result.kpis.sales.previous, null);
  assert.equal(result.kpis.sales.value, 400);
  assert.equal(result.period.bucket, 'month');
  assert.ok(result.trend.length <= 121);
  assert.equal(result.trend.reduce((sum, point) => sum + point.orders, 0), 2);
});

test('all-cancelled periods keep cancellation context with zero sales and no false buyers', () => {
  const result = buildAdminAnalytics(snapshot({ orders: [order('cancelled', '2026-10-24', { status: 'cancelled', checkout: checkout() })] }), options);
  assert.equal(result.summary.cancelledCount, 1);
  assert.equal(result.summary.cancelledValue, 225);
  assert.equal(result.summary.productSales, 0);
  assert.equal(result.customers.buyers, 0);
  assert.equal(result.kpis.averageOrder.value, 0);
  assert.equal(result.topProducts.length, 0);
});

test('snapshot product prices/names survive deletion; variants aggregate by product identity', () => {
  const data = snapshot({ products: [product('p1', { name: 'Renamed current', price: 99999 })], categories: [{ id: 'c1', name: 'Skin' }], orders: [order('one', '2026-10-24', { items: [{ productId: 'p1', name: 'Historical product', quantity: 2, price: 50, variantId: 'small' }, { productId: 'p1', name: 'Historical product', quantity: 1, price: 100, variantId: 'large' }, { productId: 'deleted', name: 'Deleted product', quantity: 1, price: 500 }] })] });
  const result = buildAdminAnalytics(data, options);
  assert.equal(result.topProducts[0].id, 'deleted');
  assert.equal(result.topProducts[0].live, false);
  assert.equal(result.topProducts[0].name, 'Deleted product');
  const p1 = result.topProducts.find(item => item.id === 'p1');
  assert.equal(p1.sales, 200);
  assert.equal(p1.quantity, 3);
  assert.equal(p1.orderCount, 1);
  assert.equal(p1.name, 'Historical product');
  assert.equal(p1.category, 'Skin');
  assert.equal(result.categories.reduce((sum, group) => sum + group.sales, 0), 700);
  assert.equal(result.brands.reduce((sum, group) => sum + group.quantity, 0), 4);
});

test('current inventory respects variants, parent availability, preorder and untracked stock', () => {
  const data = snapshot({ products: [
    product('low', { stock: 3 }), product('none', { stock: 0 }), product('untracked', { trackStock: false, stock: 0 }),
    product('preorder', { availability: 'preorder', stock: 0 }), product('hidden', { availability: 'out_of_stock', stock: 90 }),
    product('variant', { hasVariants: true, stock: 999, variants: [{ id: 'a', availability: 'in_stock', stock: 2 }, { id: 'b', availability: 'out_of_stock', stock: 100 }, { id: 'c', availability: 'preorder', stock: 10 }] }),
    product('empty-variants', { hasVariants: true, variants: [] }), product('draft', { status: 'draft', stock: 1 }),
  ] });
  const result = buildAdminAnalytics(data, options);
  assert.equal(result.catalog.total, 8);
  assert.equal(result.catalog.active, 7);
  assert.equal(result.catalog.draft, 1);
  assert.equal(result.catalog.stockUnits, 5);
  assert.equal(result.catalog.lowStock, 2);
  assert.equal(result.catalog.outOfStock, 3);
  assert.equal(result.catalog.untracked, 1);
  assert.equal(result.catalog.variants, 3);
  assert.deepEqual(result.catalog.lowStockProducts.map(item => [item.id, item.stock]), [['variant', 2], ['low', 3]]);
});

test('customer growth uses join dates while returning buyers require an earlier qualifying order', () => {
  const data = snapshot({ users: [user('returning', '2026-09-01'), user('new', '2026-10-22'), user('disabled', '2026-10-22', { active: false }), user('future', '2027-01-01')], orders: [
    order('history', '2026-10-01', { userId: 'returning' }), order('repeat', '2026-10-24', { userId: 'returning' }),
    order('new-one', '2026-10-24', { userId: 'new' }), order('new-two', '2026-10-25', { userId: 'new' }),
    order('cancelled-old', '2026-10-01', { userId: 'disabled', status: 'cancelled' }), order('disabled-first', '2026-10-26', { userId: 'disabled' }),
  ] });
  const result = buildAdminAnalytics(data, options);
  assert.equal(result.customers.total, 4);
  assert.equal(result.customers.active, 3);
  assert.equal(result.customers.inactive, 1);
  assert.equal(result.customers.newCount, 2);
  assert.equal(result.customers.buyers, 3);
  assert.equal(result.customers.repeatBuyers, 1);
  assert.equal(result.customers.newBuyers, 2);
  assert.equal(result.trend.at(-1).totalCustomers, 3);
  assert.equal(result.trend.reduce((sum, point) => sum + point.newCustomers, 0), 2);
});

test('paid, free and postpaid shipping modes reconcile and unknown legacy shipping stays separate', () => {
  const data = snapshot({ orders: [order('paid', '2026-10-24', { checkout: checkout(25) }), order('free', '2026-10-24', { checkout: checkout(0) }), order('postpaid', '2026-10-25', { checkout: checkout(0, { shipping: { id: 's1', name: 'Shipping', fee: 0, postpaid: true } }) }), order('legacy', '2026-10-26')] });
  const result = buildAdminAnalytics(data, options);
  assert.equal(result.shipping.length, 4);
  assert.equal(result.shipping.reduce((sum, item) => sum + item.count, 0), result.summary.qualifiedOrders);
  assert.equal(result.shipping.reduce((sum, item) => sum + item.fees, 0), 25);
  assert.equal(result.shipping.reduce((sum, item) => sum + item.value, 0), result.summary.orderValue);
  assert.equal(result.shipping.filter(item => item.postpaid).length, 1);
});

test('invalid dates and malformed items are excluded with actionable notices', () => {
  const result = buildAdminAnalytics(snapshot({ orders: [order('bad-date', '2026-02-31'), order('bad-item', '2026-10-24', { items: [{ productId: 'p1', name: 'Invalid', quantity: -3, price: 100 }, { productId: 'p2', name: 'Valid', quantity: 1, price: 50 }] })], users: [user('bad', 'not-a-date')] }), options);
  assert.equal(result.kpis.orders.value, 1);
  assert.equal(result.summary.productSales, 50);
  assert.ok(result.notices.some(notice => notice.includes('2 رکورد با تاریخ نامعتبر')));
  assert.ok(result.notices.some(notice => notice.includes('1 قلم')));
});

test('CSV preserves filter/basis/units, neutralizes formulas and contains no private buyer/order fields', () => {
  const data = snapshot({ users: [user('u1', '2026-10-24', { name: 'PRIVATE CUSTOMER', phone: 'PRIVATE PHONE' })], orders: [order('PRIVATE ORDER', '2026-10-24', { status: 'delivered', items: [{ productId: 'p1', name: '=HYPERLINK("bad")', quantity: 1, price: 100 }], checkout: checkout() })] });
  const result = buildAdminAnalytics(data, { ...options, basis: 'delivered' });
  const csv = analyticsToCsv(result);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"2026-10-20","تا","2026-10-26"'));
  assert.ok(csv.includes('فقط تحویل‌شده'));
  assert.ok(csv.includes('تومان'));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(!csv.includes('PRIVATE CUSTOMER'));
  assert.ok(!csv.includes('PRIVATE PHONE'));
  assert.ok(!csv.includes('PRIVATE ORDER'));
});

test('range helper uses Persian display dates but Gregorian filter values and week/month zero filling', () => {
  const period = getAnalyticsPeriod(snapshot(), { ...options, range: '90d' });
  assert.equal(period.from, '2026-07-29');
  assert.equal(period.bucket, 'week');
  const ninety = buildAdminAnalytics(snapshot(), { ...options, range: '90d' });
  assert.equal(ninety.trend.length, 13);
  const year = buildAdminAnalytics(snapshot(), { ...options, range: '365d' });
  assert.equal(year.period.bucket, 'month');
  assert.equal(year.trend[0].key, year.period.from);
  assert.ok(year.trend.length <= 13);
});

test('multi-year timeline labels include Persian years while short same-year labels stay compact', () => {
  const history = buildAdminAnalytics(snapshot({ orders: [order('old', '2024-10-20'), order('new', '2026-10-24')] }), { ...options, range: 'all' });
  const yearFormatter = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', year: 'numeric' });
  const firstYear = yearFormatter.format(new Date('2024-10-20T12:00:00Z'));
  const lastYear = yearFormatter.format(now);
  assert.ok(history.trend[0].label.includes(firstYear), 'first historical bucket identifies its Persian year');
  assert.ok(history.trend.at(-1).label.includes(lastYear), 'last bucket identifies its Persian year');
  assert.notEqual(firstYear, lastYear);
  const short = buildAdminAnalytics(snapshot(), options);
  assert.ok(short.trend.every(point => !point.label.includes(lastYear)), 'short same-year labels omit redundant years');
});
