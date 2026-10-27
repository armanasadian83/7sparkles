import 'server-only';
import { getDatabase } from '../../server/database.mjs';
import type { CartLine } from '@/lib/cart';
import type { ProductVariant } from '@/lib/products';
import { HttpError } from './http';

export type StockAllocation = { productId: string; variantId?: string; quantity: number };

export function getStockAllocations(lines: readonly CartLine[]): StockAllocation[] {
  return lines
    .filter(line => line.product.trackStock && (line.variant?.availability ?? line.product.availability) !== 'preorder')
    .map(line => ({ productId: line.product.id, ...(line.variant ? { variantId: line.variant.id } : {}), quantity: line.quantity }));
}

/** The caller must include these changes and the order mutation in one write transaction. */
export function changeOrderStock(allocations: readonly StockAllocation[], direction: -1 | 1) {
  const db = getDatabase();
  const now = new Date().toISOString();
  for (const allocation of allocations) {
    // Read each line afresh: several selected variants can share the same JSON column.
    // Include trashed products, whose original stock still needs to be returned.
    const row = db.prepare('SELECT stock, variants_json FROM products WHERE id = ?').get(allocation.productId);
    if (!row) throw new HttpError(409, 'محصول این سفارش حذف شده است. برای تغییر وضعیت سفارش، ابتدا محصول را بازیابی کنید.');
    const variants: ProductVariant[] = JSON.parse(String(row.variants_json));
    const variant = allocation.variantId === undefined ? undefined : variants.find(item => item.id === allocation.variantId);
    if (allocation.variantId !== undefined && !variant) throw new HttpError(409, 'تنوع اصلی محصول این سفارش وجود ندارد. ابتدا تنوع را بازیابی کنید.');
    const stock = Number(variant ? variant.stock : row.stock) + direction * allocation.quantity;
    if (!Number.isSafeInteger(stock) || stock < 0) throw new HttpError(409, 'موجودی محصول یا تنوع برای فعال‌کردن این سفارش کافی نیست.');
    if (variant) {
      variant.stock = stock;
      db.prepare('UPDATE products SET variants_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(variants), now, allocation.productId);
    } else {
      db.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?').run(stock, now, allocation.productId);
    }
  }
}
