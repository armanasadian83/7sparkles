import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../server/database.mjs';
import ts from 'typescript';

async function loadRuntimeHelper(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const runtimeModule = { exports: {} };
  const requireDependency = name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected runtime dependency: ${name}`);
    return dependencies[name];
  };
  // Exercise the actual TypeScript modules without requiring a loader or a
  // Node release that strips TypeScript; erased type imports need no mocks.
  new Function('require', 'module', 'exports', compiled)(requireDependency, runtimeModule, runtimeModule.exports);
  return runtimeModule.exports;
}

test('shipping choices use configured methods only, respect free delivery, and fall back only to enabled methods', async () => {
  const { getShippingMethods, resolveShippingMethod } = await loadRuntimeHelper('../src/lib/shipping.ts');
  const settings = { shippingMethods: [
    { id: 'courier-free', name: 'ارسال رایگان فروشگاه', fee: 9000, free: true, enabled: true },
    { id: 'courier-paid', name: 'پیک شهری', fee: 75000, free: false, enabled: true },
    { id: 'courier-postpaid', name: 'تیپاکس پس‌کرایه', fee: 85000, free: false, postpaid: true, enabled: true },
  ], shippingFee: 99, postShippingEnabled: true, tipaxShippingEnabled: true, freeShippingThreshold: 1 };
  const post = { id: 'courier-free', name: 'ارسال رایگان فروشگاه', fee: 0, postpaid: false };
  const tipax = { id: 'courier-paid', name: 'پیک شهری', fee: 75000, postpaid: false };
  const postpaid = { id: 'courier-postpaid', name: 'تیپاکس پس‌کرایه', fee: 0, postpaid: true };
  assert.deepEqual(getShippingMethods(settings), [post, tipax, postpaid]);
  assert.deepEqual(resolveShippingMethod(settings, post.id), post);
  assert.deepEqual(resolveShippingMethod(settings, tipax.id), tipax);
  assert.deepEqual(resolveShippingMethod(settings, postpaid.id), postpaid);
  assert.deepEqual(resolveShippingMethod(settings, null), post);
  assert.deepEqual(getShippingMethods({ shippingFee: 75000, postShippingEnabled: true, tipaxShippingEnabled: true }), [], 'legacy flags never manufacture methods');
  const disable = id => ({ ...settings, shippingMethods: settings.shippingMethods.map(method => ({ ...method, enabled: method.id !== id })) });
  assert.deepEqual(resolveShippingMethod(disable(post.id), post.id), tipax);
  assert.deepEqual(resolveShippingMethod(disable(tipax.id), tipax.id), post);
  assert.deepEqual(resolveShippingMethod(settings, 'removed-method'), post);
  const disabled = { ...settings, shippingMethods: settings.shippingMethods.map(method => ({ ...method, enabled: false })) };
  assert.deepEqual(getShippingMethods(disabled), []);
  assert.equal(resolveShippingMethod(disabled, tipax.id), null);
  assert.deepEqual(getShippingMethods(null), []);
  assert.deepEqual(getShippingMethods({ shippingMethods: [] }), []);
  assert.equal(resolveShippingMethod(null, post.id), null);
  assert.equal(resolveShippingMethod({ shippingMethods: [{ ...settings.shippingMethods[1], fee: 0 }] }, tipax.id).fee, 0);
});

test('cart totals charge the selected delivery once, ignore the obsolete threshold, and export the real method', async () => {
  const [products, shipping] = await Promise.all([
    loadRuntimeHelper('../src/lib/products.ts'),
    loadRuntimeHelper('../src/lib/shipping.ts'),
  ]);
  const { resolveCartLines, getCartTotals, buildCartShoppingList } = await loadRuntimeHelper('../src/lib/cart.ts', { './products': products, './shipping': shipping });
  const settings = { shippingMethods: [
    { id: 'post', name: 'ارسال با پست', fee: 0, free: true, enabled: true },
    { id: 'tipax', name: 'ارسال با تیپاکس', fee: 75000, free: false, enabled: true },
    { id: 'postpaid', name: 'تیپاکس پس‌کرایه', fee: 90000, free: false, postpaid: true, enabled: true },
  ], freeShippingThreshold: 1 };
  const product = { id: 'serum', name: 'سرم آبرسان', price: 1_000_000, salePrice: 800_000, size: '۳۰ میلی‌لیتر', hasVariants: false, variants: [], stock: 10, trackStock: true, availability: 'in_stock' };
  const other = { ...product, id: 'cleanser', name: 'شوینده صورت', price: 500_000, salePrice: null };
  const lines = resolveCartLines([{ id: product.id, quantity: 2 }, { id: other.id, quantity: 3 }], [product, other]);
  assert.equal(lines.length, 2);
  const post = { id: 'post', name: 'ارسال با پست', fee: 0, postpaid: false };
  const tipax = { id: 'tipax', name: 'ارسال با تیپاکس', fee: 75000, postpaid: false };
  const postpaid = { id: 'postpaid', name: 'تیپاکس پس‌کرایه', fee: 0, postpaid: true };
  const base = { totalQuantity: 5, originalSubtotal: 3_500_000, productSubtotal: 3_100_000, discount: 400_000 };
  assert.deepEqual(getCartTotals(lines, settings), { ...base, shipping: 0, total: 3_100_000, shippingMethod: post });
  const tipaxTotals = getCartTotals(lines, settings, 'tipax');
  assert.deepEqual(tipaxTotals, { ...base, shipping: 75000, total: 3_175_000, shippingMethod: tipax });
  const postpaidTotals = getCartTotals(lines, settings, 'postpaid');
  assert.deepEqual(postpaidTotals, { ...base, shipping: 0, total: 3_100_000, shippingMethod: postpaid }, 'postpaid carrier cost is not an upfront charge');
  assert.equal(getCartTotals(lines, { ...settings, freeShippingThreshold: 0 }, 'tipax').shipping, 75000);
  assert.equal(getCartTotals(lines, { ...settings, freeShippingThreshold: 99_000_000 }, 'tipax').shipping, 75000);
  assert.deepEqual(getCartTotals(lines, { ...settings, shippingMethods: [{ ...settings.shippingMethods[0] }, { ...settings.shippingMethods[1], enabled: false }] }, 'tipax'), { ...base, shipping: 0, total: 3_100_000, shippingMethod: post });
  assert.deepEqual(getCartTotals(lines, { ...settings, shippingMethods: [{ ...settings.shippingMethods[0], enabled: false }, { ...settings.shippingMethods[1] }] }), { ...base, shipping: 75000, total: 3_175_000, shippingMethod: tipax });
  for (const unavailable of [null, { shippingMethods: [] }, { ...settings, shippingMethods: settings.shippingMethods.map(method => ({ ...method, enabled: false })) }]) {
    assert.deepEqual(getCartTotals(lines, unavailable, 'tipax'), { ...base, shipping: 0, total: 3_100_000, shippingMethod: null });
  }
  assert.deepEqual(getCartTotals([], settings, 'tipax'), { totalQuantity: 0, originalSubtotal: 0, productSubtotal: 0, discount: 0, shipping: 0, total: 0, shippingMethod: tipax });
  const list = buildCartShoppingList(lines, tipaxTotals, 'فروشگاه آزمون');
  assert.ok(list.includes('روش ارسال: ارسال با تیپاکس'));
  assert.ok(list.includes(`هزینه ارسال برآوردی: ${products.formatPrice(75000)} تومان`));
  assert.ok(list.includes(`مبلغ کل برآوردی: ${products.formatPrice(3_175_000)} تومان`));
  assert.ok(list.includes('سفارش ثبت نشده و پرداختی انجام نشده است'));
  assert.ok(buildCartShoppingList(lines, getCartTotals(lines, settings), 'آزمون').includes('روش ارسال: ارسال با پست'));
  assert.ok(buildCartShoppingList(lines, getCartTotals(lines, null), 'آزمون').includes('روش ارسال: روش ارسالی فعال نیست'));
  const postpaidList = buildCartShoppingList(lines, postpaidTotals, 'آزمون');
  assert.ok(postpaidList.includes('روش ارسال: تیپاکس پس‌کرایه'));
  assert.match(postpaidList, /پس[\u200c ]?کرایه/);
  assert.match(postpaidList, /(?:تحویل|دریافت)/, 'carrier fee must be explicitly payable on delivery');
  assert.ok(postpaidList.includes(products.formatPrice(3_100_000)), 'shopping list excludes the later carrier fee from current total');
  assert.doesNotMatch(postpaidList, /هزینه ارسال برآوردی: (?:۰ تومان|رایگان)/, 'postpaid must not masquerade as free delivery');
});

test('product slugs normalize English and Persian while rejecting unsafe or ambiguous URL segments', async () => {
  const source = await readFile(new URL('../src/lib/product-slug.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { normalizeProductSlug, isValidProductSlug } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  assert.equal(normalizeProductSlug('  SOOTHING-HYDRATING  '), 'soothing-hydrating');
  assert.equal(normalizeProductSlug('ا\u0653برسان'), 'آبرسان');
  for (const slug of ['novoselix-serum', 'سرم-آبرسان-۳۰', 'كريم-مرطب-٢', 'a', '0', 'a'.repeat(160)]) assert.equal(isValidProductSlug(slug), true, slug);
  for (const slug of ['', 'Uppercase', 'a b', 'a--b', '-a', 'a-', 'a/b', 'a\\b', '.', '..', 'a.b', 'a_b', '%2f', 'a?b', 'a#b', 'a\u200cb', 'a\u200fb', 'a\u0000b', 'a\nb', '中文', 'a'.repeat(161)]) assert.equal(isValidProductSlug(slug), false, JSON.stringify(slug));
});

test('basket rules keep variant prices, stock limits, preorders, and inquiry-only prices distinct', async () => {
  // Compile the actual shared helpers for all supported Node 22 releases, including
  // versions before built-in TypeScript stripping was enabled by default.
  const source = await readFile(new URL('../src/lib/products.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { getProductPrice, getProductStockLimit, isProductAvailable } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const product = { hasVariants: false, price: 1_000_000, salePrice: 800_000, stock: 5, trackStock: true, availability: 'in_stock' };
  assert.equal(getProductPrice(product), 800_000);
  assert.equal(isProductAvailable(product), true);
  assert.equal(getProductStockLimit(product), 5);
  assert.equal(getProductStockLimit({ ...product, stock: 0 }), 0);
  assert.equal(isProductAvailable({ ...product, stock: 0 }), false);
  assert.equal(getProductStockLimit({ ...product, stock: 0, trackStock: false }), 99);
  assert.equal(getProductStockLimit({ ...product, stock: 0, availability: 'preorder' }), 99);
  assert.equal(getProductStockLimit({ ...product, trackStock: false, availability: 'out_of_stock' }), 0);

  const available = { id: 'small', price: 1_200_000, stock: 2, availability: 'in_stock' };
  const preorder = { id: 'large', price: null, stock: 0, availability: 'preorder' };
  const variable = { ...product, hasVariants: true, variants: [available, preorder] };
  assert.equal(getProductPrice(variable), null);
  assert.equal(isProductAvailable(variable), false);
  assert.equal(getProductStockLimit(variable), 0);
  assert.equal(getProductPrice(variable, available), 1_200_000);
  assert.equal(getProductStockLimit(variable, available), 2);
  assert.equal(getProductPrice(variable, preorder), null);
  assert.equal(getProductStockLimit(variable, preorder), 99);
  assert.equal(getProductStockLimit({ ...variable, availability: 'out_of_stock' }, preorder), 0);
  assert.equal(getProductStockLimit(variable, { ...available, availability: 'out_of_stock' }), 0);
  assert.equal(getProductStockLimit({ ...variable, availability: 'preorder' }, { ...available, stock: 0 }), 0);
  assert.equal(getProductPrice(variable, { ...available, price: 0 }), 0);
});

test('migrations preserve legacy products and backfill unique slugs even when IDs differ only in casing or separators', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seven-sparkles-migration-'));
  const previousDirectory = process.env.DATA_DIR;
  let migrated;
  try {
    const legacy = new DatabaseSync(join(directory, 'store.sqlite'));
    legacy.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES (1, '2026-01-01');
      CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL UNIQUE, city TEXT NOT NULL DEFAULT '', joined_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES customers(id), created_at TEXT NOT NULL, status TEXT NOT NULL, items_json TEXT NOT NULL CHECK (json_valid(items_json)));
      INSERT INTO customers VALUES ('legacy-customer', 'Legacy recipient', '09123456789', 'Legacy city', '2026-01-01', 1);
      INSERT INTO orders VALUES ('legacy-order', 'legacy-customer', '2026-01-01', 'delivered', '[{"productId":"legacy","name":"Old item","quantity":2,"price":45000}]');
      CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL, english_name TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL, category TEXT NOT NULL,
        image TEXT NOT NULL, price INTEGER, stock INTEGER NOT NULL DEFAULT 0, size TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO products VALUES ('legacy', 'Legacy product', '', 'Genosys', 'skin', '/images/products/dr-geno-trx-complex.png', 45000, 5, '30ml', 'Original description', 'active', '2026-01-01', '2026-01-01');
      INSERT INTO products SELECT 'Legacy', name, english_name, brand, category, image, price, stock, size, description, status, created_at, updated_at FROM products WHERE id = 'legacy';
      INSERT INTO products SELECT 'legacy_', name, english_name, brand, category, image, price, stock, size, description, status, created_at, updated_at FROM products WHERE id = 'legacy';
      UPDATE products SET status = 'archived' WHERE id = 'legacy_';
    `);
    process.env.DATA_DIR = directory;
    // Simulate Next.js hot reload retaining a connection created by migration 1.
    globalThis[Symbol.for('seven-sparkles.sqlite')] = { directory, database: legacy };
    migrated = getDatabase();
    assert.equal(migrated, legacy);
    const row = migrated.prepare('SELECT * FROM products WHERE id = ?').get('legacy');
    assert.equal(row.price, 45000);
    assert.equal(row.description, 'Original description');
    assert.equal(row.availability, 'in_stock');
    assert.equal(row.track_stock, 1);
    assert.equal(row.has_variants, 0);
    assert.deepEqual(JSON.parse(row.images_json), [{ id: 'main', url: row.image, alt: row.name, caption: '' }]);
    assert.deepEqual(migrated.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row => row.version), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const order = migrated.prepare('SELECT * FROM orders WHERE id = ?').get('legacy-order');
    assert.equal(order.status, 'delivered');
    assert.equal(JSON.parse(order.items_json)[0].quantity, 2);
    assert.equal(order.checkout_json, '{}');
    assert.equal(order.checkout_key_hash, null);
    assert.equal(order.checkout_payload_hash, null);
    assert.equal(row.short_description_html, '');
    assert.equal(row.usage_instructions, '');
    assert.equal(row.suitable_for, '');
    assert.equal(row.shipping_returns, '');
    assert.deepEqual(migrated.prepare('SELECT slug FROM products ORDER BY slug').all().map(row => row.slug), ['product-legacy', 'product-legacy-2', 'product-legacy-3']);
    assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM product_reviews').get().count, 0);
    assert.throws(() => migrated.prepare('UPDATE products SET slug = ? WHERE id = ?').run('product-legacy', 'legacy'), /UNIQUE constraint failed/);
    assert.equal(getDatabase(), migrated);
    assert.equal(globalThis[Symbol.for('seven-sparkles.sqlite')].schemaVersion, 9);
    assert.equal(row.deleted_at, null);
    assert.equal(row.restore_status, null);
    assert.deepEqual({ ...migrated.prepare('SELECT status, deleted_at, restore_status FROM products WHERE id = ?').get('legacy_') }, { status: 'archived', deleted_at: '2026-01-01', restore_status: 'draft' });
    assert.deepEqual(migrated.prepare('SELECT id, name FROM categories').all().map(row => ({ ...row })), [{ id: 'skin', name: 'مراقبت پوست' }]);
    assert.deepEqual(migrated.prepare('SELECT name FROM brands').all().map(row => row.name), ['Genosys']);
  } finally {
    migrated?.close();
    delete globalThis[Symbol.for('seven-sparkles.sqlite')];
    if (previousDirectory === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDirectory;
    const absolute = resolve(directory);
    assert.ok(absolute.startsWith(resolve(tmpdir()) + sep) && absolute.split(sep).at(-1).startsWith('seven-sparkles-migration-'));
    await rm(absolute, { recursive: true, force: true });
  }
});

test('catalog migration preserves full v3 product metadata and reviews, and enforces category and brand foreign keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seven-sparkles-migration-'));
  const previousDirectory = process.env.DATA_DIR;
  let migrated;
  try {
    const legacy = new DatabaseSync(join(directory, 'store.sqlite'));
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES (1, '2026-01-01'), (2, '2026-01-01'), (3, '2026-01-01');
      CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, items_json TEXT NOT NULL CHECK (json_valid(items_json)));
      CREATE TABLE products (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, english_name TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL, category TEXT NOT NULL,
        image TEXT NOT NULL, price INTEGER, stock INTEGER NOT NULL DEFAULT 0, size TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        short_description TEXT NOT NULL DEFAULT '', description_html TEXT NOT NULL DEFAULT '', sale_price INTEGER,
        availability TEXT NOT NULL DEFAULT 'in_stock', track_stock INTEGER NOT NULL DEFAULT 1, sku TEXT NOT NULL DEFAULT '',
        images_json TEXT NOT NULL DEFAULT '[]', attributes_json TEXT NOT NULL DEFAULT '[]', tags_json TEXT NOT NULL DEFAULT '[]',
        has_variants INTEGER NOT NULL DEFAULT 0, variant_options_json TEXT NOT NULL DEFAULT '[]', variants_json TEXT NOT NULL DEFAULT '[]',
        slug TEXT NOT NULL, usage_instructions TEXT NOT NULL DEFAULT '', suitable_for TEXT NOT NULL DEFAULT '', shipping_returns TEXT NOT NULL DEFAULT ''
      );
      CREATE UNIQUE INDEX products_slug_unique ON products(slug);
      CREATE INDEX products_status_created ON products(status, created_at);
      INSERT INTO products VALUES ('v3-product', 'محصول قبلی', 'Existing product', 'Novoselix', 'hair', '/images/products/dr-geno-trx-complex.png',
        45000, 5, '30ml', 'Original description', 'active', '2026-01-01', '2026-02-01', 'Short description', '<p>Rich description</p>', 40000,
        'preorder', 0, 'OLD-SKU', '[{"id":"main","url":"/images/products/dr-geno-trx-complex.png","alt":"original","caption":"front"}]',
        '[{"name":"حجم","value":"30ml"}]', '["previous"]', 1, '[{"id":"size","name":"Size","values":["30ml"]}]',
        '[{"id":"small","values":["30ml"],"sku":"OLD-SMALL","price":40000,"stock":2,"availability":"in_stock"}]',
        'previous-product', 'Original usage', 'Original suitable', 'Original shipping');
      CREATE TABLE product_reviews (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        author TEXT NOT NULL, body TEXT NOT NULL, rating INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX product_reviews_product_status ON product_reviews(product_id, status, created_at DESC);
      INSERT INTO product_reviews VALUES ('old-published', 'v3-product', 'مشتری قبلی', 'بازخورد قبلی', 5, 'published', '2026-02-02');
      INSERT INTO product_reviews VALUES ('old-pending', 'v3-product', 'دیگر', 'خصوصی', 3, 'pending', '2026-02-03');
    `);
    const originalProduct = { ...legacy.prepare('SELECT * FROM products').get() };
    const originalReviews = legacy.prepare('SELECT * FROM product_reviews ORDER BY id').all().map(row => ({ ...row }));
    process.env.DATA_DIR = directory;
    globalThis[Symbol.for('seven-sparkles.sqlite')] = { directory, database: legacy, schemaVersion: 3 };
    migrated = getDatabase();
    assert.deepEqual({ ...migrated.prepare('SELECT * FROM products').get() }, { ...originalProduct, deleted_at: null, restore_status: null, short_description_html: '' });
    assert.equal(migrated.prepare('SELECT short_description FROM products').get().short_description, 'Short description');
    assert.deepEqual(migrated.prepare('SELECT * FROM product_reviews ORDER BY id').all().map(row => ({ ...row })), originalReviews);
    assert.deepEqual(migrated.prepare('SELECT id, name FROM categories').all().map(row => ({ ...row })), [{ id: 'hair', name: 'مراقبت مو' }]);
    assert.deepEqual(migrated.prepare('SELECT name FROM brands').all().map(row => row.name), ['Novoselix']);
    assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(), []);
    assert.throws(() => migrated.prepare('DELETE FROM categories WHERE id = ?').run('hair'), /FOREIGN KEY constraint failed/);
    assert.throws(() => migrated.prepare('UPDATE products SET category = ?').run('missing'), /FOREIGN KEY constraint failed/);
    assert.throws(() => migrated.prepare('UPDATE products SET brand = ?').run('missing'), /FOREIGN KEY constraint failed/);
    migrated.prepare('UPDATE brands SET name = ? WHERE name = ?').run('Renamed legacy brand', 'Novoselix');
    assert.equal(migrated.prepare('SELECT brand FROM products').get().brand, 'Renamed legacy brand');
    assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(), []);
    migrated.prepare('DELETE FROM products WHERE id = ?').run('v3-product');
    assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM product_reviews').get().count, 0);
  } finally {
    migrated?.close();
    delete globalThis[Symbol.for('seven-sparkles.sqlite')];
    if (previousDirectory === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDirectory;
    const absolute = resolve(directory);
    assert.ok(absolute.startsWith(resolve(tmpdir()) + sep) && absolute.split(sep).at(-1).startsWith('seven-sparkles-migration-'));
    await rm(absolute, { recursive: true, force: true });
  }
});

test('database-backed admin, catalog, uploads, access control, and restart persistence', { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'seven-sparkles-test-'));
  const listener = createServer();
  await new Promise((accept, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', accept); });
  const port = listener.address().port;
  await new Promise(accept => listener.close(accept));
  const origin = `http://127.0.0.1:${port}`;
  const setupKey = randomBytes(32).toString('hex');
  const password = randomBytes(24).toString('base64url');
  let child;
  let output = '';
  let cookie = '';
  let categoryId;
  let brandId;
  let checkoutReceipt;

  async function start() {
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: process.cwd(), windowsHide: true,
      env: { ...process.env, NODE_ENV: 'production', DATA_DIR: directory, APP_URL: origin, ADMIN_SETUP_KEY: setupKey },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', value => { output += value.toString(); });
    child.stderr.on('data', value => { output += value.toString(); });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Test server exited: ${output}`);
      try { if ((await fetch(`${origin}/api/health`)).ok) return; } catch { /* Wait for this owned server. */ }
      await new Promise(accept => setTimeout(accept, 150));
    }
    throw new Error(`Test server did not become ready: ${output}`);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const ended = new Promise(accept => child.once('exit', accept));
    child.kill();
    await ended;
  }
  async function request(path, { method = 'GET', body, authenticated = true, requestOrigin = origin } = {}) {
    const headers = { Origin: requestOrigin };
    if (authenticated && cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  }
  async function data(response, status = 200) {
    const body = await response.json();
    assert.equal(response.status, status, JSON.stringify(body));
    return body;
  }
  async function pageRedirect(response, destination) {
    const location = response.headers.get('location');
    if (location) {
      assert.ok([307, 308].includes(response.status));
      assert.equal(new URL(location, origin).pathname, destination);
      return;
    }
    // Next.js can send a redirect in a streamed Suspense response after headers.
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(destination));
    assert.match(html, /NEXT_REDIRECT|http-equiv="refresh"/i);
  }

  try {
    await start();
    await t.test('a fresh database is empty and admin API is protected', async () => {
      const catalog = await data(await request('/api/catalog'));
      assert.deepEqual(catalog.products, []);
      assert.deepEqual(catalog.categories, []);
      assert.deepEqual(catalog.brands, []);
      assert.equal(catalog.settings.postShippingEnabled, true);
      assert.equal(catalog.settings.tipaxShippingEnabled, true);
      assert.deepEqual(catalog.settings.shippingMethods, []);
      await pageRedirect(await request('/admin/products/new', { authenticated: false }), '/admin/setup');
      await pageRedirect(await request('/admin/products/does-not-exist/edit', { authenticated: false }), '/admin/setup');
      await data(await request('/api/admin', { authenticated: false }), 401);
      await data(await request('/api/admin/products', { method: 'POST', body: {}, authenticated: false }), 401);
      await data(await request('/api/admin/products/missing', { method: 'DELETE', authenticated: false }), 401);
      await data(await request('/api/admin/shipping', { method: 'PUT', body: { shippingMethods: [] }, authenticated: false }), 401);
      for (const kind of ['product', 'category', 'brand']) {
        await data(await request(`/api/admin/trash/${kind}/missing`, { method: 'POST', authenticated: false }), 401);
        await data(await request(`/api/admin/trash/${kind}/missing`, { method: 'DELETE', authenticated: false }), 401);
      }
      for (const path of ['categories', 'brands']) {
        await data(await request(`/api/admin/${path}`, { method: 'POST', body: {}, authenticated: false }), 401);
        await data(await request(`/api/admin/${path}/missing`, { method: 'PUT', body: {}, authenticated: false }), 401);
        await data(await request(`/api/admin/${path}/missing`, { method: 'DELETE', authenticated: false }), 401);
      }
      await data(await request('/api/admin/auth/setup', { method: 'POST', body: { setupKey: 'wrong' } }), 403);
      const response = await request('/api/admin/auth/setup', { method: 'POST', body: { setupKey, email: 'owner@example.invalid', name: 'Test owner', password } });
      await data(response, 201);
      const session = response.headers.get('set-cookie');
      assert.match(session, /HttpOnly/i);
      assert.match(session, /SameSite=Lax/i);
      cookie = session.split(';')[0];
      const { snapshot } = await data(await request('/api/admin'));
      assert.deepEqual([snapshot.products.length, snapshot.users.length, snapshot.orders.length], [0, 0, 0]);
      assert.deepEqual([snapshot.categories.length, snapshot.brands.length], [0, 0]);
      assert.deepEqual(snapshot.trash, []);
      await data(await request('/api/admin/auth/setup', { method: 'POST', body: { setupKey, email: 'another@example.invalid', name: 'Another', password } }), 409);
    });

    await t.test('shipping methods start empty, validate strictly, persist custom fees, and survive stale general settings saves', async () => {
      const original = (await data(await request('/api/catalog'))).settings;
      const db = new DatabaseSync(join(directory, 'store.sqlite'));
      try {
        // The original settings row predates the shipping controls. Reading
        // defaults must not silently rewrite the row or invent fixed methods.
        const legacyRow = JSON.parse(db.prepare('SELECT value_json FROM settings WHERE id = 1').get().value_json);
        assert.equal(legacyRow.postShippingEnabled, undefined);
        assert.equal(legacyRow.tipaxShippingEnabled, undefined);
        assert.equal(legacyRow.shippingMethods, undefined);
        assert.equal(original.postShippingEnabled, true);
        assert.equal(original.tipaxShippingEnabled, true);
        assert.deepEqual(original.shippingMethods, []);

        const free = { id: 'post-free', name: 'ارسال با پست', fee: 0, free: true, postpaid: false, enabled: true };
        const paid = { id: 'tipax-paid', name: 'ارسال با تیپاکس', fee: 78000, free: false, postpaid: false, enabled: true };
        const postpaid = { id: 'tipax-postpaid', name: 'تیپاکس پس‌کرایه', fee: 0, free: false, postpaid: true, enabled: true };
        const valid = { shippingMethods: [free, paid] };
        await data(await request('/api/admin/shipping', { method: 'PUT', body: valid, requestOrigin: 'https://untrusted.invalid' }), 403);
        for (const invalid of [
          {}, null, [],
          { shippingMethods: null }, { shippingMethods: {} },
          { shippingMethods: Array.from({ length: 31 }, (_, index) => ({ ...paid, id: `method-${index}` })) },
          ...[null, [], {}, { ...paid, id: '' }, { ...paid, id: 'unsafe/id' }, { ...paid, id: 'x'.repeat(101) },
            { ...paid, name: '' }, { ...paid, name: '  ' }, { ...paid, name: 'x'.repeat(101) }, { ...paid, name: 'bad\u0000name' }, { ...paid, name: 'bad\u0085name' }, { ...paid, name: 'bad\u202ename' }, { ...paid, name: '\nname' },
            { ...paid, enabled: 'true' }, { ...paid, enabled: null }, { ...paid, free: 1 }, { ...paid, free: null },
            { ...paid, postpaid: 'true' }, { ...paid, postpaid: null }, { ...paid, postpaid: 1 }, { ...free, postpaid: true },
            { ...paid, fee: -1 }, { ...paid, fee: 1.5 }, { ...paid, fee: '78000' }, { ...paid, fee: null }, { ...paid, fee: 1_000_000_000_001 },
            { ...postpaid, fee: -1 }, { ...postpaid, fee: 1.5 }, { ...postpaid, fee: '78000' }, { ...postpaid, fee: null }, { ...postpaid, fee: 1_000_000_000_001 },
          ].map(method => ({ shippingMethods: [method] })),
          { shippingMethods: [paid, { ...free, id: paid.id }] },
          { shippingMethods: [paid, { ...free, id: paid.id.toUpperCase() }] },
        ]) await data(await request('/api/admin/shipping', { method: 'PUT', body: invalid }), 422);
        assert.deepEqual(JSON.parse(db.prepare('SELECT value_json FROM settings WHERE id = 1').get().value_json), legacyRow);

        // Selecting free normalizes a retained numeric fee to zero. Other
        // settings sent to this dedicated endpoint cannot overwrite the store.
        const result = await data(await request('/api/admin/shipping', { method: 'PUT', body: { shippingMethods: [{ ...free, name: `  ${free.name}  `, fee: 9000 }, paid], storeName: 'Unrelated overwrite', announcement: 'Unrelated overwrite', freeShippingThreshold: 999999 } }));
        const expected = { ...original, ...valid };
        assert.deepEqual(result.snapshot.settings, expected);
        assert.deepEqual((await data(await request('/api/catalog'))).settings, expected);
        assert.deepEqual(JSON.parse(db.prepare('SELECT value_json FROM settings WHERE id = 1').get().value_json), expected);

        const legacyPayload = { ...expected, announcement: 'Older client retained shipping controls', shippingMethods: [] };
        delete legacyPayload.postShippingEnabled;
        delete legacyPayload.tipaxShippingEnabled;
        const legacySave = await data(await request('/api/admin/settings', { method: 'PUT', body: legacyPayload }));
        assert.equal(legacySave.snapshot.settings.postShippingEnabled, true);
        assert.equal(legacySave.snapshot.settings.tipaxShippingEnabled, true);
        assert.deepEqual(legacySave.snapshot.settings.shippingMethods, valid.shippingMethods);
        assert.equal(legacySave.snapshot.settings.announcement, legacyPayload.announcement);
        delete legacyPayload.shippingMethods;
        const oldClientSave = await data(await request('/api/admin/settings', { method: 'PUT', body: legacyPayload }));
        assert.deepEqual(oldClientSave.snapshot.settings.shippingMethods, valid.shippingMethods);
        await data(await request('/api/admin/settings', { method: 'PUT', body: { ...expected, postShippingEnabled: 'true' } }), 422);

        // Postpaid is neither free delivery nor an upfront shipping charge.
        // Normalize a retained editor price, persist its mode, and expose the
        // mode consistently through both authenticated and public endpoints.
        const postpaidResult = await data(await request('/api/admin/shipping', { method: 'PUT', body: { shippingMethods: [free, paid, { ...postpaid, fee: 99000 }] } }));
        assert.deepEqual(postpaidResult.snapshot.settings.shippingMethods, [free, paid, postpaid]);
        assert.deepEqual((await data(await request('/api/catalog'))).settings.shippingMethods, [free, paid, postpaid]);
        assert.deepEqual((await data(await request('/api/admin'))).snapshot.settings.shippingMethods, [free, paid, postpaid]);
        const persistedPostpaid = JSON.parse(db.prepare('SELECT value_json FROM settings WHERE id = 1').get().value_json);
        assert.deepEqual(persistedPostpaid.shippingMethods, [free, paid, postpaid]);
        const preservedPostpaid = await data(await request('/api/admin/settings', { method: 'PUT', body: expected }));
        assert.deepEqual(preservedPostpaid.snapshot.settings.shippingMethods, [free, paid, postpaid], 'stale general settings cannot erase postpaid');

        // Old clients and JSON rows predate postpaid. Omission means false;
        // reading the legacy row must not silently rewrite the database.
        const withoutPostpaid = valid.shippingMethods.map(method => {
          const legacyMethod = { ...method };
          delete legacyMethod.postpaid;
          return legacyMethod;
        });
        const legacyShippingRow = { ...expected, shippingMethods: withoutPostpaid };
        db.prepare('UPDATE settings SET value_json = ? WHERE id = 1').run(JSON.stringify(legacyShippingRow));
        assert.deepEqual((await data(await request('/api/catalog'))).settings.shippingMethods, valid.shippingMethods);
        assert.deepEqual(JSON.parse(db.prepare('SELECT value_json FROM settings WHERE id = 1').get().value_json), legacyShippingRow);
        const oldShippingClient = await data(await request('/api/admin/shipping', { method: 'PUT', body: { shippingMethods: withoutPostpaid } }));
        assert.deepEqual(oldShippingClient.snapshot.settings.shippingMethods, valid.shippingMethods);
        assert.deepEqual(JSON.parse(db.prepare('SELECT value_json FROM settings WHERE id = 1').get().value_json).shippingMethods, valid.shippingMethods);

        // Disabling retains method identity and price. A zero priced custom
        // method is valid, as is an empty list before anything is configured.
        const disabledMethods = valid.shippingMethods.map(method => ({ ...method, enabled: false }));
        const disabled = await data(await request('/api/admin/shipping', { method: 'PUT', body: { shippingMethods: disabledMethods } }));
        assert.deepEqual(disabled.snapshot.settings.shippingMethods, disabledMethods);
        assert.deepEqual((await data(await request('/api/catalog'))).settings.shippingMethods, disabledMethods);
        const zero = await data(await request('/api/admin/shipping', { method: 'PUT', body: { shippingMethods: [{ ...paid, fee: 0 }] } }));
        assert.equal(zero.snapshot.settings.shippingMethods[0].fee, 0);
        const empty = await data(await request('/api/admin/shipping', { method: 'PUT', body: { shippingMethods: [] } }));
        assert.deepEqual(empty.snapshot.settings.shippingMethods, []);
        assert.deepEqual((await data(await request('/api/catalog'))).settings.shippingMethods, []);
        await data(await request('/api/admin/shipping', { method: 'PUT', body: valid }));
        await data(await request('/api/admin/settings', { method: 'PUT', body: expected }));
      } finally { db.close(); }
    });

    await t.test('categories and brands support authorized CRUD, normalized unique names, and missing-term errors', async () => {
      for (const kind of ['categories', 'brands']) {
        const base = `/api/admin/${kind}`;
        await data(await request(base, { method: 'POST', body: { name: 'مراقبت' }, requestOrigin: 'https://untrusted.invalid' }), 403);
        for (const name of ['', '  ', 'x'.repeat(121), 'bad\u0000name']) await data(await request(base, { method: 'POST', body: { name } }), 422);
        let result = await data(await request(base, { method: 'POST', body: { name: 'كريم   پوست', description: 'توضیحات اول' } }));
        const term = result.snapshot[kind][0];
        assert.match(term.id, /^[a-f0-9-]{36}$/);
        assert.equal(term.name, 'كريم پوست');
        assert.equal(term.description, 'توضیحات اول');
        assert.equal(term.productCount, 0);
        await data(await request(base, { method: 'POST', body: { name: 'کریم پوست' } }), 409);
        const duplicate = await data(await request(base, { method: 'POST', body: { name: 'Second term' } }));
        const other = duplicate.snapshot[kind].find(item => item.name === 'Second term');
        await data(await request(`${base}/${other.id}`, { method: 'PUT', body: { name: 'کریم پوست' } }), 409);
        result = await data(await request(`${base}/${term.id}`, { method: 'PUT', body: { name: ' EDITED term ', description: 'توضیحات جدید' } }));
        assert.equal(result.snapshot[kind].find(item => item.id === term.id).name, 'EDITED term');
        assert.equal(result.snapshot[kind].find(item => item.id === term.id).description, 'توضیحات جدید');
        await data(await request(base, { method: 'POST', body: { name: 'edited TERM' } }), 409);
        await data(await request(`${base}/${term.id}`, { method: 'DELETE', requestOrigin: 'https://untrusted.invalid' }), 403);
        await data(await request(`${base}/${other.id}`, { method: 'DELETE' }));
        result = await data(await request(`${base}/${term.id}`, { method: 'DELETE' }));
        assert.deepEqual(result.snapshot[kind], []);
        assert.ok(result.snapshot.trash.some(item => item.id === term.id && item.kind === (kind === 'categories' ? 'category' : 'brand')));
        await data(await request(`${base}/${term.id}`, { method: 'DELETE' }), 404);
        await data(await request(`${base}/${term.id}`, { method: 'PUT', body: { name: 'Missing' } }), 404);
        for (const item of [term, other]) await data(await request(`/api/admin/trash/${kind === 'categories' ? 'category' : 'brand'}/${item.id}`, { method: 'DELETE' }));
      }
      const categories = await data(await request('/api/admin/categories', { method: 'POST', body: { name: 'مراقبت پوست', description: 'محصولات پوست' } }));
      categoryId = categories.snapshot.categories[0].id;
      const brands = await data(await request('/api/admin/brands', { method: 'POST', body: { name: 'Dr.GENO', description: 'برند محصولات تخصصی' } }));
      brandId = brands.snapshot.brands[0].id;
      const catalog = await data(await request('/api/catalog'));
      assert.equal(catalog.categories[0].id, categoryId);
      assert.equal(catalog.brands[0].id, brandId);
    });

    await t.test('product editor routes require a session and missing products render a not-found page', async () => {
      await pageRedirect(await request('/admin/products/new', { authenticated: false }), '/admin/login');
      await pageRedirect(await request('/admin/products/does-not-exist/edit', { authenticated: false }), '/admin/login');
      const response = await request('/admin/products/does-not-exist/edit');
      const html = await response.text();
      assert.ok([200, 404].includes(response.status));
      assert.match(html, /404/);
      assert.match(html, /name="robots" content="noindex"/);
      assert.doesNotMatch(html, /اطلاعات محصول را کامل کنید/);
    });

    let uploaded;
    await t.test('uploads reject disguised files and serve normalized images', async () => {
      const bad = new FormData();
      bad.append('file', new File(['<script>alert(1)</script>'], 'fake.png', { type: 'image/png' }));
      await data(await fetch(`${origin}/api/admin/uploads`, { method: 'POST', headers: { Origin: origin, Cookie: cookie }, body: bad }), 422);
      const valid = new FormData();
      valid.append('file', new File([await readFile('public/images/products/dr-geno-trx-complex.png')], 'product.png', { type: 'image/png' }));
      uploaded = (await data(await fetch(`${origin}/api/admin/uploads`, { method: 'POST', headers: { Origin: origin, Cookie: cookie }, body: valid }), 201)).image;
      const image = await fetch(`${origin}${uploaded}`);
      assert.equal(image.status, 200);
      assert.equal(image.headers.get('content-type'), 'image/webp');
      assert.ok((await image.arrayBuffer()).byteLength > 100);
    });

    const product = { id: 'integration-product', slug: 'integration-product', name: 'محصول آزمایشی', englishName: 'Test product', brand: 'Dr.GENO', category: categoryId, image: '', price: 125000, stock: 7, size: '30ml', description: 'Database integration test', status: 'draft' };
    await t.test('products, validation, origin checks, and publish/archive behavior', async () => {
      product.image = uploaded;
      for (const status of ['draft', 'active', 'archived']) {
        for (const invalid of [{ brand: 'Unsubmitted brand' }, { category: 'skin' }, { brand: '' }, { category: undefined }]) {
          await data(await request('/api/admin/products', { method: 'POST', body: { ...product, ...invalid, status } }), 400);
        }
      }
      await data(await request('/api/admin/products', { method: 'POST', body: { ...product, stock: 1.5 } }), 422);
      await data(await request('/api/admin/products', { method: 'POST', body: product, requestOrigin: 'https://untrusted.invalid' }), 403);
      let result = await data(await request('/api/admin/products', { method: 'POST', body: product }));
      assert.equal(result.snapshot.products.length, 1);
      assert.equal(result.snapshot.categories[0].productCount, 1);
      assert.equal(result.snapshot.brands[0].productCount, 1);
      await data(await request(`/api/admin/categories/${categoryId}`, { method: 'DELETE' }), 409);
      await data(await request(`/api/admin/brands/${brandId}`, { method: 'DELETE' }), 409);
      await data(await request('/api/admin/products', { method: 'POST', body: product }), 409);
      assert.equal((await data(await request('/api/catalog'))).products.length, 0);
      await data(await request(`/api/products/${product.slug}`), 404);
      result = await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...product, status: 'active', name: 'محصول ذخیره‌شده', price: 250000 } }));
      assert.equal(result.snapshot.products[0].price, 250000);
      assert.equal((await data(await request('/api/catalog'))).products[0].name, 'محصول ذخیره‌شده');
      assert.equal((await data(await request(`/api/products/${product.slug}`))).product.name, 'محصول ذخیره‌شده');
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...product, brand: 'No brand' } }), 400);
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...product, category: 'missing' } }), 400);
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: { status: 'archived' } }));
      assert.equal((await data(await request('/api/catalog'))).products.length, 0);
      const archivedSnapshot = (await data(await request('/api/admin'))).snapshot;
      assert.equal(archivedSnapshot.products.length, 0);
      assert.equal(archivedSnapshot.categories[0].productCount, 0);
      assert.equal(archivedSnapshot.brands[0].productCount, 0);
      assert.equal(archivedSnapshot.trash[0].id, product.id);
      await data(await request(`/api/products/${product.slug}`), 404);
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: { status: 'active' } }), 404);
      await data(await request(`/api/admin/trash/product/${product.id}`, { method: 'POST' }));
      await data(await request('/api/admin/products/does-not-exist', { method: 'PATCH', body: { status: 'active' } }), 404);
      await data(await request('/api/admin/users/does-not-exist', { method: 'PATCH', body: { active: true } }), 404);
      await data(await request('/api/admin/orders/does-not-exist', { method: 'PATCH', body: { status: 'shipped' } }), 404);
      const catalog = await data(await request('/api/catalog'));
      const settings = { ...catalog.settings, announcement: 'اطلاع‌رسانی ذخیره‌شده', shippingFee: 45000 };
      await data(await request('/api/admin/settings', { method: 'PUT', body: settings }));
    });

    await t.test('renaming terms preserves category IDs and cascades brand names to existing products', async () => {
      let result = await data(await request(`/api/admin/brands/${brandId}`, { method: 'PUT', body: { name: 'Renamed brand', description: 'Brand edited' } }));
      assert.equal(result.snapshot.products[0].brand, 'Renamed brand');
      assert.equal(result.snapshot.brands[0].id, brandId);
      assert.equal((await data(await request(`/api/products/${product.slug}`))).product.brand, 'Renamed brand');
      result = await data(await request(`/api/admin/categories/${categoryId}`, { method: 'PUT', body: { name: 'پوست و زیبایی', description: 'Category edited' } }));
      assert.equal(result.snapshot.products[0].category, categoryId);
      assert.equal(result.snapshot.products[0].categoryName, 'پوست و زیبایی');
      assert.equal((await data(await request(`/api/products/${product.slug}`))).product.categoryName, 'پوست و زیبایی');
      await data(await request(`/api/admin/brands/${brandId}`, { method: 'PUT', body: { name: 'Dr.GENO', description: 'برند محصولات تخصصی' } }));
      await data(await request(`/api/admin/categories/${categoryId}`, { method: 'PUT', body: { name: 'مراقبت پوست', description: 'محصولات پوست' } }));
    });

    await t.test('slugs are required for drafts, canonicalized on writes, and unique across products', async () => {
      for (const slug of [undefined, '', 'a/b', 'a\\b', 'a.b', '..', 'a b', 'a--b', '%2f', 'a\u200cb', 'a\u200fb', 'a\u0000b', 'a'.repeat(161)]) {
        await data(await request('/api/admin/products', { method: 'POST', body: { ...product, id: 'invalid-slug', slug } }), 422);
        await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...product, slug } }), 422);
      }
      let result = await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...product, slug: '  Mixed-CASE-123  ', status: 'active' } }));
      assert.equal(result.snapshot.products[0].slug, 'mixed-case-123');
      await data(await request(`/api/products/${product.slug}`), 404);
      let published = await data(await request('/api/products/mixed-case-123'));
      assert.equal(published.product.id, product.id);
      assert.deepEqual(published.reviews, []);
      assert.deepEqual(published.reviewSummary, { count: 0, average: 0, distribution: [0, 0, 0, 0, 0] });
      const duplicate = await data(await request('/api/admin/products', { method: 'POST', body: { ...product, id: 'slug-conflict', slug: 'MIXED-CASE-123' } }), 409);
      assert.match(duplicate.error, /نامک/);
      result = await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...product, slug: 'سرم-ا\u0653برسان-۳۰', status: 'active' } }));
      assert.equal(result.snapshot.products[0].slug, 'سرم-آبرسان-۳۰');
      published = await data(await request(`/api/products/${encodeURIComponent('سرم-آبرسان-۳۰')}`));
      assert.equal(published.product.slug, 'سرم-آبرسان-۳۰');
      await data(await request('/api/products/mixed-case-123'), 404);
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...product, status: 'active' } }));
    });

    let expanded;
    await t.test('full product metadata, gallery ordering, sale price, and sanitized rich text round trip', async () => {
      const richText = '<h2 style="text-align:right;color:red" onclick="alert(1)">مراقبت پوست</h2><p>برای <strong>درخشش</strong> پوست <a href="https://example.invalid/help">راهنما</a></p><script>alert(1)</script><img src=x onerror="alert(1)"><a href="java&#x73;cript:alert(1)">unsafe</a>';
      expanded = { ...product, name: 'محصول کامل', price: 250000, status: 'active', shortDescription: 'توضیح کوتاه محصول', descriptionHtml: richText,
        usageInstructions: 'روی پوست تمیز استفاده کنید.', suitableFor: 'پوست خشک و حساس', shippingReturns: 'ارسال پس از تأیید سفارش.',
        salePrice: 200000, availability: 'in_stock', trackStock: false, sku: 'SS-100',
        images: [{ id: 'main-upload', url: uploaded, alt: 'تصویر اصلی', caption: 'نمای روبرو' }, { id: 'secondary', url: '/images/products/dr-geno-trx-complex.png', alt: 'تصویر دوم', caption: '' }],
        attributes: [{ name: 'حجم', value: '۳۰ میلی‌لیتر' }], tags: ['آبرسان', 'پوست'], hasVariants: false, variantOptions: [], variants: [] };
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...expanded, salePrice: 250000 } }), 422);
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...expanded, images: [{ ...expanded.images[0], url: '/api/media/../../secret.webp' }] } }), 422);
      const result = await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: expanded }));
      const stored = result.snapshot.products.find(item => item.id === product.id);
      assert.equal(stored.salePrice, 200000);
      assert.equal(stored.trackStock, false);
      assert.equal(stored.shortDescription, expanded.shortDescription);
      assert.equal(stored.shortDescriptionHtml, '');
      assert.equal(stored.usageInstructions, expanded.usageInstructions);
      assert.equal(stored.suitableFor, expanded.suitableFor);
      assert.equal(stored.shippingReturns, expanded.shippingReturns);
      assert.deepEqual(stored.attributes, expanded.attributes);
      assert.deepEqual(stored.tags, expanded.tags);
      assert.deepEqual(stored.images, expanded.images);
      assert.equal(stored.image, uploaded);
      assert.match(stored.descriptionHtml, /<strong>درخشش<\/strong>/);
      assert.match(stored.descriptionHtml, /text-align:right/);
      assert.match(stored.descriptionHtml, /rel="noopener noreferrer"/);
      assert.doesNotMatch(stored.descriptionHtml, /<script|<img|onclick|onerror|javascript:|color:/i);
      assert.doesNotMatch(stored.description, /<[^>]+>/);
      assert.match(stored.description, /درخشش/);
      const reordered = [...expanded.images].reverse();
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...expanded, images: reordered } }));
      const catalog = await data(await request('/api/catalog'));
      assert.equal(catalog.products[0].image, reordered[0].url);
      assert.deepEqual(catalog.products[0].images, reordered);
      // A valid rich description over the old 32 KiB body cap is accepted.
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...expanded, descriptionHtml: `<p>${'مراقبت از پوست '.repeat(1800)}</p>` } }));
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: expanded }));
    });

    await t.test('short rich descriptions are sanitized, derive plain summaries, support legacy clients, and clear explicitly', async () => {
      const richText = '<p style="text-align:center;color:red" onclick="alert(1)">برای <strong>درخشش</strong> پوست &amp; آرامش</p><p><a href="https://example.invalid/guide">راهنما</a> <a href="java&#x73;cript:alert(1)">unsafe</a></p><script>alert(1)</script><img src=x onerror="alert(1)">';
      let result = await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...expanded, shortDescription: 'stale plain text', shortDescriptionHtml: richText } }));
      const stored = result.snapshot.products.find(item => item.id === product.id);
      assert.equal(stored.shortDescription, 'برای درخشش پوست & آرامش\nراهنما unsafe');
      assert.match(stored.shortDescriptionHtml, /<strong>درخشش<\/strong>/);
      assert.match(stored.shortDescriptionHtml, /text-align:center/);
      assert.match(stored.shortDescriptionHtml, /rel="noopener noreferrer"/);
      assert.doesNotMatch(stored.shortDescriptionHtml, /<script|<img|onclick|onerror|javascript:|color:/i);
      for (const endpoint of ['/api/catalog', `/api/products/${product.slug}`]) {
        const response = await data(await request(endpoint));
        const published = response.product || response.products.find(item => item.id === product.id);
        assert.equal(published.shortDescriptionHtml, stored.shortDescriptionHtml);
        assert.equal(published.shortDescription, stored.shortDescription);
      }
      const db = new DatabaseSync(join(directory, 'store.sqlite'));
      try {
        const row = db.prepare('SELECT short_description, short_description_html FROM products WHERE id = ?').get(product.id);
        assert.equal(row.short_description, stored.shortDescription);
        assert.equal(row.short_description_html, stored.shortDescriptionHtml);
      } finally { db.close(); }

      // Submitted HTML, including empty HTML, is authoritative over stale text.
      for (const empty of ['', '  ', '<p><br></p>', '<p>&nbsp; </p>', '<script>discarded()</script><!-- empty -->']) {
        result = await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...expanded, shortDescriptionHtml: empty } }));
        const cleared = result.snapshot.products.find(item => item.id === product.id);
        assert.equal(cleared.shortDescription, '');
        assert.equal(cleared.shortDescriptionHtml, '');
      }
      // Formatting may exceed 1,000 HTML characters, but readable text may not.
      const textAtLimit = 'آ'.repeat(1000);
      result = await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...expanded, shortDescriptionHtml: `<p><strong>${textAtLimit}</strong></p>` } }));
      assert.equal(result.snapshot.products.find(item => item.id === product.id).shortDescription, textAtLimit);
      for (const invalid of [null, 42, `<p>${'آ'.repeat(1001)}</p>`, `<p title="${'a'.repeat(10_000)}">short</p>`]) {
        await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...expanded, shortDescriptionHtml: invalid } }), 422);
      }
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...expanded, shortDescription: 'آ'.repeat(1001) } }), 422);
      // Old clients can still send plain descriptions without the HTML field.
      result = await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: expanded }));
      const legacy = result.snapshot.products.find(item => item.id === product.id);
      assert.equal(legacy.shortDescription, expanded.shortDescription);
      assert.equal(legacy.shortDescriptionHtml, '');
    });

    await t.test('drafts remain private, cannot bypass publication checks, and variants validate complete combinations', async () => {
      const draft = { id: 'incomplete-draft', slug: 'incomplete-draft', name: 'پیش‌نویس بدون تصویر', brand: product.brand, category: categoryId, status: 'draft' };
      await data(await request('/api/admin/products', { method: 'POST', body: draft }));
      await data(await request(`/api/admin/products/${draft.id}`, { method: 'PATCH', body: { status: 'active' } }), 422);
      assert.equal((await data(await request('/api/catalog'))).products.length, 1);
      const variantOptions = [{ id: 'volume', name: 'حجم', values: ['۳۰ میلی‌لیتر', '۵۰ میلی‌لیتر'] }];
      const variants = [
        { id: 'small', values: ['۳۰ میلی‌لیتر'], sku: 'SS-101', price: 180000, stock: 3, availability: 'in_stock' },
        { id: 'large', values: ['۵۰ میلی‌لیتر'], sku: 'SS-102', price: null, stock: 0, availability: 'preorder' },
      ];
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...expanded, hasVariants: true, variantOptions, variants: variants.slice(0, 1) } }), 422);
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...expanded, hasVariants: true, variantOptions, variants: [variants[0], { ...variants[1], values: variants[0].values }] } }), 422);
      await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: { ...expanded, hasVariants: true, variantOptions, variants: [variants[0], { ...variants[1], stock: -1 }] } }), 422);
      expanded = { ...expanded, hasVariants: true, variantOptions, variants, salePrice: null };
      const result = await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: expanded }));
      assert.deepEqual(result.snapshot.products.find(item => item.id === product.id).variants, variants);
      assert.deepEqual((await data(await request('/api/catalog'))).products[0].variantOptions, variantOptions);
      await data(await request(`/api/admin/products/${draft.id}`, { method: 'PUT', body: { ...draft, slug: product.slug } }), 409);
      await data(await request(`/api/products/${draft.slug}`), 404);
    });

    await t.test('trash preserves products and terms, enforces restore dependencies, and only purges trashed records', async () => {
      const category = (await data(await request('/api/admin/categories', { method: 'POST', body: { name: 'دسته چرخه بازیابی', description: 'retained category' } }))).snapshot.categories.find(item => item.name === 'دسته چرخه بازیابی');
      const brand = (await data(await request('/api/admin/brands', { method: 'POST', body: { name: 'Trash lifecycle brand', description: 'retained brand' } }))).snapshot.brands.find(item => item.name === 'Trash lifecycle brand');
      const fixture = { ...product, id: 'trash-lifecycle-product', slug: 'trash-lifecycle-product', category: category.id, brand: brand.name, status: 'active', shortDescriptionHtml: '<p>توضیح <strong>قابل بازیابی</strong></p>' };
      await data(await request('/api/admin/products', { method: 'POST', body: fixture }));
      for (const [kind, item] of [['product', fixture], ['category', category], ['brand', brand]]) {
        await data(await request(`/api/admin/trash/${kind}/${item.id}`, { method: 'DELETE' }), 404);
        await data(await request(`/api/admin/trash/${kind}/${item.id}`, { method: 'POST' }), 404);
      }
      await data(await request(`/api/admin/categories/${category.id}`, { method: 'DELETE' }), 409);
      await data(await request(`/api/admin/brands/${brand.id}`, { method: 'DELETE' }), 409);
      await data(await request(`/api/admin/products/${fixture.id}`, { method: 'DELETE', requestOrigin: 'https://untrusted.invalid' }), 403);
      let result = await data(await request(`/api/admin/products/${fixture.id}`, { method: 'DELETE' }));
      assert.ok(!result.snapshot.products.some(item => item.id === fixture.id));
      const trash = result.snapshot.trash.find(item => item.id === fixture.id);
      assert.deepEqual({ id: trash.id, kind: trash.kind, name: trash.name }, { id: fixture.id, kind: 'product', name: fixture.name });
      assert.ok(Number.isFinite(Date.parse(trash.deletedAt)));
      assert.ok(!(await data(await request('/api/catalog'))).products.some(item => item.id === fixture.id));
      await data(await request(`/api/products/${fixture.slug}`), 404);
      for (const status of ['active', 'draft', 'archived']) await data(await request(`/api/admin/products/${fixture.id}`, { method: 'PATCH', body: { status } }), 404);
      await data(await request(`/api/admin/products/${fixture.id}`, { method: 'PUT', body: fixture }), 404);
      await data(await request(`/api/admin/products/${fixture.id}`, { method: 'DELETE' }), 404);
      await data(await request(`/api/admin/products`, { method: 'POST', body: { ...fixture, id: 'conflicting-slug' } }), 409);
      for (const [plural, kind, item] of [['categories', 'category', category], ['brands', 'brand', brand]]) {
        result = await data(await request(`/api/admin/${plural}/${item.id}`, { method: 'DELETE' }));
        assert.ok(!result.snapshot[plural].some(term => term.id === item.id));
        assert.ok(result.snapshot.trash.some(term => term.id === item.id && term.kind === kind));
        assert.ok(!(await data(await request('/api/catalog')))[plural].some(term => term.id === item.id));
        await data(await request(`/api/admin/${plural}/${item.id}`, { method: 'PUT', body: { name: 'Cannot edit trash' } }), 404);
        await data(await request(`/api/admin/${plural}`, { method: 'POST', body: { name: item.name } }), 409);
        await data(await request(`/api/admin/trash/${kind}/${item.id}`, { method: 'DELETE' }), 409);
        for (const method of ['POST', 'DELETE']) await data(await request(`/api/admin/trash/${kind}/${item.id}`, { method, requestOrigin: 'https://untrusted.invalid' }), 403);
      }
      for (const status of ['draft', 'active', 'archived']) {
        await data(await request('/api/admin/products', { method: 'POST', body: { ...fixture, id: 'trashed-term-write', slug: 'trashed-term-write', status } }), 400);
      }
      await data(await request(`/api/admin/trash/product/${fixture.id}`, { method: 'POST' }), 409);
      await data(await request(`/api/admin/trash/category/${category.id}`, { method: 'POST' }));
      await data(await request(`/api/admin/trash/product/${fixture.id}`, { method: 'POST' }), 409);
      result = await data(await request(`/api/admin/trash/brand/${brand.id}`, { method: 'POST' }));
      assert.equal(result.snapshot.brands.find(item => item.id === brand.id).description, brand.description);
      assert.equal(result.snapshot.categories.find(item => item.id === category.id).description, category.description);
      result = await data(await request(`/api/admin/trash/product/${fixture.id}`, { method: 'POST' }));
      assert.equal(result.snapshot.products.find(item => item.id === fixture.id).status, 'active');
      assert.equal(result.snapshot.products.find(item => item.id === fixture.id).shortDescriptionHtml, fixture.shortDescriptionHtml);
      assert.equal(result.snapshot.products.find(item => item.id === fixture.id).shortDescription, 'توضیح قابل بازیابی');
      assert.equal((await data(await request(`/api/products/${fixture.slug}`))).product.id, fixture.id);

      // PUT archive also retains its previous publication state.
      await data(await request(`/api/admin/products/${fixture.id}`, { method: 'PUT', body: { ...fixture, status: 'archived' } }));
      const db = new DatabaseSync(join(directory, 'store.sqlite'));
      try {
        const row = db.prepare('SELECT image, images_json FROM products WHERE id = ?').get(fixture.id);
        db.prepare("UPDATE products SET image = '', images_json = '[]' WHERE id = ?").run(fixture.id);
        await data(await request(`/api/admin/trash/product/${fixture.id}`, { method: 'POST' }), 422);
        assert.equal(db.prepare('SELECT status FROM products WHERE id = ?').get(fixture.id).status, 'archived');
        db.prepare('UPDATE products SET image = ?, images_json = ? WHERE id = ?').run(row.image, row.images_json, fixture.id);
        result = await data(await request(`/api/admin/trash/product/${fixture.id}`, { method: 'POST' }));
        assert.equal(result.snapshot.products.find(item => item.id === fixture.id).status, 'active');
        assert.equal(result.snapshot.products.find(item => item.id === fixture.id).shortDescriptionHtml, fixture.shortDescriptionHtml);
        await data(await request(`/api/admin/products/${fixture.id}`, { method: 'PATCH', body: { status: 'draft' } }));
        await data(await request(`/api/admin/products/${fixture.id}`, { method: 'DELETE' }));
        result = await data(await request(`/api/admin/trash/product/${fixture.id}`, { method: 'POST' }));
        assert.equal(result.snapshot.products.find(item => item.id === fixture.id).status, 'draft');
        db.prepare('INSERT INTO product_reviews (id, product_id, author, body, rating, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('trash-review', fixture.id, 'reviewer', 'retained until purge', 5, 'published', new Date().toISOString());
        await data(await request(`/api/admin/products/${fixture.id}`, { method: 'DELETE' }));
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM product_reviews WHERE product_id = ?').get(fixture.id).count, 1);
        await data(await request(`/api/admin/trash/product/${fixture.id}`, { method: 'DELETE' }));
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM products WHERE id = ?').get(fixture.id).count, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM product_reviews WHERE product_id = ?').get(fixture.id).count, 0);
      } finally { db.close(); }
      assert.equal((await fetch(`${origin}${uploaded}`)).status, 200);
      for (const [plural, kind, item] of [['categories', 'category', category], ['brands', 'brand', brand]]) {
        await data(await request(`/api/admin/${plural}/${item.id}`, { method: 'DELETE' }));
        await data(await request(`/api/admin/trash/${kind}/${item.id}`, { method: 'DELETE' }));
        await data(await request(`/api/admin/trash/${kind}/${item.id}`, { method: 'POST' }), 404);
      }
      await data(await request(`/api/admin/trash/product/${fixture.id}`, { method: 'POST' }), 404);
      await data(await request(`/api/admin/trash/product/${fixture.id}`, { method: 'DELETE' }), 404);
      await data(await request('/api/admin/trash/unknown/missing', { method: 'POST' }), 404);
      await data(await request('/api/admin/trash/unknown/missing', { method: 'DELETE' }), 404);

      // Newly submitted archived products have no previous state: restore as draft.
      const archived = { ...product, id: 'archived-on-create', slug: 'archived-on-create', status: 'archived' };
      result = await data(await request('/api/admin/products', { method: 'POST', body: archived }));
      assert.ok(result.snapshot.trash.some(item => item.id === archived.id));
      result = await data(await request(`/api/admin/trash/product/${archived.id}`, { method: 'POST' }));
      assert.equal(result.snapshot.products.find(item => item.id === archived.id).status, 'draft');
      await data(await request(`/api/admin/products/${archived.id}`, { method: 'DELETE' }));
      // Leave this record in trash to verify restart persistence below.
    });

    await t.test('public product data reads current database details and only published reviews with complete summary counts', async () => {
      const db = new DatabaseSync(join(directory, 'store.sqlite'));
      try {
        const insert = db.prepare('INSERT INTO product_reviews (id, product_id, author, body, rating, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (let index = 0; index < 105; index++) insert.run(`published-${String(index).padStart(3, '0')}`, product.id, 'مشتری آزمون', `بازخورد شماره ${index}`, index % 5 + 1, 'published', new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString());
        insert.run('pending-secret', product.id, 'Private reviewer', 'THIS REVIEW IS PENDING', 1, 'pending', '2026-12-31T00:00:00.000Z');
        insert.run('different-product', 'incomplete-draft', 'Other product', 'DIFFERENT PRODUCT REVIEW', 1, 'published', '2026-12-31T00:00:00.000Z');
        const published = await data(await request(`/api/products/${product.slug}`));
        assert.equal(published.product.id, product.id);
        assert.equal(published.product.usageInstructions, expanded.usageInstructions);
        assert.equal(published.product.suitableFor, expanded.suitableFor);
        assert.equal(published.product.shippingReturns, expanded.shippingReturns);
        assert.deepEqual(published.product.variants, expanded.variants);
        assert.equal(published.reviews.length, 100);
        assert.equal(published.reviews[0].id, 'published-104');
        assert.deepEqual(published.reviewSummary, { count: 105, average: 3, distribution: [21, 21, 21, 21, 21] });
        assert.doesNotMatch(JSON.stringify(published), /THIS REVIEW IS PENDING|DIFFERENT PRODUCT REVIEW/);
        assert.equal(published.settings.shippingFee, 45000);
        assert.deepEqual(published.settings.shippingMethods, [
          { id: 'post-free', name: 'ارسال با پست', fee: 0, free: true, postpaid: false, enabled: true },
          { id: 'tipax-paid', name: 'ارسال با تیپاکس', fee: 78000, free: false, postpaid: false, enabled: true },
        ]);
        const updated = { ...expanded, shortDescription: 'توضیح تغییرکرده در پایگاه داده' };
        await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: updated }));
        assert.equal((await data(await request(`/api/products/${product.slug}`))).product.shortDescription, updated.shortDescription);
        const page = await request(`/product/${product.slug}`, { authenticated: false });
        const html = await page.text();
        assert.equal(page.status, 200);
        assert.ok(html.includes(updated.name));
        assert.ok(html.includes(updated.shortDescription));
        // The data can occur inside a failed Flight payload even when the
        // product UI never renders. Assert actual SSR markup with reviews.
        assert.ok(html.includes(`<h1 id="product-title">${updated.name}</h1>`));
        assert.doesNotMatch(html, /\$RX\(|data-dgst="[^"]+"|Only plain objects|Objects with null prototypes/);
        assert.doesNotMatch(html, /THIS REVIEW IS PENDING|DIFFERENT PRODUCT REVIEW/);
        await data(await request(`/api/admin/products/${product.id}`, { method: 'PUT', body: expanded }));
        const unpublished = await request('/product/incomplete-draft', { authenticated: false });
        const unpublishedHtml = await unpublished.text();
        assert.ok([200, 404].includes(unpublished.status));
        assert.match(unpublishedHtml, /name="robots" content="noindex"/);
        assert.doesNotMatch(unpublishedHtml, /DIFFERENT PRODUCT REVIEW/);
      } finally { db.close(); }
    });

    await t.test('checkout validates identity, quantities, current database prices and shipping without accepting client totals', async () => {
      const originalSettings = (await data(await request('/api/catalog'))).settings;
      const simple = { ...expanded, id: 'checkout-simple', slug: 'checkout-simple', name: 'محصول ثبت سفارش', hasVariants: false, variantOptions: [], variants: [], trackStock: true, stock: 4, price: 250000, salePrice: 200000 };
      const variable = { ...expanded, id: 'checkout-variable', slug: 'checkout-variable', trackStock: true };
      const methods = [...originalSettings.shippingMethods, { id: 'checkout-postpaid', name: 'تیپاکس پس‌کرایه', fee: 0, free: false, postpaid: true, enabled: true }, { id: 'checkout-disabled', name: 'ارسال غیرفعال', fee: 50000, free: false, postpaid: false, enabled: false }];
      const db = new DatabaseSync(join(directory, 'store.sqlite'));
      const body = {
        idempotencyKey: randomBytes(24).toString('hex'), recipient: { name: 'گیرنده آزمایشی', phone: '۰۹۱۲۳۴۵۶۷۸۹' },
        address: { province: 'تهران', city: 'تهران', address: 'خیابان آزمایش، کوچه تست، پلاک ۱۲', postalCode: '۱۲۳۴۵۶۷۸۹۰' },
        notes: 'ساعت تحویل هماهنگ شود.', shippingMethodId: 'tipax-paid', items: [{ id: simple.id, quantity: 2 }], expectedTotal: 478000,
      };
      const submit = (changes = {}, options = {}) => request('/api/checkout', { method: 'POST', authenticated: false, body: { ...body, idempotencyKey: randomBytes(24).toString('hex'), ...changes }, ...options });
      const assertReplay = replay => {
        const { paymentReceiptToken: token, ...details } = replay;
        const { paymentReceiptToken: originalToken, ...originalDetails } = checkoutReceipt;
        assert.match(token, /^[a-f0-9]{64}$/);
        assert.match(originalToken, /^[a-f0-9]{64}$/);
        assert.deepEqual(details, originalDetails, 'idempotent recovery preserves the order and issues a private receipt capability');
      };
      try {
        await data(await request('/api/admin/products', { method: 'POST', body: simple }));
        await data(await request('/api/admin/products', { method: 'POST', body: variable }));
        await data(await request('/api/admin/shipping', { method: 'PUT', body: { shippingMethods: methods } }));
        await data(await submit({}, { requestOrigin: 'https://untrusted.invalid' }), 403);
        assert.equal((await fetch(`${origin}/api/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, 403);
        assert.equal((await fetch(`${origin}/api/checkout`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: 'bad' })).status, 415);
        await data(await submit({ notes: 'x'.repeat(33_000) }), 413);
        for (const invalid of [
          { recipient: { name: 'الف', phone: '123' } }, { recipient: { name: 'x', phone: '09123456789' } },
          { address: { ...body.address, postalCode: '۱۲۳۴' } }, { address: { ...body.address, address: 'کوتاه' } },
          { items: [] }, { items: [{ id: simple.id, quantity: 0 }] }, { items: [{ id: simple.id, quantity: 1.5 }] },
          { items: [{ id: simple.id, quantity: 100 }] }, { items: [{ id: simple.id, quantity: '2' }] },
          { items: [{ id: simple.id, quantity: 1 }, { id: simple.id, quantity: 1 }] },
          { idempotencyKey: 'short' }, { expectedTotal: -1 }, { expectedTotal: '478000' }, { notes: null },
        ]) await data(await submit(invalid), 422);
        for (const conflict of [
          { items: [{ id: simple.id, quantity: 5 }] }, { items: [{ id: 'missing', quantity: 1 }] },
          { items: [{ id: 'incomplete-draft', quantity: 1 }] }, { items: [{ id: simple.id, variantId: 'small', quantity: 1 }] },
          { items: [{ id: variable.id, quantity: 1 }] }, { items: [{ id: variable.id, variantId: 'large', quantity: 1 }] },
          { items: [{ id: variable.id, variantId: 'small', quantity: 4 }] },
          { shippingMethodId: 'missing' }, { shippingMethodId: 'checkout-disabled' }, { expectedTotal: 1 },
        ]) await data(await submit(conflict), 409);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM customers').get().count, 0, 'rejected requests create no customers');

        await data(await request('/api/admin/settings', { method: 'PUT', body: { ...originalSettings, acceptOrders: false } }));
        await data(await submit(), 409);
        await data(await request('/api/admin/settings', { method: 'PUT', body: originalSettings }));
        db.prepare('INSERT INTO customers (id, name, phone, city, joined_at, active) VALUES (?, ?, ?, ?, ?, ?)').run('preserved-customer', 'Existing customer', '09123456789', 'Existing city', '2026-01-01', 1);
        const [first, duplicate] = await Promise.all([submit({ idempotencyKey: body.idempotencyKey }), submit({ idempotencyKey: body.idempotencyKey })]);
        checkoutReceipt = (await data(first, 201)).order;
        assertReplay((await data(duplicate, 201)).order);
        assert.equal(checkoutReceipt.total, 478000);
        assert.equal(checkoutReceipt.shippingFee, 78000);
        assert.equal(checkoutReceipt.paymentStatus, 'unpaid');
        assert.equal(checkoutReceipt.status, 'processing');
        assert.equal(checkoutReceipt.totalQuantity, 2);
        assert.deepEqual(Object.keys(checkoutReceipt).sort(), ['id', 'createdAt', 'status', 'paymentStatus', 'total', 'shippingFee', 'shippingName', 'shippingPostpaid', 'totalQuantity', 'paymentReceiptToken'].sort());
        assert.doesNotMatch(JSON.stringify(checkoutReceipt), /09123456789|گیرنده|خیابان|۱۲۳۴۵۶۷۸۹۰/);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 1);
        assert.deepEqual({ ...db.prepare('SELECT name, phone, city, active FROM customers WHERE id = ?').get('preserved-customer') }, { name: 'Existing customer', phone: '09123456789', city: 'Existing city', active: 1 });
        const stored = db.prepare('SELECT * FROM orders WHERE id = ?').get(checkoutReceipt.id);
        assert.notEqual(stored.checkout_key_hash, body.idempotencyKey);
        assert.match(stored.checkout_key_hash, /^[a-f0-9]{64}$/);
        assert.match(stored.checkout_payload_hash, /^[a-f0-9]{64}$/);
        const details = JSON.parse(stored.checkout_json);
        assert.equal(details.recipient.phone, '09123456789');
        assert.equal(details.address.postalCode, '1234567890');
        assert.equal(details.recipient.name, body.recipient.name);
        assert.equal(details.notes, body.notes);
        assert.deepEqual([details.originalSubtotal, details.productSubtotal, details.discount, details.total], [500000, 400000, 100000, 478000]);
        assert.deepEqual(JSON.parse(stored.items_json)[0], { productId: simple.id, name: simple.name, quantity: 2, price: 200000, sku: 'SS-100' });
        assert.equal(db.prepare('SELECT stock FROM products WHERE id = ?').get(simple.id).stock, 4, 'unpaid requests never reserve or decrement stock');
        const adminOrder = (await data(await request('/api/admin'))).snapshot.orders.find(order => order.id === checkoutReceipt.id);
        assert.deepEqual(adminOrder.checkout, details);
        await data(await request('/api/admin', { authenticated: false }), 401);
        assert.equal((await request('/api/checkout', { authenticated: false })).status, 405, 'no public order/customer lookup');
        assert.doesNotMatch(JSON.stringify(await data(await request('/api/catalog'))), /Existing customer|گیرنده آزمایشی|checkout_payload_hash|checkout_key_hash/);
        await data(await submit({ idempotencyKey: body.idempotencyKey, notes: 'Changed request' }), 409);

        // Retries recover the original receipt even when conditions have changed.
        await data(await request(`/api/admin/products/${simple.id}`, { method: 'PUT', body: { ...simple, stock: 0, price: 300000, salePrice: null } }));
        await data(await request('/api/admin/shipping', { method: 'PUT', body: { shippingMethods: methods.map(method => ({ ...method, enabled: false })) } }));
        await data(await request('/api/admin/settings', { method: 'PUT', body: { ...originalSettings, acceptOrders: false } }));
        assertReplay((await data(await submit({ idempotencyKey: body.idempotencyKey }), 201)).order);
        await data(await submit(), 409);
        await data(await request('/api/admin/settings', { method: 'PUT', body: originalSettings }));
        await data(await request('/api/admin/shipping', { method: 'PUT', body: { shippingMethods: methods } }));
        await data(await request(`/api/admin/products/${simple.id}`, { method: 'PUT', body: simple }));

        const postpaid = (await data(await submit({ shippingMethodId: 'checkout-postpaid', expectedTotal: 400000 }), 201)).order;
        assert.equal(postpaid.shippingPostpaid, true);
        assert.equal(postpaid.shippingFee, 0);
        assert.equal(postpaid.total, 400000);
        const free = (await data(await submit({ shippingMethodId: 'post-free', expectedTotal: 400000, recipient: { name: 'گیرنده دیگر', phone: '+98 933 123 4567' } }), 201)).order;
        assert.equal(free.shippingFee, 0);
        assert.equal(free.shippingPostpaid, false);
        assert.equal(db.prepare('SELECT phone FROM customers WHERE phone = ?').get('09331234567').phone, '09331234567');
        const variant = (await data(await submit({ shippingMethodId: 'post-free', items: [{ id: variable.id, variantId: 'small', quantity: 3 }], expectedTotal: 540000 }), 201)).order;
        assert.deepEqual(JSON.parse(db.prepare('SELECT items_json FROM orders WHERE id = ?').get(variant.id).items_json)[0], { productId: variable.id, name: variable.name, quantity: 3, price: 180000, variantId: 'small', variantLabel: '۳۰ میلی‌لیتر', sku: 'SS-101' });
        assert.equal(JSON.parse(db.prepare('SELECT variants_json FROM products WHERE id = ?').get(variable.id).variants_json)[0].stock, 3);
        db.prepare('UPDATE customers SET active = 0 WHERE id = ?').run('preserved-customer');
        await data(await submit(), 409);
        db.prepare('UPDATE customers SET active = 1 WHERE id = ?').run('preserved-customer');
        const beforeThrottle = db.prepare('SELECT COUNT(*) AS count FROM orders WHERE user_id = ?').get('preserved-customer').count;
        for (let count = beforeThrottle; count < 10; count++) await data(await submit(), 201);
        await data(await submit(), 429);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders WHERE user_id = ?').get('preserved-customer').count, 10);
        assertReplay((await data(await submit({ idempotencyKey: body.idempotencyKey }), 201)).order);
        db.prepare("UPDATE auth_attempts SET expires_at = 0 WHERE key LIKE 'checkout:%'").run();
        await data(await submit(), 201);
      } finally {
        db.close();
        await data(await request('/api/admin/settings', { method: 'PUT', body: originalSettings }));
        await data(await request('/api/admin/shipping', { method: 'PUT', body: { shippingMethods: originalSettings.shippingMethods } }));
        for (const fixture of [simple, variable]) {
          await data(await request(`/api/admin/products/${fixture.id}`, { method: 'DELETE' }));
          await data(await request(`/api/admin/trash/product/${fixture.id}`, { method: 'DELETE' }));
        }
      }
    });

    await t.test('data and sessions survive a full server restart', async () => {
      await stop();
      await start();
      const catalog = await data(await request('/api/catalog'));
      assert.equal(catalog.products[0].price, 250000);
      assert.equal(catalog.settings.shippingFee, 45000);
      assert.equal(catalog.settings.postShippingEnabled, true);
      assert.equal(catalog.settings.tipaxShippingEnabled, true);
      assert.deepEqual(catalog.settings.shippingMethods, [
        { id: 'post-free', name: 'ارسال با پست', fee: 0, free: true, postpaid: false, enabled: true },
        { id: 'tipax-paid', name: 'ارسال با تیپاکس', fee: 78000, free: false, postpaid: false, enabled: true },
      ]);
      assert.equal(catalog.settings.announcement, 'اطلاع‌رسانی ذخیره‌شده');
      assert.equal((await data(await request('/api/admin'))).snapshot.products.length, 2);
      assert.deepEqual(catalog.products[0].variants, expanded.variants);
      assert.deepEqual(catalog.products[0].images, expanded.images);
      assert.equal(catalog.products[0].sku, 'SS-100');
      assert.equal(catalog.products[0].slug, product.slug);
      assert.deepEqual(catalog.categories, [{ id: categoryId, name: 'مراقبت پوست', description: 'محصولات پوست', productCount: 1 }]);
      assert.deepEqual(catalog.brands, [{ id: brandId, name: 'Dr.GENO', description: 'برند محصولات تخصصی', productCount: 1 }]);
      assert.equal((await data(await request(`/api/products/${product.slug}`))).reviewSummary.count, 105);
      assert.equal((await fetch(`${origin}${uploaded}`)).status, 200);
      const snapshot = (await data(await request('/api/admin'))).snapshot;
      const persistedCheckout = snapshot.orders.find(order => order.id === checkoutReceipt.id);
      assert.equal(persistedCheckout.checkout.paymentStatus, 'unpaid');
      assert.equal(persistedCheckout.checkout.total, checkoutReceipt.total);
      assert.equal(persistedCheckout.checkout.recipient.phone, '09123456789');
      assert.equal(persistedCheckout.checkout.address.postalCode, '1234567890');
      assert.equal(snapshot.categories[0].productCount, 2);
      assert.equal(snapshot.brands[0].productCount, 2);
      assert.ok(snapshot.trash.some(item => item.id === 'archived-on-create' && item.kind === 'product'));
      const restored = await data(await request('/api/admin/trash/product/archived-on-create', { method: 'POST' }));
      assert.equal(restored.snapshot.products.find(item => item.id === 'archived-on-create').status, 'draft');
      await data(await request('/api/admin/products/archived-on-create', { method: 'DELETE' }));
      await data(await request('/api/admin/trash/product/archived-on-create', { method: 'DELETE' }));
    });

    await t.test('passwords and sessions are hashed, logout revokes access, and expiry is enforced', async () => {
      const db = new DatabaseSync(join(directory, 'store.sqlite'));
      const account = db.prepare('SELECT password_hash FROM admin_accounts').get();
      assert.match(account.password_hash, /^scrypt\$/);
      assert.notEqual(account.password_hash, password);
      assert.notEqual(db.prepare('SELECT token_hash FROM admin_sessions').get().token_hash, cookie.split('=')[1]);
      await data(await request('/api/admin/auth/logout', { method: 'POST' }));
      await data(await request('/api/admin'), 401);
      await data(await request('/api/admin/auth/login', { method: 'POST', body: { email: 'owner@example.invalid', password: 'not-the-password-123' } }), 401);
      const login = await request('/api/admin/auth/login', { method: 'POST', body: { email: 'owner@example.invalid', password } });
      await data(login);
      cookie = login.headers.get('set-cookie').split(';')[0];
      await data(await request('/api/admin'));
      db.prepare('UPDATE admin_sessions SET expires_at = 0').run();
      await data(await request('/api/admin'), 401);
      db.close();
    });
  } finally {
    await stop();
    // Only remove the fresh, disposable test directory created above.
    const absolute = resolve(directory);
    assert.ok(absolute.startsWith(resolve(tmpdir()) + sep) && absolute.split(sep).at(-1).startsWith('seven-sparkles-test-'));
    await rm(absolute, { recursive: true, force: true });
  }
});
