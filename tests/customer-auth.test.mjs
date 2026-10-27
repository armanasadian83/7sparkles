import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import { getDatabase } from '../server/database.mjs';

async function helper(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const runtime = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  }, runtime, runtime.exports);
  return runtime.exports;
}
async function isolated(action) {
  const directory = await mkdtemp(join(tmpdir(), 'seven-sparkles-customer-auth-'));
  const saved = { directory: process.env.DATA_DIR, mode: process.env.NODE_ENV, url: process.env.APP_URL };
  const cacheKey = Symbol.for('seven-sparkles.sqlite');
  try {
    process.env.DATA_DIR = directory;
    process.env.NODE_ENV = 'development';
    process.env.APP_URL = 'http://localhost:3765';
    const db = getDatabase();
    const values = new Map(), options = new Map();
    const cookieJar = { get: name => values.has(name) ? { value: values.get(name) } : undefined, set: (name, value, settings) => { values.set(name, value); options.set(name, settings); } };
    const http = await helper('../src/server/http.ts', { 'server-only': {} });
    const checkoutTypes = await helper('../src/lib/checkout.ts');
    const auth = await helper('../src/server/customer-auth.ts', { 'server-only': {}, 'next/headers': { cookies: async () => cookieJar }, 'node:crypto': crypto, '../../server/database.mjs': { getDatabase }, '@/lib/checkout': checkoutTypes, './http': http });
    await action({ db, auth, http, values, options });
  } finally {
    globalThis[cacheKey]?.database.close();
    delete globalThis[cacheKey];
    for (const [key, value] of [['DATA_DIR', saved.directory], ['NODE_ENV', saved.mode], ['APP_URL', saved.url]]) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    const absolute = resolve(directory);
    assert.ok(absolute.startsWith(resolve(tmpdir()) + sep) && absolute.split(sep).at(-1).startsWith('seven-sparkles-customer-auth-'));
    await rm(absolute, { recursive: true, force: true });
  }
}
const cookie = 'seven_sparkles_customer';
const request = (ip = '127.0.0.1') => new Request('http://localhost:3765/api/customer/auth/request', { headers: { 'x-forwarded-for': ip } });
const rejectsStatus = (action, status) => assert.rejects(action, error => error.status === status);
const throwsStatus = (action, status) => assert.throws(action, error => error.status === status);
function insertCustomer(db, id = 'a', phone = '09121234567', active = 1) { db.prepare('INSERT INTO customers (id, name, phone, city, joined_at, active) VALUES (?, ?, ?, ?, ?, ?)').run(id, `Customer ${id}`, phone, 'Original city', '2026-01-01', active); }

test('local OTP issues hashed expiring challenges and establishes an HTTP-only session only after verification', () => isolated(async ({ db, auth, values, options }) => {
  insertCustomer(db);
  const challenge = auth.requestCustomerCode({ phone: '+۹۸۹۱۲۱۲۳۴۵۶۷' }, request());
  assert.match(challenge.developmentCode, /^\d{6}$/);
  assert.equal(challenge.challengeId.length, 48);
  assert.equal(challenge.expiresAt - challenge.resendAt, 90_000);
  const row = db.prepare('SELECT * FROM customer_otp_challenges').get();
  assert.equal(row.phone, '09121234567');
  assert.equal(row.code_hash, crypto.createHash('sha256').update(`${challenge.challengeId}:${challenge.developmentCode}`).digest('hex'));
  assert.notEqual(row.code_hash, challenge.developmentCode);
  assert.equal(await auth.getCurrentCustomer(), null);
  const customer = await auth.verifyCustomerCode({ challengeId: challenge.challengeId, code: challenge.developmentCode.replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]) }, request());
  assert.equal(customer.id, 'a');
  assert.equal(customer.name, 'Customer a');
  assert.equal(db.prepare('SELECT city FROM customers WHERE id = ?').get('a').city, 'Original city');
  const token = values.get(cookie);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(options.get(cookie).httpOnly, true);
  assert.equal(options.get(cookie).sameSite, 'lax');
  assert.equal(options.get(cookie).path, '/');
  assert.equal(options.get(cookie).secure, false);
  assert.equal(options.get(cookie).maxAge, 604800);
  const session = db.prepare('SELECT * FROM customer_sessions').get();
  assert.notEqual(session.token_hash, token);
  assert.equal(session.token_hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal((await auth.getCurrentCustomer()).phone, '09121234567');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_otp_challenges').get().n, 0);
  await rejectsStatus(() => auth.verifyCustomerCode({ challengeId: challenge.challengeId, code: challenge.developmentCode }, request()), 422);
  await auth.logoutCustomer();
  assert.equal(values.get(cookie), '');
  assert.equal(options.get(cookie).maxAge, 0);
  assert.equal(await auth.getCurrentCustomer(), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_sessions').get().n, 0);
}));

test('new customers are created after valid server verification, not on code requests or browser/demo tokens', () => isolated(async ({ db, auth, values }) => {
  values.set('seven-sparkles-demo-session-v1', JSON.stringify({ phone: '09121234567', mode: 'demo' }));
  values.set('seven_sparkles_admin', 'a'.repeat(64));
  assert.equal(await auth.getCurrentCustomer(), null);
  const challenge = auth.requestCustomerCode({ phone: '09121234567' }, request());
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customers').get().n, 0);
  const customer = await auth.verifyCustomerCode({ challengeId: challenge.challengeId, code: challenge.developmentCode }, request());
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customers').get().n, 1);
  assert.equal(customer.phone, '09121234567');
  assert.ok(Number.isFinite(Date.parse(customer.signedInAt)));
}));

test('wrong-code attempts survive requests and lock after five; resend invalidates the previous challenge', () => isolated(async ({ db, auth }) => {
  const challenge = auth.requestCustomerCode({ phone: '09121234567' }, request());
  throwsStatus(() => auth.requestCustomerCode({ phone: '09121234567' }, request()), 429);
  const wrong = challenge.developmentCode === '000000' ? '111111' : '000000';
  for (let index = 0; index < 5; index++) await rejectsStatus(() => auth.verifyCustomerCode({ challengeId: challenge.challengeId, code: wrong }, request()), 422);
  assert.equal(db.prepare('SELECT attempts FROM customer_otp_challenges').get().attempts, 5);
  await rejectsStatus(() => auth.verifyCustomerCode({ challengeId: challenge.challengeId, code: challenge.developmentCode }, request()), 422);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_sessions').get().n, 0);
  db.prepare('UPDATE customer_otp_challenges SET resend_at = 0').run();
  const next = auth.requestCustomerCode({ phone: '09121234567' }, request());
  assert.notEqual(next.challengeId, challenge.challengeId);
  await rejectsStatus(() => auth.verifyCustomerCode({ challengeId: challenge.challengeId, code: challenge.developmentCode }, request()), 422);
  assert.ok(await auth.verifyCustomerCode({ challengeId: next.challengeId, code: next.developmentCode }, request()));
}));

test('expired codes, disabled accounts and expired/revoked sessions cannot expose private customer data', () => isolated(async ({ db, auth, values }) => {
  insertCustomer(db);
  let challenge = auth.requestCustomerCode({ phone: '09121234567' }, request());
  db.prepare('UPDATE customer_otp_challenges SET expires_at = 0').run();
  await rejectsStatus(() => auth.verifyCustomerCode({ challengeId: challenge.challengeId, code: challenge.developmentCode }, request()), 422);
  challenge = auth.requestCustomerCode({ phone: '09121234567' }, request());
  db.prepare('UPDATE customers SET active = 0').run();
  await rejectsStatus(() => auth.verifyCustomerCode({ challengeId: challenge.challengeId, code: challenge.developmentCode }, request()), 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_sessions').get().n, 0);
  db.prepare('UPDATE customers SET active = 1').run();
  challenge = auth.requestCustomerCode({ phone: '09121234567' }, request());
  await auth.verifyCustomerCode({ challengeId: challenge.challengeId, code: challenge.developmentCode }, request());
  db.prepare('UPDATE customer_sessions SET expires_at = 0').run();
  assert.equal(await auth.getCurrentCustomer(), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_sessions').get().n, 0);
  values.set(cookie, 'f'.repeat(64));
  assert.equal(await auth.getCurrentCustomer(), null);
  await rejectsStatus(() => auth.requireCustomer(), 401);
}));

test('phone and IP request throttles are persistent and code generation is unavailable in production', () => isolated(async ({ db, auth }) => {
  for (let index = 0; index < 5; index++) {
    auth.requestCustomerCode({ phone: '09121234567' }, request());
    db.prepare('UPDATE customer_otp_challenges SET resend_at = 0').run();
  }
  throwsStatus(() => auth.requestCustomerCode({ phone: '09121234567' }, request('different')), 429);
  assert.ok(db.prepare('SELECT key FROM auth_attempts').all().every(row => !row.key.includes('09121234567')));
  process.env.NODE_ENV = 'production';
  throwsStatus(() => auth.requestCustomerCode({ phone: '09121234567' }, request()), 503);
  const stored = db.prepare('SELECT id FROM customer_otp_challenges LIMIT 1').get();
  await rejectsStatus(() => auth.verifyCustomerCode({ challengeId: stored.id, code: '123456' }, request()), 503);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_sessions').get().n, 0);
}));

test('request IP limit prevents requesting unlimited different phone numbers', () => isolated(async ({ auth }) => {
  for (let index = 0; index < 30; index++) auth.requestCustomerCode({ phone: `0912${String(index).padStart(7, '0')}` }, request());
  throwsStatus(() => auth.requestCustomerCode({ phone: '09129999999' }, request()), 429);
}));

test('customer auth routes enforce origin, bounded JSON and private no-store responses', () => isolated(async ({ auth, http }) => {
  const route = await helper('../src/app/api/customer/auth/request/route.ts', { '@/server/customer-auth': auth, '@/server/http': http });
  const make = (body, origin = 'http://localhost:3765', headers = {}) => new Request('http://localhost:3765/api/customer/auth/request', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body });
  let result = await route.POST(make(JSON.stringify({ phone: '09121234567' }), 'https://evil.example'));
  assert.equal(result.status, 403);
  assert.match(result.headers.get('cache-control'), /private.*no-store/);
  assert.equal(result.headers.get('vary'), 'Cookie');
  result = await route.POST(make(JSON.stringify({ phone: '09121234567', extra: 'x'.repeat(5000) })));
  assert.equal(result.status, 413);
  result = await route.POST(make('[]'));
  assert.equal(result.status, 422);
  result = await route.POST(make('broken'));
  assert.equal(result.status, 400);
  result = await route.POST(make(JSON.stringify({ phone: '09121234567' })));
  assert.equal(result.status, 200);
  assert.match((await result.json()).developmentCode, /^\d{6}$/);
}));

test('private order history is identity-scoped, keyset-paginated and preserves deleted/legacy/gift snapshots', () => isolated(async ({ db }) => {
  insertCustomer(db, 'a', '09121234567'); insertCustomer(db, 'b', '09121234568');
  const details = { recipient: { name: 'Gift receiver B', phone: '09121234568' }, address: { province: 'تهران', city: 'تهران', address: 'PRIVATE ADDRESS A', postalCode: '1234567890' }, shipping: { id: 'postpaid', name: 'پس‌کرایه', fee: 0, postpaid: true }, notes: 'Only A sees this', productSubtotal: 100, discount: 20, total: 100, paymentStatus: 'unpaid' };
  const insert = db.prepare('INSERT INTO orders (id,user_id,created_at,status,items_json,checkout_json) VALUES (?,?,?,?,?,?)');
  for (let index = 0; index < 25; index++) insert.run(`A-${String(index).padStart(2, '0')}`, 'a', '2026-10-26T00:00:00Z', index % 2 ? 'processing' : 'delivered', JSON.stringify([{ productId: 'deleted-product', name: 'Historical snapshot', quantity: 2, price: 50, variantLabel: '۳۰ میلی‌لیتر', sku: 'OLD' }]), index === 24 ? JSON.stringify(details) : '{}');
  insert.run('B-PRIVATE', 'b', '2026-10-27T00:00:00Z', 'cancelled', JSON.stringify([{ productId: 'b-product', name: 'B private item', quantity: 1, price: 999 }]), '{}');
  const orders = await helper('../src/server/customer-orders.ts', { 'server-only': {}, '../../server/database.mjs': { getDatabase }, './store': { readCatalog: () => ({ products: [] }) }, './http': { HttpError: (await helper('../src/server/http.ts', { 'server-only': {} })).HttpError } });
  const customerA = { id: 'a', name: 'A', phone: '09121234567', signedInAt: '2026-10-26T00:00:00Z' };
  const first = orders.readCustomerOrders(customerA, 'http://localhost:3765/api/customer/orders');
  assert.equal(first.customerId, 'a');
  assert.equal(first.orders.length, 20);
  assert.ok(first.nextCursor);
  assert.equal(first.orders[0].id, 'A-24');
  assert.equal(first.orders[0].delivery.recipient.name, 'Gift receiver B');
  assert.equal(first.orders[0].paymentStatus, 'unpaid');
  assert.equal(first.orders[0].items[0].slug, null);
  assert.equal(first.orders[0].items[0].image, null);
  assert.equal(first.orders[0].items[0].name, 'Historical snapshot');
  assert.equal(first.orders[1].paymentStatus, 'unknown');
  assert.equal(first.orders[1].delivery, null);
  assert.equal(first.orders[1].shippingFee, null);
  const next = orders.readCustomerOrders(customerA, `http://localhost:3765/api/customer/orders?cursor=${first.nextCursor}`);
  assert.equal(next.orders.length, 5);
  assert.equal(next.nextCursor, null);
  assert.equal(new Set([...first.orders, ...next.orders].map(order => order.id)).size, 25);
  assert.ok(!JSON.stringify(first).includes('B-PRIVATE'));
  const b = orders.readCustomerOrders({ ...customerA, id: 'b' }, 'http://localhost:3765/api/customer/orders');
  assert.deepEqual(b.orders.map(order => order.id), ['B-PRIVATE']);
  assert.ok(!JSON.stringify(b).includes('PRIVATE ADDRESS A'));
  throwsStatus(() => orders.readCustomerOrders(customerA, 'http://localhost:3765/api/customer/orders?phone=09121234568'), 422);
  throwsStatus(() => orders.readCustomerOrders(customerA, 'http://localhost:3765/api/customer/orders?cursor=malformed'), 422);
}));

test('authenticated gift checkout belongs to the verified submitter and idempotency cannot cross identities', () => isolated(async ({ db, http }) => {
  insertCustomer(db, 'a', '09121234567'); insertCustomer(db, 'b', '09121234568');
  const products = await helper('../src/lib/products.ts');
  const shipping = await helper('../src/lib/shipping.ts');
  const cart = await helper('../src/lib/cart.ts', { './products': products, './shipping': shipping });
  const numbers = await helper('../src/lib/checkout.ts');
  const product = { id: 'p1', name: 'Snapshot serum', brand: 'Brand', slug: 'serum', price: 100, salePrice: 80, hasVariants: false, variants: [], stock: 5, trackStock: true, availability: 'in_stock', sku: 'OLD-SKU' };
  const settings = { acceptOrders: true, shippingMethods: [{ id: 'free', name: 'ارسال رایگان', fee: 0, free: true, postpaid: false, enabled: true }] };
  db.prepare('INSERT INTO categories (id,name,name_key,created_at,updated_at) VALUES (?,?,?,?,?)').run('skin', 'Skin', 'skin', '2026-01-01', '2026-01-01');
  db.prepare('INSERT INTO brands (id,name,name_key,created_at,updated_at) VALUES (?,?,?,?,?)').run('brand', 'Brand', 'brand', '2026-01-01', '2026-01-01');
  db.prepare('INSERT INTO products (id,name,slug,brand,category,image,price,stock,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('p1', product.name, product.slug, 'Brand', 'skin', '', 100, 5, 'active', '2026-01-01', '2026-01-01');
  const inventory = await helper('../src/server/inventory.ts', { 'server-only': {}, '../../server/database.mjs': { getDatabase }, './http': http });
  const checkout = await helper('../src/server/checkout.ts', { 'server-only': {}, 'node:crypto': crypto, '../../server/database.mjs': { getDatabase }, '@/lib/checkout': numbers, '@/lib/cart': cart, '@/lib/shipping': shipping, './store': { readCatalog: () => ({ products: [product], settings }) }, './http': http, './inventory': inventory });
  const input = checkout.validateCheckout({ idempotencyKey: 'gift-ownership-0000001', recipient: { name: 'Gift receiver B', phone: '09121234568' }, address: { province: 'تهران', city: 'تهران', address: 'خیابان آزمایش، پلاک ۱۲', postalCode: '1234567890' }, notes: '', shippingMethodId: 'free', items: [{ id: 'p1', quantity: 2 }], expectedTotal: 160 });
  const owner = { id: 'a', phone: '09121234567', name: 'Buyer A', signedInAt: '2026-10-26T00:00:00Z' };
  const receipt = checkout.createCheckoutOrder(input, owner);
  const row = db.prepare('SELECT user_id,checkout_json,items_json FROM orders WHERE id = ?').get(receipt.id);
  assert.equal(row.user_id, 'a');
  assert.equal(JSON.parse(row.checkout_json).recipient.phone, '09121234568');
  assert.equal(JSON.parse(row.items_json)[0].price, 80);
  assert.equal(checkout.createCheckoutOrder(input, owner).id, receipt.id);
  throwsStatus(() => checkout.createCheckoutOrder(input, { ...owner, id: 'b', phone: '09121234568' }), 409);
  throwsStatus(() => checkout.createCheckoutOrder(input), 409);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1);
  const anonymous = checkout.createCheckoutOrder({ ...input, idempotencyKey: 'anonymous-ownership-0001' });
  assert.equal(db.prepare('SELECT user_id FROM orders WHERE id = ?').get(anonymous.id).user_id, 'b');
  db.prepare('UPDATE customers SET active = 0 WHERE id = ?').run('a');
  throwsStatus(() => checkout.createCheckoutOrder({ ...input, idempotencyKey: 'disabled-ownership-00001' }, owner), 409);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 2);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id = ?').get('p1').stock, 1);
}));
