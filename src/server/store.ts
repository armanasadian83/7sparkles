import 'server-only';
import { getDatabase } from '../../server/database.mjs';
import { defaultSettings, type AdminOrder, type AdminProduct, type AdminSnapshot, type AdminUser, type AdminSettings, type ShippingSettings } from '@/lib/admin-types';
import { HttpError } from './http';
import { catalogTermKey, validateProduct, validateShippingSettings } from './validation';
import { randomUUID } from 'node:crypto';
import type { CatalogTerm } from '@/lib/catalog-terms';
import type { ProductReview, ProductReviewSummary } from '@/lib/products';
import { isValidProductSlug, normalizeProductSlug } from '@/lib/product-slug';
import type { TrashItem, TrashKind } from '@/lib/admin-trash';
import { changeOrderStock, type StockAllocation } from './inventory';

function productFromRow(row: Record<string, unknown>): AdminProduct {
  return {
    id: String(row.id), slug: String(row.slug), name: String(row.name), englishName: String(row.english_name),
    brand: String(row.brand), category: String(row.category), categoryName: String(row.category_name || ''),
    image: String(row.image), price: row.price === null ? null : Number(row.price), stock: Number(row.stock), size: String(row.size), description: String(row.description),
    status: row.status as AdminProduct['status'], shortDescription: String(row.short_description), shortDescriptionHtml: String(row.short_description_html), descriptionHtml: String(row.description_html),
    salePrice: row.sale_price === null ? null : Number(row.sale_price), availability: row.availability as AdminProduct['availability'], trackStock: Boolean(row.track_stock), sku: String(row.sku),
    images: JSON.parse(String(row.images_json)), attributes: JSON.parse(String(row.attributes_json)), tags: JSON.parse(String(row.tags_json)), hasVariants: Boolean(row.has_variants),
    variantOptions: JSON.parse(String(row.variant_options_json)), variants: JSON.parse(String(row.variants_json)),
    usageInstructions: String(row.usage_instructions), suitableFor: String(row.suitable_for), shippingReturns: String(row.shipping_returns),
  };
}
const productSelect = 'SELECT products.*, categories.name AS category_name FROM products JOIN categories ON categories.id = products.category JOIN brands ON brands.name = products.brand';
const liveProductTerms = 'categories.deleted_at IS NULL AND brands.deleted_at IS NULL';
function listProducts(activeOnly = false): AdminProduct[] {
  return getDatabase().prepare(`${productSelect} WHERE products.deleted_at IS NULL AND products.status ${activeOnly ? "= 'active' AND " + liveProductTerms : "!= 'archived'"} ORDER BY products.created_at DESC, products.id`).all().map(productFromRow);
}
export function readProduct(id: string): AdminProduct | null {
  const row = getDatabase().prepare(`${productSelect} WHERE products.id = ? AND products.deleted_at IS NULL AND products.status != 'archived'`).get(id);
  return row ? productFromRow(row) : null;
}
export function readSettings(): AdminSettings {
  const row = getDatabase().prepare('SELECT value_json FROM settings WHERE id = 1').get();
  // Existing installations keep their settings JSON intact while receiving
  // defaults for newly introduced controls.
  const saved = JSON.parse(String(row!.value_json));
  // Fixed legacy Post/Tipax controls never create methods implicitly. Existing
  // databases start with an empty list until an administrator adds methods.
  const shippingMethods = saved.shippingMethods === undefined ? [] : validateShippingSettings({ shippingMethods: saved.shippingMethods }).shippingMethods;
  return { ...defaultSettings, ...saved, shippingMethods } as AdminSettings;
}
type CatalogTermKind = 'categories' | 'brands';
export function listCatalogTerms(kind: CatalogTermKind, activeOnly = false): CatalogTerm[] {
  const reference = kind === 'categories' ? 'products.category = terms.id' : 'products.brand = terms.name';
  return getDatabase().prepare(`SELECT terms.id, terms.name, terms.description, (SELECT COUNT(*) FROM products WHERE ${reference} AND products.deleted_at IS NULL AND products.status ${activeOnly ? "= 'active'" : "!= 'archived'"}) AS productCount FROM ${kind} AS terms WHERE terms.deleted_at IS NULL ORDER BY terms.name COLLATE NOCASE, terms.id`).all().map(row => ({ id: String(row.id), name: String(row.name), description: String(row.description), productCount: Number(row.productCount) }));
}
export function readCatalog() { return { products: listProducts(true), settings: readSettings(), categories: listCatalogTerms('categories', true), brands: listCatalogTerms('brands', true) }; }
export function readPublicProductBySlug(value: string) {
  const slug = normalizeProductSlug(value);
  if (!isValidProductSlug(slug)) return null;
  const db = getDatabase();
  const row = db.prepare(`${productSelect} WHERE products.slug = ? AND products.status = 'active' AND products.deleted_at IS NULL AND ${liveProductTerms}`).get(slug);
  if (!row) return null;
  // node:sqlite returns rows with a null prototype. Explicit plain objects can
  // cross React's Server Component boundary when reviews are nonempty.
  const reviews: ProductReview[] = db.prepare("SELECT id, author, body, rating, created_at AS createdAt FROM product_reviews WHERE product_id = ? AND status = 'published' ORDER BY created_at DESC, id LIMIT 100").all(String(row.id)).map(review => ({
    id: String(review.id), author: String(review.author), body: String(review.body), rating: Number(review.rating), createdAt: String(review.createdAt),
  }));
  const distribution = [0, 0, 0, 0, 0];
  const counts = db.prepare("SELECT rating, COUNT(*) AS count FROM product_reviews WHERE product_id = ? AND status = 'published' GROUP BY rating").all(String(row.id));
  for (const item of counts) distribution[Number(item.rating) - 1] = Number(item.count);
  const count = distribution.reduce((total, amount) => total + amount, 0);
  const average = count ? distribution.reduce((total, amount, index) => total + amount * (index + 1), 0) / count : 0;
  const reviewSummary: ProductReviewSummary = { count, average, distribution };
  return { product: productFromRow(row), reviews, reviewSummary, settings: readSettings() };
}
export function readSnapshot(): AdminSnapshot {
  const users = getDatabase().prepare('SELECT id, name, phone, city, joined_at AS joinedAt, active FROM customers ORDER BY joined_at DESC').all().map(row => ({ ...row, active: Boolean(row.active) })) as unknown as AdminUser[];
  const orders = getDatabase().prepare('SELECT id, user_id AS userId, created_at AS createdAt, status, items_json, checkout_json FROM orders ORDER BY created_at DESC').all().map(row => {
    const checkout = JSON.parse(String(row.checkout_json));
    return { id: row.id, userId: row.userId, createdAt: row.createdAt, status: row.status, items: JSON.parse(String(row.items_json)), ...(['unpaid', 'paid'].includes(checkout.paymentStatus) ? { checkout } : {}) };
  }) as AdminOrder[];
  return { products: listProducts(), users, orders, settings: readSettings(), categories: listCatalogTerms('categories'), brands: listCatalogTerms('brands'), trash: listTrash() };
}
function listTrash(): TrashItem[] {
  return getDatabase().prepare(`
    SELECT id, 'product' AS kind, name, deleted_at AS deletedAt FROM products WHERE deleted_at IS NOT NULL
    UNION ALL SELECT id, 'category' AS kind, name, deleted_at AS deletedAt FROM categories WHERE deleted_at IS NOT NULL
    UNION ALL SELECT id, 'brand' AS kind, name, deleted_at AS deletedAt FROM brands WHERE deleted_at IS NOT NULL
    ORDER BY deletedAt DESC, kind, id
  `).all().map(row => ({ id: String(row.id), kind: row.kind as TrashKind, name: String(row.name), deletedAt: String(row.deletedAt) }));
}
// Keep dependency checks and their mutations atomic across Node processes too.
function transaction<T>(action: () => T): T {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function termWriteError(error: unknown, kind: CatalogTermKind): never {
  const label = kind === 'categories' ? 'دسته‌بندی' : 'برند';
  if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) throw new HttpError(409, `${label} با این نام قبلاً ثبت شده است.`);
  if (error instanceof Error && /FOREIGN KEY constraint failed/.test(error.message)) throw new HttpError(409, `این ${label} در محصولات استفاده شده است. ابتدا ${label} آن محصولات را تغییر دهید.`);
  throw error;
}
export function createCatalogTerm(kind: CatalogTermKind, term: { name: string; description: string }) {
  const now = new Date().toISOString();
  try { getDatabase().prepare(`INSERT INTO ${kind} (id, name, name_key, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), term.name, catalogTermKey(term.name), term.description, now, now); }
  catch (error) { termWriteError(error, kind); }
}
export function updateCatalogTerm(kind: CatalogTermKind, id: string, term: { name: string; description: string }) {
  try {
    const result = getDatabase().prepare(`UPDATE ${kind} SET name = ?, name_key = ?, description = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`).run(term.name, catalogTermKey(term.name), term.description, new Date().toISOString(), id);
    if (!result.changes) throw new HttpError(404, kind === 'categories' ? 'دسته‌بندی پیدا نشد.' : 'برند پیدا نشد.');
  } catch (error) { termWriteError(error, kind); }
}
export function deleteCatalogTerm(kind: CatalogTermKind, id: string) {
  transaction(() => {
    const db = getDatabase();
    const term = db.prepare(`SELECT name FROM ${kind} WHERE id = ? AND deleted_at IS NULL`).get(id);
    if (!term) throw new HttpError(404, kind === 'categories' ? 'دسته‌بندی پیدا نشد.' : 'برند پیدا نشد.');
    const column = kind === 'categories' ? 'category' : 'brand';
    if (db.prepare(`SELECT id FROM products WHERE ${column} = ? AND status != 'archived' AND deleted_at IS NULL LIMIT 1`).get(kind === 'categories' ? id : term.name)) throw new HttpError(409, `این ${kind === 'categories' ? 'دسته‌بندی' : 'برند'} در محصولات استفاده شده است. ابتدا گزینه آن محصولات را تغییر دهید یا محصولات را به سطل زباله منتقل کنید.`);
    const now = new Date().toISOString();
    db.prepare(`UPDATE ${kind} SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id);
  });
}
const productColumns = ['slug', 'name', 'english_name', 'brand', 'category', 'image', 'price', 'stock', 'size', 'description', 'status', 'short_description', 'short_description_html', 'description_html', 'sale_price', 'availability', 'track_stock', 'sku', 'images_json', 'attributes_json', 'tags_json', 'has_variants', 'variant_options_json', 'variants_json', 'usage_instructions', 'suitable_for', 'shipping_returns'];
function productValues(product: AdminProduct) {
  return [product.slug, product.name, product.englishName, product.brand, product.category, product.image, product.price, product.stock, product.size, product.description, product.status, product.shortDescription, product.shortDescriptionHtml, product.descriptionHtml, product.salePrice, product.availability, Number(product.trackStock), product.sku, JSON.stringify(product.images), JSON.stringify(product.attributes), JSON.stringify(product.tags), Number(product.hasVariants), JSON.stringify(product.variantOptions), JSON.stringify(product.variants), product.usageInstructions, product.suitableFor, product.shippingReturns];
}
function productWriteError(error: unknown): never {
  // The database index is the final authority, including concurrent requests.
  if (error instanceof Error && /UNIQUE constraint failed: products\.slug/.test(error.message)) throw new HttpError(409, 'این نامک قبلاً برای محصول دیگری استفاده شده است.');
  if (error instanceof Error && /UNIQUE constraint failed: products\.id/.test(error.message)) throw new HttpError(409, 'این شناسه محصول قبلاً استفاده شده است.');
  if (error instanceof Error && /FOREIGN KEY constraint failed/.test(error.message)) throw new HttpError(400, 'برند یا دسته‌بندی محصول دیگر وجود ندارد. گزینه‌های محصول را به‌روز کنید.');
  throw error;
}
export function createProduct(product: AdminProduct) {
  transaction(() => {
    const db = getDatabase();
    validateProduct(product);
    if (db.prepare('SELECT id FROM products WHERE id = ?').get(product.id)) throw new HttpError(409, 'این شناسه محصول قبلاً استفاده شده است.');
    const now = new Date().toISOString();
    const columns = ['id', ...productColumns, 'created_at', 'updated_at', 'deleted_at', 'restore_status'];
    const archived = product.status === 'archived';
    try { db.prepare(`INSERT INTO products (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(product.id, ...productValues(product), now, now, archived ? now : null, archived ? 'draft' : null); }
    catch (error) { productWriteError(error); }
  });
}
export function updateProduct(product: AdminProduct) {
  transaction(() => {
    const existing = readProduct(product.id);
    if (!existing) throw new HttpError(404, 'محصول پیدا نشد یا در سطل زباله است.');
    validateProduct(product);
    const now = new Date().toISOString();
    const archived = product.status === 'archived';
    try {
      getDatabase().prepare(`UPDATE products SET ${productColumns.map(column => `${column} = ?`).join(', ')}, updated_at = ?, deleted_at = ?, restore_status = ? WHERE id = ?`).run(...productValues(product), now, archived ? now : null, archived ? existing.status : null, product.id);
    } catch (error) { productWriteError(error); }
  });
}
export function updateProductStatus(id: string, status: string) {
  transaction(() => {
    const existing = readProduct(id);
    if (!existing) throw new HttpError(404, 'محصول پیدا نشد یا در سطل زباله است.');
    if (status === 'active') validateProduct({ ...existing, status });
    const now = new Date().toISOString();
    const archived = status === 'archived';
    getDatabase().prepare('UPDATE products SET status = ?, updated_at = ?, deleted_at = ?, restore_status = ? WHERE id = ?').run(status, now, archived ? now : null, archived ? existing.status : null, id);
  });
}
function trashTable(kind: TrashKind) { return kind === 'product' ? 'products' : kind === 'category' ? 'categories' : 'brands'; }
export function restoreTrashItem(kind: TrashKind, id: string) {
  transaction(() => {
    const db = getDatabase();
    const table = trashTable(kind);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).get(id);
    if (!row) throw new HttpError(404, 'موردی در سطل زباله پیدا نشد.');
    const now = new Date().toISOString();
    if (kind !== 'product') {
      db.prepare(`UPDATE ${table} SET deleted_at = NULL, updated_at = ? WHERE id = ?`).run(now, id);
      return;
    }
    const category = db.prepare('SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL').get(row.category);
    const brand = db.prepare('SELECT id FROM brands WHERE name = ? AND deleted_at IS NULL').get(row.brand);
    if (!category || !brand) throw new HttpError(409, 'ابتدا برند و دسته‌بندی این محصول را از سطل زباله بازیابی کنید.');
    const status = row.restore_status === 'active' ? 'active' : 'draft';
    // An active product must still satisfy publication rules after time in trash.
    if (status === 'active') validateProduct({ ...productFromRow(row), status });
    db.prepare('UPDATE products SET status = ?, deleted_at = NULL, restore_status = NULL, updated_at = ? WHERE id = ?').run(status, now, id);
  });
}
export function purgeTrashItem(kind: TrashKind, id: string) {
  transaction(() => {
    const db = getDatabase();
    const table = trashTable(kind);
    const row = db.prepare(`SELECT name FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).get(id);
    if (!row) throw new HttpError(404, 'موردی در سطل زباله پیدا نشد.');
    if (kind !== 'product') {
      const column = kind === 'category' ? 'category' : 'brand';
      if (db.prepare(`SELECT id FROM products WHERE ${column} = ? LIMIT 1`).get(kind === 'category' ? id : row.name)) throw new HttpError(409, 'این مورد هنوز به محصول متصل است. ابتدا محصولات مرتبط را بازیابی و ویرایش کنید یا برای همیشه حذف کنید.');
    }
    // Reviews cascade in SQLite. Files remain because other products may share them.
    db.prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
  });
}
export function updateOrderStatus(id: string, status: string) {
  transaction(() => {
    const db = getDatabase();
    const order = db.prepare('SELECT status, stock_allocations_json FROM orders WHERE id = ?').get(id);
    if (!order) throw new HttpError(404, 'سفارش پیدا نشد.');
    if (order.status === status) return;
    // Only new orders have allocations. Legacy orders never removed stock.
    if (order.stock_allocations_json !== null && (order.status === 'cancelled' || status === 'cancelled')) {
      const allocations: StockAllocation[] = JSON.parse(String(order.stock_allocations_json));
      changeOrderStock(allocations, status === 'cancelled' ? 1 : -1);
    }
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  });
}
export function updateCustomerActive(id: string, active: boolean) {
  transaction(() => {
    if (!getDatabase().prepare('UPDATE customers SET active = ? WHERE id = ?').run(Number(active), id).changes) throw new HttpError(404, 'کاربر پیدا نشد.');
    if (!active) getDatabase().prepare('DELETE FROM customer_sessions WHERE customer_id = ?').run(id);
  });
}
export function updateSettings(settings: AdminSettings) {
  getDatabase().prepare('UPDATE settings SET value_json = ? WHERE id = 1').run(JSON.stringify(settings));
}
export function updateShippingSettings(settings: ShippingSettings) {
  updateSettings({ ...readSettings(), ...settings });
}
