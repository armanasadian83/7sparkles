import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from '../../server/database.mjs';
import { normalizeCheckoutDigits, type CheckoutInput, type CheckoutOrderDetails, type CheckoutReceipt } from '@/lib/checkout';
import { resolveCartLines, getCartTotals } from '@/lib/cart';
import { getShippingMethods } from '@/lib/shipping';
import type { AdminOrder } from '@/lib/admin-types';
import type { CustomerSession } from '@/lib/customer-types';
import { readCatalog } from './store';
import { HttpError } from './http';
import { changeOrderStock, getStockAllocations } from './inventory';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(422, 'اطلاعات سفارش معتبر نیست.');
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new HttpError(422, `${label} را وارد کنید.`);
  const normalized = value.normalize('NFC').trim();
  if (normalized.length < min || normalized.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) throw new HttpError(422, `${label} معتبر نیست.`);
  return normalized;
}

export function validateCheckout(value: unknown): CheckoutInput {
  const input = record(value);
  const recipient = record(input.recipient);
  const address = record(input.address);
  const idempotencyKey = text(input.idempotencyKey, 'شناسه درخواست', 16, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(idempotencyKey)) throw new HttpError(422, 'شناسه درخواست معتبر نیست.');
  let phone = normalizeCheckoutDigits(text(recipient.phone, 'شماره همراه', 11, 30)).replace(/[\s-]/g, '');
  if (phone.startsWith('+98')) phone = `0${phone.slice(3)}`;
  if (!/^09\d{9}$/.test(phone)) throw new HttpError(422, 'شماره همراه را به صورت ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید.');
  const postalCode = normalizeCheckoutDigits(text(address.postalCode, 'کد پستی', 10, 20)).replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(postalCode)) throw new HttpError(422, 'کد پستی باید ۱۰ رقم باشد.');
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) throw new HttpError(422, 'سبد خرید باید بین ۱ تا ۵۰ ردیف داشته باشد.');
  const seen = new Set<string>();
  const items = input.items.map(value => {
    const item = record(value);
    const id = text(item.id, 'شناسه محصول', 1, 100);
    const variantId = item.variantId === undefined ? undefined : text(item.variantId, 'شناسه تنوع', 1, 100);
    if (id.includes('::') || variantId?.includes('::')) throw new HttpError(422, 'شناسه محصول معتبر نیست.');
    const key = JSON.stringify([id, variantId ?? null]);
    if (seen.has(key)) throw new HttpError(422, 'ردیف تکراری در سبد خرید وجود دارد.');
    seen.add(key);
    if (!Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 99) throw new HttpError(422, 'تعداد هر محصول باید بین ۱ تا ۹۹ باشد.');
    return { id, ...(variantId ? { variantId } : {}), quantity: Number(item.quantity) };
  }).sort((a, b) => {
    const left = JSON.stringify([a.id, a.variantId ?? null]);
    const right = JSON.stringify([b.id, b.variantId ?? null]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (!Number.isSafeInteger(input.expectedTotal) || Number(input.expectedTotal) < 0) throw new HttpError(422, 'مبلغ سفارش معتبر نیست.');
  return {
    idempotencyKey,
    recipient: { name: text(recipient.name, 'نام و نام خانوادگی', 2, 100), phone },
    address: {
      province: text(address.province, 'استان', 2, 100), city: text(address.city, 'شهر', 2, 100),
      address: text(address.address, 'نشانی کامل', 10, 1000), postalCode,
    },
    notes: input.notes === undefined ? '' : text(input.notes, 'یادداشت سفارش', 0, 2000),
    shippingMethodId: text(input.shippingMethodId, 'روش ارسال', 1, 100),
    items, expectedTotal: Number(input.expectedTotal),
  };
}

function receipt(id: string, createdAt: string, checkout: CheckoutOrderDetails): Omit<CheckoutReceipt, 'paymentReceiptToken'> {
  return {
    id, createdAt, status: 'processing', paymentStatus: checkout.paymentStatus, total: checkout.total,
    shippingFee: checkout.shipping.fee, shippingName: checkout.shipping.name,
    shippingPostpaid: checkout.shipping.postpaid, totalQuantity: checkout.totalQuantity,
  };
}

/** Checkout deducts tracked stock atomically; orders remain unpaid until payment is confirmed. */
export function createCheckoutOrder(input: CheckoutInput, owner: CustomerSession | null = null): Omit<CheckoutReceipt, 'paymentReceiptToken'> {
  const db = getDatabase();
  const keyHash = createHash('sha256').update(input.idempotencyKey).digest('hex');
  const payloadHash = createHash('sha256').update(JSON.stringify({ ...input, idempotencyKey: undefined, ...(owner ? { customerId: owner.id } : {}) })).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT id, created_at, status, checkout_json, checkout_payload_hash FROM orders WHERE checkout_key_hash = ?').get(keyHash);
    if (existing) {
      if (existing.checkout_payload_hash !== payloadHash) throw new HttpError(409, 'این شناسه درخواست برای سفارش دیگری استفاده شده است. اطلاعات را بررسی و دوباره ارسال کنید.');
      if (existing.status === 'cancelled') throw new HttpError(409, 'این سفارش لغو شده است. برای ثبت سفارش جدید، سبد خرید و موجودی را دوباره بررسی کنید.');
      const result = receipt(String(existing.id), String(existing.created_at), JSON.parse(String(existing.checkout_json)) as CheckoutOrderDetails);
      db.exec('COMMIT');
      return result;
    }

    const { products, settings } = readCatalog();
    if (!settings.acceptOrders) throw new HttpError(409, 'ثبت سفارش موقتاً غیرفعال است.');
    const shipping = getShippingMethods(settings).find(method => method.id === input.shippingMethodId);
    if (!shipping) throw new HttpError(409, 'روش ارسال انتخاب‌شده دیگر فعال نیست. اطلاعات سفارش را به‌روز کنید.');
    const lines = resolveCartLines(input.items, products);
    if (lines.length !== input.items.length || lines.some((line, index) => line.quantity !== input.items[index].quantity)) {
      throw new HttpError(409, 'موجودی یا وضعیت یکی از محصولات تغییر کرده است. سبد خرید را بررسی کنید.');
    }
    const totals = getCartTotals(lines, settings, shipping.id);
    if (!Number.isSafeInteger(totals.total) || totals.total !== input.expectedTotal) throw new HttpError(409, 'قیمت محصولات یا هزینه ارسال تغییر کرده است. اطلاعات سفارش را به‌روز و مبلغ جدید را بررسی کنید.');

    let customer = owner
      ? db.prepare('SELECT id, active FROM customers WHERE id = ?').get(owner.id)
      : db.prepare('SELECT id, active FROM customers WHERE phone = ?').get(input.recipient.phone);
    if (owner && !customer) throw new HttpError(401, 'برای ادامه، دوباره وارد حساب خود شوید.');
    if (customer && !customer.active) throw new HttpError(409, 'ثبت این سفارش ممکن نیست. با پشتیبانی فروشگاه تماس بگیرید.');
    // Guest checkout has no verified customer session yet. Limit new requests
    // by a hashed normalized phone; replaying an existing request bypasses this.
    const throttleKey = `checkout:${createHash('sha256').update(owner?.phone ?? input.recipient.phone).digest('hex')}`;
    const nowMs = Date.now();
    const attempt = db.prepare('SELECT count, expires_at FROM auth_attempts WHERE key = ?').get(throttleKey);
    if (attempt && Number(attempt.expires_at) > nowMs && Number(attempt.count) >= 10) throw new HttpError(429, 'تعداد درخواست‌های ثبت سفارش زیاد است. ۱۵ دقیقه دیگر دوباره امتحان کنید.');
    db.prepare('INSERT INTO auth_attempts (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END, expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END')
      .run(throttleKey, nowMs + 15 * 60_000, nowMs, nowMs);
    const now = new Date().toISOString();
    if (!customer) {
      const customerId = randomUUID();
      db.prepare('INSERT INTO customers (id, name, phone, city, joined_at, active) VALUES (?, ?, ?, ?, ?, 1)').run(customerId, input.recipient.name, input.recipient.phone, input.address.city, now);
      customer = { id: customerId, active: 1 };
    }
    const details: CheckoutOrderDetails = {
      recipient: input.recipient, address: input.address, notes: input.notes, shipping,
      productSubtotal: totals.productSubtotal, originalSubtotal: totals.originalSubtotal,
      discount: totals.discount, total: totals.total, totalQuantity: totals.totalQuantity, paymentStatus: 'unpaid',
    };
    const items: AdminOrder['items'] = lines.map(line => ({
      productId: line.product.id, name: line.product.name, quantity: line.quantity, price: line.unitPrice,
      ...(line.variant ? { variantId: line.variant.id, variantLabel: line.variant.values.join(' / ') } : {}),
      ...((line.variant?.sku || line.product.sku) ? { sku: line.variant?.sku || line.product.sku } : {}),
    }));
    const id = `SS-${randomUUID()}`;
    const stockAllocations = getStockAllocations(lines);
    changeOrderStock(stockAllocations, -1);
    db.prepare('INSERT INTO orders (id, user_id, created_at, status, items_json, checkout_json, checkout_key_hash, checkout_payload_hash, stock_allocations_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, String(customer.id), now, 'processing', JSON.stringify(items), JSON.stringify(details), keyHash, payloadHash, JSON.stringify(stockAllocations));
    db.exec('COMMIT');
    return receipt(id, now, details);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
