import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import ts from 'typescript';
import { getDatabase, getDataDirectory } from '../server/database.mjs';

async function helper(relative, dependencies = {}) {
  const source = await fs.readFile(new URL(relative, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const runtime = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  }, runtime, runtime.exports);
  return runtime.exports;
}

async function isolated(action) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'seven-sparkles-receipts-'));
  const previous = process.env.DATA_DIR, key = Symbol.for('seven-sparkles.sqlite');
  try {
    process.env.DATA_DIR = directory;
    const db = getDatabase(), identity = { customer: null, admin: null };
    const http = await helper('../src/server/http.ts', { 'server-only': {} });
    const types = await helper('../src/lib/payment-receipts.ts');
    const receipts = await helper('../src/server/payment-receipts.ts', {
      'server-only': {}, 'node:crypto': crypto, 'node:fs/promises': fs, 'node:path': path, sharp,
      '../../server/database.mjs': { getDatabase, getDataDirectory }, '@/lib/payment-receipts': types,
      './admin-auth': { getCurrentAdmin: async () => identity.admin },
      './customer-auth': { getCurrentCustomer: async () => identity.customer }, './http': http,
    });
    for (const [id, phone] of [['a', '09121234567'], ['b', '09121234568']]) db.prepare('INSERT INTO customers (id,name,phone,joined_at,active) VALUES (?,?,?,?,1)').run(id, `Customer ${id}`, phone, '2026-01-01');
    db.prepare('INSERT INTO admin_accounts (id,email,name,password_hash,created_at) VALUES (?,?,?,?,?)').run('admin', 'receipt@example.test', 'Receipt reviewer', 'test-only', '2026-01-01');
    for (const [id, owner] of [['SS-a', 'a'], ['SS-b', 'b']]) db.prepare('INSERT INTO orders (id,user_id,created_at,status,items_json,checkout_json) VALUES (?,?,?,?,?,?)').run(id, owner, '2026-01-01', 'processing', '[]', JSON.stringify({ total: 120000, paymentStatus: 'unpaid' }));
    await action({ db, receipts, identity, directory });
  } finally {
    globalThis[key]?.database.close(); delete globalThis[key];
    if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    const absolute = path.resolve(directory), tempRoot = path.resolve(tmpdir()) + path.sep;
    assert.ok(absolute.startsWith(tempRoot) && path.basename(absolute).startsWith('seven-sparkles-receipts-'));
    await fs.rm(absolute, { recursive: true, force: true });
  }
}

const request = token => new Request('http://localhost/api/orders/SS-a/payment-receipts', { headers: token ? { 'x-receipt-token': token } : {} });
const fails = (action, status) => assert.rejects(action, error => error.status === status);
const fakeCustomer = id => ({ id, name: id, phone: id === 'a' ? '09121234567' : '09121234568', signedInAt: '2026-01-01' });
async function image() { return sharp({ create: { width: 80, height: 120, channels: 3, background: '#c7b89a' } }).png().toBuffer(); }
function upload(token, bytes, type = 'image/png', name = 'receipt.png') {
  const form = new FormData(); form.append('file', new File([bytes], name, { type }));
  return new Request('http://localhost/api/orders/SS-a/payment-receipts', { method: 'POST', headers: token ? { 'x-receipt-token': token } : {}, body: form });
}

test('checkout capabilities are hashed, per-order, expiring and bounded across replays', () => isolated(async ({ db, receipts }) => {
  const token = receipts.createPaymentReceiptGrant('SS-a');
  assert.match(token, /^[a-f0-9]{64}$/);
  const grant = db.prepare('SELECT * FROM payment_receipt_grants').get();
  assert.equal(grant.token_hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.notEqual(grant.token_hash, token);
  assert.equal(grant.expires_at - grant.created_at, 86400000);
  await receipts.requireReceiptOrder(request(token), 'SS-a');
  await fails(() => receipts.requireReceiptOrder(request(token), 'SS-b'), 404);
  await fails(() => receipts.requireReceiptOrder(request('f'.repeat(64)), 'SS-a'), 404);
  db.prepare('UPDATE payment_receipt_grants SET expires_at = 0').run();
  await fails(() => receipts.requireReceiptOrder(request(token), 'SS-a'), 404);
  for (let index = 0; index < 20; index++) receipts.createPaymentReceiptGrant('SS-a');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payment_receipt_grants').get().n, 16);
}));

test('verified owners can access their order, while other accounts, disabled owners and anonymous guesses cannot', () => isolated(async ({ db, receipts, identity }) => {
  await fails(() => receipts.requireReceiptOrder(request(), 'SS-a'), 404);
  await fails(() => receipts.requireReceiptOrder(request(), 'missing'), 404);
  identity.customer = fakeCustomer('b');
  await fails(() => receipts.requireReceiptOrder(request(), 'SS-a'), 404);
  identity.customer = fakeCustomer('a');
  await receipts.requireReceiptOrder(request(), 'SS-a');
  db.prepare("UPDATE customers SET active = 0 WHERE id = 'a'").run();
  const token = receipts.createPaymentReceiptGrant('SS-a');
  await fails(() => receipts.requireReceiptOrder(request(token), 'SS-a'), 404);
}));

test('real uploaded images are normalized to private WebP files and linked to the exact order', () => isolated(async ({ db, receipts, directory }) => {
  const token = receipts.createPaymentReceiptGrant('SS-a');
  const result = await receipts.uploadPaymentReceipt(upload(token, await image(), 'image/png', '../receipt.png'), 'SS-a');
  assert.equal(result.orderId, 'SS-a'); assert.equal(result.status, 'pending');
  assert.equal(result.orderTotal, 120000); assert.equal(result.reviewedAt, null); assert.equal(result.reviewNote, '');
  assert.equal(result.originalName, '..receipt.png');
  assert.match(result.fileUrl, /^\/api\/payment-receipts\/[a-f0-9-]+\/file$/);
  assert.doesNotMatch(JSON.stringify(result), /token_hash|filename|expires_at/);
  const saved = db.prepare('SELECT * FROM payment_receipts').get();
  assert.equal(saved.order_id, 'SS-a');
  const file = await fs.readFile(path.join(directory, 'payment-receipts', saved.filename));
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined);
  assert.equal((await receipts.readOrderPaymentReceipts('SS-a')).length, 1);
  assert.equal((await receipts.readOrderPaymentReceipts('SS-b')).length, 0);
}));

test('invalid content, unsupported formats and oversized bodies do not create rows or private files', () => isolated(async ({ db, receipts, directory }) => {
  const token = receipts.createPaymentReceiptGrant('SS-a');
  await fails(() => receipts.uploadPaymentReceipt(upload(token, '<svg/>', 'image/svg+xml'), 'SS-a'), 422);
  await fails(() => receipts.uploadPaymentReceipt(upload(token, 'not an image'), 'SS-a'), 422);
  await fails(() => receipts.uploadPaymentReceipt(upload(token, new Uint8Array(5 * 1024 * 1024 + 1)), 'SS-a'), 422);
  const excessive = request(token);
  excessive.headers.set('content-type', 'multipart/form-data; boundary=test');
  excessive.headers.set('content-length', String(7 * 1024 * 1024));
  await fails(() => receipts.uploadPaymentReceipt(excessive, 'SS-a'), 413);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payment_receipts').get().n, 0);
  await assert.rejects(() => fs.stat(path.join(directory, 'payment-receipts')), error => error.code === 'ENOENT');
}));

test('rejected receipts always permit a replacement while approved/cancelled orders remain blocked', () => isolated(async ({ db, receipts, directory }) => {
  const token = receipts.createPaymentReceiptGrant('SS-a'), bytes = await image();
  for (let index = 0; index < 6; index++) {
    const receipt = await receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a');
    receipts.reviewPaymentReceipt(receipt.id, { status: 'rejected', reviewNote: '' }, 'admin');
  }
  const replacement = await receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a');
  assert.equal(replacement.status, 'pending');
  await fails(() => receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a'), 409);
  assert.equal((await fs.readdir(path.join(directory, 'payment-receipts'))).length, 7);
  const second = receipts.createPaymentReceiptGrant('SS-b');
  const receipt = await receipts.uploadPaymentReceipt(upload(second, bytes), 'SS-b');
  receipts.reviewPaymentReceipt(receipt.id, { status: 'approved', reviewNote: '' }, 'admin');
  await fails(() => receipts.uploadPaymentReceipt(upload(second, bytes), 'SS-b'), 409);
  receipts.reviewPaymentReceipt(receipt.id, { status: 'rejected', reviewNote: 'مبلغ اشتباه' }, 'admin');
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = 'SS-b'").run();
  await fails(() => receipts.uploadPaymentReceipt(upload(second, bytes), 'SS-b'), 409);
}));

test('review status, notes and reviewer persist, synchronize payment and preserve fulfilment and other approvals', () => isolated(async ({ db, receipts }) => {
  const token = receipts.createPaymentReceiptGrant('SS-a'), bytes = await image();
  const a = await receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a');
  receipts.reviewPaymentReceipt(a.id, { status: 'rejected', reviewNote: '' }, 'admin');
  const b = await receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a');
  const approved = receipts.reviewPaymentReceipt(a.id, { status: 'approved', reviewNote: '  پرداخت دریافت شد  ' }, 'admin');
  assert.equal(approved.reviewNote, 'پرداخت دریافت شد'); assert.ok(Date.parse(approved.reviewedAt));
  const readOrder = () => db.prepare("SELECT checkout_json,status FROM orders WHERE id = 'SS-a'").get();
  assert.equal(JSON.parse(readOrder().checkout_json).paymentStatus, 'paid');
  assert.equal(readOrder().status, 'processing');
  assert.equal(db.prepare('SELECT reviewed_by FROM payment_receipts WHERE id = ?').get(a.id).reviewed_by, 'admin');
  receipts.reviewPaymentReceipt(b.id, { status: 'approved', reviewNote: '' }, 'admin');
  receipts.reviewPaymentReceipt(a.id, { status: 'rejected', reviewNote: 'عدم تطابق' }, 'admin');
  assert.equal(JSON.parse(readOrder().checkout_json).paymentStatus, 'paid');
  const pending = receipts.reviewPaymentReceipt(b.id, { status: 'pending', reviewNote: '' }, 'admin');
  assert.equal(pending.reviewedAt, null);
  assert.equal(JSON.parse(readOrder().checkout_json).paymentStatus, 'unpaid');
  assert.throws(() => receipts.reviewPaymentReceipt(a.id, { status: 'shipped', reviewNote: '' }, 'admin'), error => error.status === 422);
  assert.throws(() => receipts.reviewPaymentReceipt('missing', { status: 'rejected', reviewNote: '' }, 'admin'), error => error.status === 404);
}));

test('pending receipts prevent resubmission until rejection, including an older receipt returned to pending', () => isolated(async ({ db, receipts, directory }) => {
  const token = receipts.createPaymentReceiptGrant('SS-a'), bytes = await image();
  const first = await receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a');
  await fails(() => receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a'), 409);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payment_receipts').get().n, 1);
  assert.equal((await fs.readdir(path.join(directory, 'payment-receipts'))).length, 1);

  receipts.reviewPaymentReceipt(first.id, { status: 'rejected', reviewNote: 'تصویر خوانا نیست' }, 'admin');
  const second = await receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a');
  assert.equal(second.status, 'pending');
  await fails(() => receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a'), 409);
  receipts.reviewPaymentReceipt(second.id, { status: 'rejected', reviewNote: '' }, 'admin');
  receipts.reviewPaymentReceipt(first.id, { status: 'pending', reviewNote: '' }, 'admin');
  await fails(() => receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a'), 409);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payment_receipts').get().n, 2);
  assert.equal((await fs.readdir(path.join(directory, 'payment-receipts'))).length, 2);

  receipts.reviewPaymentReceipt(first.id, { status: 'rejected', reviewNote: '' }, 'admin');
  const third = await receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a');
  receipts.reviewPaymentReceipt(third.id, { status: 'approved', reviewNote: '' }, 'admin');
  await fails(() => receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a'), 409);
  assert.equal(JSON.parse(db.prepare("SELECT checkout_json FROM orders WHERE id = 'SS-a'").get().checkout_json).paymentStatus, 'paid');
}));

test('concurrent uploads save only one pending receipt and clean up the losing file', () => isolated(async ({ db, receipts, directory }) => {
  const token = receipts.createPaymentReceiptGrant('SS-a'), bytes = await image();
  const results = await Promise.allSettled([
    receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a'),
    receipts.uploadPaymentReceipt(upload(token, bytes), 'SS-a'),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.filter(result => result.status === 'rejected');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM payment_receipts WHERE status = 'pending'").get().n, 1);
  assert.equal((await fs.readdir(path.join(directory, 'payment-receipts'))).length, 1);
}));

test('admin search uses literal terms, bounded keyset pagination and validated filters', () => isolated(async ({ db, receipts }) => {
  const insert = db.prepare('INSERT INTO payment_receipts (id,order_id,filename,original_name,created_at,status) VALUES (?,?,?,?,?,?)');
  for (let index = 0; index < 25; index++) {
    const id = crypto.randomUUID();
    insert.run(id, index === 24 ? 'SS-b' : 'SS-a', `${id}.webp`, index === 0 ? '100% receipt.png' : 'receipt.png', `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`, index % 2 ? 'rejected' : 'pending');
  }
  const first = receipts.listAdminPaymentReceipts('http://localhost/api/admin/payment-receipts');
  assert.equal(first.receipts.length, 20); assert.equal(first.total, 25); assert.ok(first.nextCursor);
  const next = receipts.listAdminPaymentReceipts(`http://localhost/api/admin/payment-receipts?cursor=${first.nextCursor}`);
  assert.equal(next.receipts.length, 5); assert.equal(next.total, 25); assert.equal(next.nextCursor, null);
  assert.equal(new Set([...first.receipts, ...next.receipts].map(item => item.id)).size, 25);
  assert.equal(receipts.listAdminPaymentReceipts('http://localhost/api/admin/payment-receipts?q=SS-b').total, 1);
  assert.equal(receipts.listAdminPaymentReceipts('http://localhost/api/admin/payment-receipts?q=%25').total, 1);
  assert.equal(receipts.listAdminPaymentReceipts('http://localhost/api/admin/payment-receipts?status=rejected').total, 12);
  for (const query of ['status=unknown', 'cursor=invalid', 'status=pending&status=rejected', 'phone=09121234567']) assert.throws(() => receipts.listAdminPaymentReceipts(`http://localhost/api/admin/payment-receipts?${query}`), error => error.status === 422);
}));

test('receipt files require owner/admin/capability and all responses forbid caches and sniffing', () => isolated(async ({ receipts, identity }) => {
  const token = receipts.createPaymentReceiptGrant('SS-a');
  const receipt = await receipts.uploadPaymentReceipt(upload(token, await image()), 'SS-a');
  await fails(() => receipts.paymentReceiptFile(request(), receipt.id), 404);
  identity.customer = fakeCustomer('b');
  await fails(() => receipts.paymentReceiptFile(request(), receipt.id), 404);
  identity.customer = fakeCustomer('a');
  let response = await receipts.paymentReceiptFile(request(), receipt.id);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('vary'), 'Cookie, X-Receipt-Token');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /sandbox/);
  identity.customer = null;
  response = await receipts.paymentReceiptFile(request(token), receipt.id);
  assert.ok((await response.arrayBuffer()).byteLength > 0);
  identity.admin = { id: 'admin' };
  assert.equal((await receipts.paymentReceiptFile(request(), receipt.id)).status, 200);
  await fails(() => receipts.paymentReceiptFile(request(), '../file'), 404);
}));
