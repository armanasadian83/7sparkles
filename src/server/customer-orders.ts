import 'server-only';
import { getDatabase } from '../../server/database.mjs';
import type { CustomerOrder, CustomerOrdersResponse, CustomerSession } from '@/lib/customer-types';
import type { CheckoutOrderDetails } from '@/lib/checkout';
import type { OrderStatus } from '@/lib/admin-types';
import { readCatalog } from './store';
import { HttpError } from './http';

const PAGE_SIZE = 20;
type Cursor = { createdAt: string; id: string };
function decodeCursor(value: string | null): Cursor | null {
  if (value === null) return null;
  if (value.length > 1000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new HttpError(422, 'نشانی صفحه سفارش‌ها معتبر نیست.');
  try {
    const cursor: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!cursor || typeof cursor !== 'object') throw new Error();
    const candidate = cursor as Partial<Cursor>;
    if (typeof candidate.createdAt !== 'string' || candidate.createdAt.length > 40 || !Number.isFinite(Date.parse(candidate.createdAt)) || typeof candidate.id !== 'string' || !candidate.id || candidate.id.length > 200) throw new Error();
    return { createdAt: candidate.createdAt, id: candidate.id };
  } catch { throw new HttpError(422, 'نشانی صفحه سفارش‌ها معتبر نیست.'); }
}
function nonnegative(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0; }
function checkoutDetails(value: unknown): CheckoutOrderDetails | null {
  if (!value || typeof value !== 'object') return null;
  const details = value as CheckoutOrderDetails;
  if (!['unpaid', 'paid'].includes(details.paymentStatus) || !details.recipient || !details.address || !details.shipping) return null;
  if (![details.recipient.name, details.recipient.phone, details.address.province, details.address.city, details.address.address, details.address.postalCode, details.shipping.id, details.shipping.name].every(item => typeof item === 'string')) return null;
  if (typeof details.shipping.fee !== 'number' || !Number.isFinite(details.shipping.fee) || details.shipping.fee < 0 || typeof details.shipping.postpaid !== 'boolean') return null;
  return details;
}

/** Ownership is established exclusively by the HTTP-only session, never query parameters. */
export function readCustomerOrders(customer: CustomerSession, requestUrl: string): CustomerOrdersResponse {
  const params = new URL(requestUrl).searchParams;
  for (const key of params.keys()) if (key !== 'cursor') throw new HttpError(422, 'پارامتر درخواست سفارش‌ها معتبر نیست.');
  if (params.getAll('cursor').length > 1) throw new HttpError(422, 'نشانی صفحه سفارش‌ها معتبر نیست.');
  const cursor = decodeCursor(params.get('cursor'));
  const db = getDatabase();
  const rows = cursor
    ? db.prepare('SELECT id, created_at, status, items_json, checkout_json FROM orders WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?').all(customer.id, cursor.createdAt, cursor.createdAt, cursor.id, PAGE_SIZE + 1)
    : db.prepare('SELECT id, created_at, status, items_json, checkout_json FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(customer.id, PAGE_SIZE + 1);
  const products = new Map(readCatalog().products.map(product => [product.id, product]));
  const orders: CustomerOrder[] = rows.slice(0, PAGE_SIZE).map(row => {
    const saved: { productId: string; name: string; quantity: number; price: number; variantLabel?: string; sku?: string }[] = JSON.parse(String(row.items_json));
    const checkout = checkoutDetails(JSON.parse(String(row.checkout_json)));
    const items = saved.filter(item => Number.isSafeInteger(item.quantity) && item.quantity > 0 && typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0).map(item => {
      const product = products.get(item.productId);
      return { productId: item.productId, name: item.name, quantity: item.quantity, unitPrice: item.price, lineTotal: item.quantity * item.price,
        ...(typeof item.variantLabel === 'string' && item.variantLabel ? { variantLabel: item.variantLabel } : {}),
        ...(typeof item.sku === 'string' && item.sku ? { sku: item.sku } : {}), image: product?.image || null, slug: product?.slug || null };
    });
    const productSubtotal = items.reduce((total, item) => total + item.lineTotal, 0);
    const shippingFee = checkout ? checkout.shipping.fee : null;
    return {
      id: String(row.id), createdAt: String(row.created_at), status: row.status as OrderStatus, items,
      totalQuantity: items.reduce((total, item) => total + item.quantity, 0), productSubtotal, shippingFee,
      total: checkout ? nonnegative(checkout.total) : productSubtotal, discount: checkout ? nonnegative(checkout.discount) : null,
      paymentStatus: checkout ? checkout.paymentStatus : 'unknown',
      delivery: checkout ? { recipient: { name: checkout.recipient.name, phone: checkout.recipient.phone },
        address: { province: checkout.address.province, city: checkout.address.city, address: checkout.address.address, postalCode: checkout.address.postalCode },
        shipping: { id: checkout.shipping.id, name: checkout.shipping.name, fee: checkout.shipping.fee, postpaid: checkout.shipping.postpaid }, notes: typeof checkout.notes === 'string' ? checkout.notes : '' } : null,
    };
  });
  const last = rows[PAGE_SIZE - 1];
  const nextCursor = rows.length > PAGE_SIZE && last ? Buffer.from(JSON.stringify({ createdAt: String(last.created_at), id: String(last.id) })).toString('base64url') : null;
  return { customerId: customer.id, orders, nextCursor };
}
