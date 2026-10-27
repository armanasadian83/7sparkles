import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { getDatabase, getDataDirectory } from '../server/database.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const databaseKey = Symbol.for('seven-sparkles.sqlite');

// Execute the actual TypeScript services against SQLite, without Next's server-only marker.
function serviceLoader() {
  const modules = new Map();
  function load(filename) {
    const absolute = resolve(project, filename);
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const runtime = { exports: {} };
    modules.set(absolute, runtime);
    const source = readFileSync(absolute, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', compiled)(name => {
      if (name === 'server-only') return {};
      if (name.endsWith('/server/database.mjs')) return { getDatabase, getDataDirectory };
      if (name.startsWith('@/')) return load(join('src', `${name.slice(2)}.ts`));
      if (name.startsWith('.')) return load(`${resolve(dirname(absolute), name)}.ts`);
      return require(name);
    }, runtime, runtime.exports);
    return runtime.exports;
  }
  return load;
}

function closeDatabase() {
  globalThis[databaseKey]?.database.close();
  delete globalThis[databaseKey];
}

async function isolated(action) {
  const directory = await mkdtemp(join(tmpdir(), 'seven-sparkles-inventory-'));
  const previous = process.env.DATA_DIR;
  try {
    process.env.DATA_DIR = directory;
    const db = getDatabase();
    db.prepare('INSERT INTO categories (id,name,name_key,created_at,updated_at) VALUES (?,?,?,?,?)').run('skin', 'Skin', 'skin', '2026-01-01', '2026-01-01');
    db.prepare('INSERT INTO brands (id,name,name_key,created_at,updated_at) VALUES (?,?,?,?,?)').run('brand', 'Test brand', 'test brand', '2026-01-01', '2026-01-01');
    const saved = JSON.parse(db.prepare('SELECT value_json FROM settings WHERE id = 1').get().value_json);
    saved.shippingMethods = [{ id: 'post', name: 'Post', fee: 0, free: true, postpaid: false, enabled: true }];
    db.prepare('UPDATE settings SET value_json = ? WHERE id = 1').run(JSON.stringify(saved));
    const load = serviceLoader();
    const checkout = load('src/server/checkout.ts');
    const store = load('src/server/store.ts');
    const product = (options = {}) => {
      const item = { id: 'p', stock: 10, trackStock: true, availability: 'in_stock', variants: [], ...options };
      getDatabase().prepare(`INSERT INTO products (id,name,slug,brand,category,image,price,stock,status,created_at,updated_at,availability,track_stock,has_variants,variants_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(item.id, `Product ${item.id}`, item.id, 'Test brand', 'skin', '/images/products/dr-geno-ac-complex.webp', 100, item.stock, 'active', '2026-01-01', '2026-01-01', item.availability, Number(item.trackStock), Number(item.variants.length > 0), JSON.stringify(item.variants));
      return item;
    };
    const stock = (id = 'p') => Number(getDatabase().prepare('SELECT stock FROM products WHERE id = ?').get(id).stock);
    const variants = (id = 'v') => JSON.parse(getDatabase().prepare('SELECT variants_json FROM products WHERE id = ?').get(id).variants_json);
    const input = (items = [{ id: 'p', quantity: 2 }], changes = {}) => checkout.validateCheckout({
      idempotencyKey: randomUUID(), recipient: { name: 'Inventory test', phone: '09121234567' },
      address: { province: 'Tehran', city: 'Tehran', address: 'Test address, street 1', postalCode: '1234567890' },
      notes: '', shippingMethodId: 'post', items,
      expectedTotal: items.reduce((total, line) => {
        const row = getDatabase().prepare('SELECT price,variants_json FROM products WHERE id = ?').get(line.id);
        const variant = line.variantId && row ? JSON.parse(row.variants_json).find(item => item.id === line.variantId) : null;
        return total + Number(variant?.price ?? row?.price ?? 100) * line.quantity;
      }, 0), ...changes,
    });
    const submit = (items, changes) => checkout.createCheckoutOrder(input(items, changes));
    const order = id => getDatabase().prepare('SELECT * FROM orders WHERE id = ?').get(id);
    await action({ db, checkout, store, product, stock, variants, input, submit, order });
  } finally {
    closeDatabase();
    if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    const absolute = resolve(directory);
    assert.ok(absolute.startsWith(resolve(tmpdir()) + sep) && absolute.split(sep).at(-1).startsWith('seven-sparkles-inventory-'));
    await rm(absolute, { recursive: true, force: true });
  }
}

const conflict = action => assert.throws(action, error => error.status === 409);
const option = (id, stock, availability = 'in_stock') => ({ id, values: [id], sku: `SKU-${id}`, price: 100, stock, availability });

test('submitted orders deduct simple stock and idempotent retries cannot deduct twice', () => isolated(({ product, checkout, input, stock, order, store }) => {
  product({ stock: 2 });
  const request = input();
  const first = checkout.createCheckoutOrder(request);
  assert.equal(first.paymentStatus, 'unpaid');
  assert.equal(stock(), 0);
  assert.deepEqual(JSON.parse(order(first.id).stock_allocations_json), [{ productId: 'p', quantity: 2 }]);
  assert.equal(checkout.createCheckoutOrder(request).id, first.id);
  assert.equal(stock(), 0);
  conflict(() => checkout.createCheckoutOrder({ ...request, notes: 'Changed request' }));
  store.updateOrderStatus(first.id, 'cancelled');
  assert.equal(stock(), 2);
  conflict(() => checkout.createCheckoutOrder(request));
  assert.equal(stock(), 2, 'retrying a cancelled checkout never silently reopens it');
}));

test('only one order can consume the final unit and rejected orders leave no side effects', () => isolated(({ db, product, stock, submit }) => {
  product({ stock: 1 });
  submit([{ id: 'p', quantity: 1 }]);
  conflict(() => submit([{ id: 'p', quantity: 1 }]));
  assert.equal(stock(), 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customers').get().n, 1);
}));

test('multiple variants deduct independently without overwriting siblings or parent inventory', () => isolated(({ product, variants, stock, submit, store, order }) => {
  product({ id: 'v', stock: 99, variants: [option('small', 5), option('large', 7), option('other', 11)] });
  const saved = submit([{ id: 'v', variantId: 'small', quantity: 2 }, { id: 'v', variantId: 'large', quantity: 3 }]);
  assert.equal(stock('v'), 99);
  assert.deepEqual(variants().map(item => item.stock), [3, 4, 11]);
  assert.deepEqual(JSON.parse(order(saved.id).stock_allocations_json), [
    { productId: 'v', variantId: 'large', quantity: 3 }, { productId: 'v', variantId: 'small', quantity: 2 },
  ]);
  store.updateOrderStatus(saved.id, 'cancelled');
  assert.deepEqual(variants().map(item => item.stock), [5, 7, 11]);
  store.updateOrderStatus(saved.id, 'cancelled');
  assert.deepEqual(variants().map(item => item.stock), [5, 7, 11]);
}));

test('cancellation credits only that order and preserves other sales and later inventory edits', () => isolated(({ db, product, stock, submit, store }) => {
  product();
  const first = submit();
  submit([{ id: 'p', quantity: 1 }]);
  assert.equal(stock(), 7);
  db.prepare("UPDATE products SET stock = stock + 5, track_stock = 0 WHERE id = 'p'").run();
  for (const status of ['shipped', 'delivered', 'processing']) {
    store.updateOrderStatus(first.id, status);
    assert.equal(stock(), 12);
  }
  store.updateOrderStatus(first.id, 'cancelled');
  assert.equal(stock(), 14, 'credit adds the original two units instead of resetting stock to a stale snapshot');
  store.updateOrderStatus(first.id, 'cancelled');
  assert.equal(stock(), 14);
}));

test('reopening cancelled orders deducts again atomically and refuses insufficient stock', () => isolated(({ db, product, stock, submit, store, order }) => {
  product({ id: 'a', stock: 3 }); product({ id: 'b', stock: 3 });
  const saved = submit([{ id: 'a', quantity: 2 }, { id: 'b', quantity: 2 }]);
  store.updateOrderStatus(saved.id, 'cancelled');
  db.prepare("UPDATE products SET stock = 1 WHERE id = 'b'").run();
  conflict(() => store.updateOrderStatus(saved.id, 'processing'));
  assert.equal(order(saved.id).status, 'cancelled');
  assert.deepEqual([stock('a'), stock('b')], [3, 1], 'failure on the later line rolls back earlier deductions');
  db.prepare("UPDATE products SET stock = 3 WHERE id = 'b'").run();
  store.updateOrderStatus(saved.id, 'processing');
  assert.deepEqual([stock('a'), stock('b')], [1, 1]);
  store.updateOrderStatus(saved.id, 'shipped');
  assert.deepEqual([stock('a'), stock('b')], [1, 1]);
  store.updateOrderStatus(saved.id, 'cancelled');
  assert.deepEqual([stock('a'), stock('b')], [3, 3]);
}));

test('preorders and untracked products never create physical stock deductions or cancellation credits', () => isolated(({ db, product, variants, stock, submit, store, order }) => {
  product({ id: 'untracked', stock: 0, trackStock: false });
  product({ id: 'preorder', stock: 0, availability: 'preorder' });
  product({ id: 'v', stock: 9, variants: [option('future', 0, 'preorder')] });
  const saved = submit([{ id: 'untracked', quantity: 3 }, { id: 'preorder', quantity: 4 }, { id: 'v', variantId: 'future', quantity: 5 }]);
  assert.deepEqual(JSON.parse(order(saved.id).stock_allocations_json), []);
  db.prepare('UPDATE products SET track_stock = 1').run();
  store.updateOrderStatus(saved.id, 'cancelled');
  assert.deepEqual([stock('untracked'), stock('preorder'), stock('v'), variants()[0].stock], [0, 0, 9, 0]);
}));

test('invalid orders and database failures roll back all inventory and order/customer writes', () => isolated(({ db, product, variants, stock, submit }) => {
  product({ id: 'a', stock: 5 });
  product({ id: 'v', stock: 99, variants: [option('small', 5)] });
  const items = [{ id: 'a', quantity: 2 }, { id: 'v', variantId: 'small', quantity: 2 }];
  conflict(() => submit(items, { expectedTotal: 1 }));
  conflict(() => submit([...items, { id: 'missing', quantity: 1 }]));
  db.exec("CREATE TRIGGER reject_inventory_order BEFORE INSERT ON orders BEGIN SELECT RAISE(ABORT, 'Inventory transaction test'); END;");
  assert.throws(() => submit(items), /Inventory transaction test/);
  assert.equal(stock('a'), 5); assert.equal(variants()[0].stock, 5);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customers').get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE key LIKE 'checkout:%'").get().n, 0);
}));

test('missing original variants prevent partial cancellation and soft-deleted products still receive their stock', () => isolated(({ db, product, variants, stock, submit, store, order }) => {
  product({ id: 'a', stock: 5 });
  product({ id: 'v', variants: [option('small', 5)] });
  const saved = submit([{ id: 'a', quantity: 2 }, { id: 'v', variantId: 'small', quantity: 2 }]);
  const savedVariants = variants();
  db.prepare("UPDATE products SET variants_json = '[]' WHERE id = 'v'").run();
  conflict(() => store.updateOrderStatus(saved.id, 'cancelled'));
  assert.equal(stock('a'), 3); assert.equal(order(saved.id).status, 'processing');
  db.prepare("UPDATE products SET variants_json = ? WHERE id = 'v'").run(JSON.stringify(savedVariants));
  db.prepare("UPDATE products SET deleted_at = '2026-01-01', status = 'archived' WHERE id = 'a'").run();
  store.updateOrderStatus(saved.id, 'cancelled');
  assert.equal(stock('a'), 5); assert.equal(variants()[0].stock, 5);
}));

test('legacy orders never receive stock credits for quantities that were not deducted', () => isolated(({ db, product, stock, submit, store, order }) => {
  product();
  const original = submit();
  db.prepare('INSERT INTO orders (id,user_id,created_at,status,items_json) VALUES (?,?,?,?,?)').run('legacy', order(original.id).user_id, '2025-01-01', 'processing', JSON.stringify([{ productId: 'p', quantity: 4, price: 100, name: 'Legacy product' }]));
  assert.equal(order('legacy').stock_allocations_json, null);
  store.updateOrderStatus('legacy', 'cancelled');
  store.updateOrderStatus('legacy', 'processing');
  store.updateOrderStatus('legacy', 'cancelled');
  assert.equal(stock(), 8);
  store.updateOrderStatus(original.id, 'cancelled');
  assert.equal(stock(), 10);
}));

test('stock allocations survive database restarts and remain idempotent after cancellation', () => isolated(({ product, stock, submit, store, order }) => {
  product();
  const saved = submit();
  closeDatabase();
  assert.equal(stock(), 8);
  assert.deepEqual(JSON.parse(order(saved.id).stock_allocations_json), [{ productId: 'p', quantity: 2 }]);
  store.updateOrderStatus(saved.id, 'cancelled');
  closeDatabase();
  store.updateOrderStatus(saved.id, 'cancelled');
  assert.equal(stock(), 10);
}));

test('upgrading the previous schema preserves historical quantities without inventing stock credits', () => isolated(({ db, product, stock, submit, store, order }) => {
  product();
  const historical = submit();
  // Recreate version 9: orders existed, but submission did not deduct inventory.
  db.prepare("UPDATE products SET stock = 10 WHERE id = 'p'").run();
  db.exec('ALTER TABLE orders DROP COLUMN stock_allocations_json; DELETE FROM schema_migrations WHERE version = 10;');
  closeDatabase();
  assert.equal(stock(), 10);
  assert.equal(order(historical.id).stock_allocations_json, null);
  store.updateOrderStatus(historical.id, 'cancelled');
  assert.equal(stock(), 10);
  const current = submit();
  assert.equal(stock(), 8);
  assert.deepEqual(JSON.parse(order(current.id).stock_allocations_json), [{ productId: 'p', quantity: 2 }]);
}));
