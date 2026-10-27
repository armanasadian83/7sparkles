import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function getDataDirectory() {
  return resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || join(process.cwd(), 'data'));
}

const migrations = [{
  version: 1,
  sql: `
    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      english_name TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL CHECK (brand IN ('Dr.GENO', 'Novoselix', 'Genosys')),
      category TEXT NOT NULL CHECK (category IN ('skin', 'hair', 'professional')),
      image TEXT NOT NULL,
      price INTEGER CHECK (price IS NULL OR price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      size TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX products_status_created ON products(status, created_at);
    CREATE TABLE customers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL UNIQUE,
      city TEXT NOT NULL DEFAULT '', joined_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES customers(id),
      created_at TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('processing', 'shipped', 'delivered', 'cancelled')),
      items_json TEXT NOT NULL CHECK (json_valid(items_json))
    );
    CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), value_json TEXT NOT NULL CHECK (json_valid(value_json)));
    INSERT INTO settings (id, value_json) VALUES (1, '{"storeName":"سون اسپارکلز","description":"جهانی از مراقبت، درخششی از تو","announcement":"درخشش تو، از مراقبت شروع می‌شود","supportPhone":"","shippingFee":0,"freeShippingThreshold":0,"acceptOrders":true,"showStock":true}');
    CREATE TABLE admin_accounts (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE admin_sessions (
      token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);
    CREATE TABLE auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
  `,
}, {
  version: 2,
  sql: `
    ALTER TABLE products ADD COLUMN short_description TEXT NOT NULL DEFAULT '';
    ALTER TABLE products ADD COLUMN description_html TEXT NOT NULL DEFAULT '';
    ALTER TABLE products ADD COLUMN sale_price INTEGER CHECK (sale_price IS NULL OR (sale_price >= 0 AND sale_price < price));
    ALTER TABLE products ADD COLUMN availability TEXT NOT NULL DEFAULT 'in_stock' CHECK (availability IN ('in_stock', 'out_of_stock', 'preorder'));
    ALTER TABLE products ADD COLUMN track_stock INTEGER NOT NULL DEFAULT 1 CHECK (track_stock IN (0, 1));
    ALTER TABLE products ADD COLUMN sku TEXT NOT NULL DEFAULT '';
    ALTER TABLE products ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(images_json));
    ALTER TABLE products ADD COLUMN attributes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(attributes_json));
    ALTER TABLE products ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json));
    ALTER TABLE products ADD COLUMN has_variants INTEGER NOT NULL DEFAULT 0 CHECK (has_variants IN (0, 1));
    ALTER TABLE products ADD COLUMN variant_options_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(variant_options_json));
    ALTER TABLE products ADD COLUMN variants_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(variants_json));
    UPDATE products SET availability = CASE WHEN stock > 0 THEN 'in_stock' ELSE 'out_of_stock' END;
    UPDATE products SET images_json = json_array(json_object('id', 'main', 'url', image, 'alt', name, 'caption', '')) WHERE image != '';
  `,
}, {
  version: 3,
  sql: `
    ALTER TABLE products ADD COLUMN slug TEXT NOT NULL DEFAULT '';
    ALTER TABLE products ADD COLUMN usage_instructions TEXT NOT NULL DEFAULT '';
    ALTER TABLE products ADD COLUMN suitable_for TEXT NOT NULL DEFAULT '';
    ALTER TABLE products ADD COLUMN shipping_returns TEXT NOT NULL DEFAULT '';
    CREATE TABLE product_reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (typeof(rating) = 'integer' AND rating BETWEEN 1 AND 5),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX product_reviews_product_status ON product_reviews(product_id, status, created_at DESC);
  `,
  after(database) {
    // IDs can differ only in casing or separators. Reserve names one by one so
    // migration never merges products or fails when their URL bases collide.
    const reserved = new Set();
    const update = database.prepare('UPDATE products SET slug = ? WHERE id = ?');
    for (const row of database.prepare('SELECT id FROM products ORDER BY id COLLATE BINARY').all()) {
      const suffix = String(row.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
      const base = `product-${suffix}`.slice(0, 145).replace(/-+$/g, '');
      let slug = base;
      let counter = 2;
      while (reserved.has(slug)) slug = `${base}-${counter++}`;
      reserved.add(slug);
      update.run(slug, row.id);
    }
    database.exec('CREATE UNIQUE INDEX products_slug_unique ON products(slug)');
  },
}, {
  version: 4,
  sql: `
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE brands (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, name_key TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `,
  after(database) {
    const now = new Date().toISOString();
    const categoryNames = { skin: 'مراقبت پوست', hair: 'مراقبت مو', professional: 'مراقبت تخصصی' };
    const key = value => value.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c]+/g, ' ').trim().toLocaleLowerCase('en');
    for (const row of database.prepare('SELECT DISTINCT category FROM products').all()) {
      const name = categoryNames[row.category] || String(row.category);
      database.prepare('INSERT INTO categories (id, name, name_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(row.category, name, key(name), now, now);
    }
    for (const row of database.prepare('SELECT DISTINCT brand FROM products').all()) {
      database.prepare('INSERT INTO brands (id, name, name_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), row.brand, key(String(row.brand)), now, now);
    }
    // Remove the only incoming product foreign key before replacing its parent.
    // Keeping a copy of every review avoids ON DELETE CASCADE during the rebuild.
    // All steps run in the migration transaction, so failures roll back together.
    database.exec(`
      CREATE TEMP TABLE migration_product_reviews AS SELECT * FROM product_reviews;
      DROP TABLE product_reviews;
      CREATE TABLE products_catalog_migration (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        english_name TEXT NOT NULL DEFAULT '',
        brand TEXT NOT NULL REFERENCES brands(name) ON UPDATE CASCADE ON DELETE RESTRICT,
        category TEXT NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        image TEXT NOT NULL,
        price INTEGER CHECK (price IS NULL OR price >= 0),
        stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        size TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        short_description TEXT NOT NULL DEFAULT '',
        description_html TEXT NOT NULL DEFAULT '',
        sale_price INTEGER CHECK (sale_price IS NULL OR (sale_price >= 0 AND sale_price < price)),
        availability TEXT NOT NULL DEFAULT 'in_stock' CHECK (availability IN ('in_stock', 'out_of_stock', 'preorder')),
        track_stock INTEGER NOT NULL DEFAULT 1 CHECK (track_stock IN (0, 1)),
        sku TEXT NOT NULL DEFAULT '',
        images_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(images_json)),
        attributes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(attributes_json)),
        tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
        has_variants INTEGER NOT NULL DEFAULT 0 CHECK (has_variants IN (0, 1)),
        variant_options_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(variant_options_json)),
        variants_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(variants_json)),
        slug TEXT NOT NULL DEFAULT '',
        usage_instructions TEXT NOT NULL DEFAULT '',
        suitable_for TEXT NOT NULL DEFAULT '',
        shipping_returns TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO products_catalog_migration SELECT * FROM products;
      DROP TABLE products;
      ALTER TABLE products_catalog_migration RENAME TO products;
      CREATE INDEX products_status_created ON products(status, created_at);
      CREATE UNIQUE INDEX products_slug_unique ON products(slug);
      CREATE INDEX products_category ON products(category);
      CREATE INDEX products_brand ON products(brand);
      CREATE TABLE product_reviews (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        author TEXT NOT NULL, body TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (typeof(rating) = 'integer' AND rating BETWEEN 1 AND 5),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published')),
        created_at TEXT NOT NULL
      );
      INSERT INTO product_reviews SELECT * FROM migration_product_reviews;
      DROP TABLE migration_product_reviews;
      CREATE INDEX product_reviews_product_status ON product_reviews(product_id, status, created_at DESC);
    `);
    if (database.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Catalog migration produced invalid references.');
  },
}, {
  version: 5,
  sql: `
    ALTER TABLE products ADD COLUMN deleted_at TEXT;
    ALTER TABLE products ADD COLUMN restore_status TEXT CHECK (restore_status IS NULL OR restore_status IN ('active', 'draft'));
    ALTER TABLE categories ADD COLUMN deleted_at TEXT;
    ALTER TABLE brands ADD COLUMN deleted_at TEXT;
    UPDATE products SET deleted_at = updated_at, restore_status = 'draft' WHERE status = 'archived';
    CREATE INDEX products_deleted_at ON products(deleted_at);
    CREATE INDEX categories_deleted_at ON categories(deleted_at);
    CREATE INDEX brands_deleted_at ON brands(deleted_at);
  `,
}, {
  version: 6,
  sql: `ALTER TABLE products ADD COLUMN short_description_html TEXT NOT NULL DEFAULT '';`,
}, {
  version: 7,
  sql: `
    ALTER TABLE orders ADD COLUMN checkout_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(checkout_json));
    ALTER TABLE orders ADD COLUMN checkout_key_hash TEXT;
    ALTER TABLE orders ADD COLUMN checkout_payload_hash TEXT;
    CREATE UNIQUE INDEX orders_checkout_key ON orders(checkout_key_hash) WHERE checkout_key_hash IS NOT NULL;
  `,
}, {
  version: 8,
  sql: `
    CREATE TABLE customer_sessions (
      token_hash TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX customer_sessions_customer ON customer_sessions(customer_id);
    CREATE INDEX customer_sessions_expiry ON customer_sessions(expires_at);
    CREATE TABLE customer_otp_challenges (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      resend_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX customer_otp_phone ON customer_otp_challenges(phone);
    CREATE INDEX customer_otp_expiry ON customer_otp_challenges(expires_at);
    CREATE INDEX orders_customer_created ON orders(user_id, created_at DESC, id DESC);
  `,
}, {
  version: 9,
  sql: `
    CREATE TABLE payment_receipt_grants (
      token_hash TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX payment_receipt_grants_order ON payment_receipt_grants(order_id);
    CREATE INDEX payment_receipt_grants_expiry ON payment_receipt_grants(expires_at);
    CREATE TABLE payment_receipts (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      filename TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      review_note TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      reviewed_by TEXT REFERENCES admin_accounts(id) ON DELETE SET NULL
    );
    CREATE INDEX payment_receipts_order ON payment_receipts(order_id, created_at DESC, id DESC);
    CREATE INDEX payment_receipts_created ON payment_receipts(created_at DESC, id DESC);
    CREATE INDEX payment_receipts_status_created ON payment_receipts(status, created_at DESC, id DESC);
  `,
}, {
  version: 10,
  // NULL marks older orders, which never deducted stock. Never credit them on cancellation.
  sql: `ALTER TABLE orders ADD COLUMN stock_allocations_json TEXT CHECK (stock_allocations_json IS NULL OR (json_valid(stock_allocations_json) AND json_type(stock_allocations_json) = 'array'));`,
}];

/** @returns {DatabaseSync} */
export function getDatabase() {
  const directory = getDataDirectory();
  const cacheKey = Symbol.for('seven-sparkles.sqlite');
  const existing = globalThis[cacheKey];
  const schemaVersion = migrations.at(-1)?.version || 0;
  const cached = existing?.directory === directory ? existing : null;
  if (cached && cached.schemaVersion >= schemaVersion) return cached.database;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const database = cached?.database || new DatabaseSync(join(directory, 'store.sqlite'));
  let transactionStarted = false;
  try {
    database.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');
    database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    database.exec('BEGIN IMMEDIATE');
    transactionStarted = true;
    const applied = new Set(database.prepare('SELECT version FROM schema_migrations').all().map(row => Number(row.version)));
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      database.exec(migration.sql);
      migration.after?.(database);
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(migration.version, new Date().toISOString());
    }
    database.exec('COMMIT');
  } catch (error) {
    if (globalThis[cacheKey]?.database === database) delete globalThis[cacheKey];
    try { if (transactionStarted) database.exec('ROLLBACK'); }
    finally { database.close(); }
    throw error;
  }
  globalThis[cacheKey] = { database, directory, schemaVersion };
  return database;
}
