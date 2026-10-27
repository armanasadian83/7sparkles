import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { getDatabase, getDataDirectory } from '../../server/database.mjs';
import { PAYMENT_RECEIPT_MAX_BYTES, type PaymentReceipt, type PaymentReceiptsResponse, type PaymentReceiptStatus } from '@/lib/payment-receipts';
import { getCurrentAdmin } from './admin-auth';
import { getCurrentCustomer } from './customer-auth';
import { HttpError, readBody } from './http';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const PRIVATE_DIRECTORY = 'payment-receipts';
const PAGE_SIZE = 20;
const STATUSES: PaymentReceiptStatus[] = ['pending', 'approved', 'rejected'];
type Row = Record<string, unknown>;
const receiptSelect = `SELECT r.*, o.checkout_json, c.name AS customer_name FROM payment_receipts r JOIN orders o ON o.id = r.order_id JOIN customers c ON c.id = o.user_id`;

/** These files and responses must never enter the public product-media cache. */
export function privateReceiptResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Vary', 'Cookie, X-Receipt-Token');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

function validOrderId(id: string) {
  if (!id || id.length > 200 || /[\u0000-\u001f\u007f/\\]/.test(id)) throw new HttpError(404, 'سفارش در دسترس نیست.');
}

/** A checkout response grants only this order's receipt upload/read capabilities. */
export function createPaymentReceiptGrant(orderId: string) {
  validOrderId(orderId);
  const db = getDatabase(), now = Date.now();
  const token = randomBytes(32).toString('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM payment_receipt_grants WHERE expires_at <= ?').run(now);
    db.prepare('INSERT INTO payment_receipt_grants (token_hash, order_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(digest(token), orderId, now + 24 * 60 * 60_000, now);
    // Bound repeated checkout replays while allowing the latest open tabs to work.
    db.prepare('DELETE FROM payment_receipt_grants WHERE order_id = ? AND token_hash NOT IN (SELECT token_hash FROM payment_receipt_grants WHERE order_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 16)').run(orderId, orderId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return token;
}

export async function requireReceiptOrder(request: Request, orderId: string) {
  validOrderId(orderId);
  const customer = await getCurrentCustomer();
  const token = request.headers.get('x-receipt-token') || '';
  const db = getDatabase();
  const owner = db.prepare('SELECT o.user_id, o.status, c.active FROM orders o JOIN customers c ON c.id = o.user_id WHERE o.id = ?').get(orderId);
  const capability = /^[a-f0-9]{64}$/.test(token) && db.prepare('SELECT order_id FROM payment_receipt_grants WHERE token_hash = ? AND order_id = ? AND expires_at > ?').get(digest(token), orderId, Date.now());
  // A uniform response hides both order existence and another customer's identity.
  if (!owner || !owner.active || (!(customer && customer.id === String(owner.user_id)) && !capability)) throw new HttpError(404, 'سفارش در دسترس نیست. برای مشاهده رسیدها وارد حساب ثبت‌کننده سفارش شوید.');
  return { status: String(owner.status) };
}

function present(row: Row): PaymentReceipt {
  let orderTotal: number | null = null;
  try {
    const value = JSON.parse(String(row.checkout_json));
    if (typeof value?.total === 'number' && Number.isSafeInteger(value.total) && value.total >= 0) orderTotal = value.total;
  } catch { /* Legacy orders may have no checkout snapshot. */ }
  return {
    id: String(row.id), orderId: String(row.order_id), createdAt: String(row.created_at),
    status: row.status as PaymentReceiptStatus, reviewNote: String(row.review_note), reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    fileUrl: `/api/payment-receipts/${encodeURIComponent(String(row.id))}/file`, originalName: String(row.original_name),
    orderTotal, customerName: String(row.customer_name || 'مشتری فروشگاه'),
  };
}

export function readOrderPaymentReceipts(orderId: string) {
  return getDatabase().prepare(`${receiptSelect} WHERE r.order_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(orderId).map(present);
}

function uploadAllowed(orderId: string) {
  const db = getDatabase();
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
  if (!order || order.status === 'cancelled') throw new HttpError(409, 'بارگذاری رسید برای این سفارش ممکن نیست.');
  const counts = db.prepare("SELECT SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending FROM payment_receipts WHERE order_id = ?").get(orderId)!;
  if (Number(counts.approved) > 0) throw new HttpError(409, 'رسید پرداخت این سفارش قبلاً تأیید شده است.');
  if (Number(counts.pending) > 0) throw new HttpError(409, 'رسید پرداخت این سفارش در انتظار بررسی است. پس از عدم تایید رسید می‌توانید دوباره بارگذاری کنید.');
}

function consumeUploadAttempt(orderId: string) {
  const key = `payment-receipt-upload:${digest(orderId)}`, now = Date.now(), db = getDatabase();
  db.prepare('DELETE FROM auth_attempts WHERE key = ? AND expires_at <= ?').run(key, now);
  const row = db.prepare('INSERT INTO auth_attempts (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count').get(key, now + 60 * 60_000)!;
  if (Number(row.count) > 30) throw new HttpError(429, 'تعداد تلاش‌های بارگذاری زیاد است. یک ساعت دیگر دوباره امتحان کنید.');
}

/** File content is decoded and re-encoded; browser MIME and extensions are insufficient. */
export async function uploadPaymentReceipt(request: Request, orderId: string) {
  await requireReceiptOrder(request, orderId);
  uploadAllowed(orderId);
  consumeUploadAttempt(orderId);
  const contentType = request.headers.get('content-type') || '';
  if (!/^multipart\/form-data;/i.test(contentType)) throw new HttpError(415, 'تصویر رسید را با فرم بارگذاری ارسال کنید.');
  const bytes = await readBody(request, PAYMENT_RECEIPT_MAX_BYTES + 64 * 1024);
  let form: FormData;
  try { form = await new Response(new Uint8Array(bytes), { headers: { 'Content-Type': contentType } }).formData(); }
  catch { throw new HttpError(400, 'فرم بارگذاری معتبر نیست.'); }
  const files = form.getAll('file');
  const file = files[0];
  if (files.length !== 1 || !(file instanceof File) || !file.size || file.size > PAYMENT_RECEIPT_MAX_BYTES) throw new HttpError(422, 'یک تصویر رسید با حجم حداکثر ۵ مگابایت انتخاب کنید.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new HttpError(422, 'فقط تصویر JPG، PNG یا WebP قابل پذیرش است.');
  let output: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(input, { limitInputPixels: 20_000_000, animated: false }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages ?? 1) > 1) throw new Error('Unsupported image');
    output = await sharp(input, { limitInputPixels: 20_000_000 }).rotate().resize({ width: 2400, height: 3000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 92 }).toBuffer();
  } catch { throw new HttpError(422, 'فایل انتخاب‌شده تصویر معتبر یا قابل پشتیبانی نیست.'); }
  // Recheck ownership after expensive decoding, including session/grant expiry.
  await requireReceiptOrder(request, orderId);
  const id = randomUUID(), filename = `${id}.webp`, directory = join(getDataDirectory(), PRIVATE_DIRECTORY);
  const originalName = file.name.normalize('NFC').replace(/[\u0000-\u001f\u007f/\\]/g, '').slice(0, 200) || 'رسید پرداخت';
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, filename);
  const db = getDatabase();
  let began = false;
  try {
    await writeFile(path, output, { flag: 'wx', mode: 0o600 });
    db.exec('BEGIN IMMEDIATE'); began = true;
    uploadAllowed(orderId);
    db.prepare('INSERT INTO payment_receipts (id, order_id, filename, original_name, created_at) VALUES (?, ?, ?, ?, ?)').run(id, orderId, filename, originalName, new Date().toISOString());
    const row = db.prepare(`${receiptSelect} WHERE r.id = ?`).get(id)!;
    db.exec('COMMIT'); began = false;
    return present(row);
  } catch (error) {
    if (began) db.exec('ROLLBACK');
    await unlink(path).catch(() => undefined);
    throw error;
  }
}

function decodeCursor(value: string | null): { createdAt: string; id: string } | null {
  if (value === null) return null;
  try {
    if (value.length > 700 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof cursor?.createdAt !== 'string' || cursor.createdAt.length > 40 || !Number.isFinite(Date.parse(cursor.createdAt)) || typeof cursor.id !== 'string' || !/^[a-f0-9-]{36}$/.test(cursor.id)) throw new Error();
    return cursor;
  } catch { throw new HttpError(422, 'نشانی صفحه رسیدها معتبر نیست.'); }
}

export function listAdminPaymentReceipts(requestUrl: string): PaymentReceiptsResponse {
  const params = new URL(requestUrl).searchParams;
  for (const key of params.keys()) if (!['q', 'status', 'cursor'].includes(key) || params.getAll(key).length > 1) throw new HttpError(422, 'پارامتر جستجوی رسیدها معتبر نیست.');
  const q = (params.get('q') || '').normalize('NFC').trim(), status = params.get('status') || '';
  if (q.length > 200 || /[\u0000-\u001f\u007f]/.test(q) || (status && !STATUSES.includes(status as PaymentReceiptStatus))) throw new HttpError(422, 'فیلتر رسیدها معتبر نیست.');
  const cursor = decodeCursor(params.get('cursor'));
  const clauses: string[] = [], values: (string | number)[] = [];
  if (status) { clauses.push('r.status = ?'); values.push(status); }
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    clauses.push("(r.order_id LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR r.original_name LIKE ? ESCAPE '\\')"); values.push(pattern, pattern, pattern);
  }
  const db = getDatabase(), where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const count = db.prepare(`SELECT COUNT(*) AS n FROM payment_receipts r JOIN orders o ON o.id = r.order_id JOIN customers c ON c.id = o.user_id${where}`).get(...values)!;
  if (cursor) { clauses.push('(r.created_at < ? OR (r.created_at = ? AND r.id < ?))'); values.push(cursor.createdAt, cursor.createdAt, cursor.id); }
  const rows = db.prepare(`${receiptSelect}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY r.created_at DESC, r.id DESC LIMIT ?`).all(...values, PAGE_SIZE + 1);
  const last = rows[PAGE_SIZE - 1];
  return { receipts: rows.slice(0, PAGE_SIZE).map(present), total: Number(count.n), nextCursor: rows.length > PAGE_SIZE && last ? Buffer.from(JSON.stringify({ createdAt: String(last.created_at), id: String(last.id) })).toString('base64url') : null };
}

export function reviewPaymentReceipt(id: string, value: unknown, adminId: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(422, 'اطلاعات بررسی رسید معتبر نیست.');
  const input = value as Record<string, unknown>;
  if (!STATUSES.includes(input.status as PaymentReceiptStatus) || typeof input.reviewNote !== 'string' || input.reviewNote.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.reviewNote)) throw new HttpError(422, 'وضعیت یا توضیح بررسی رسید معتبر نیست.');
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT order_id FROM payment_receipts WHERE id = ?').get(id);
    if (!existing) throw new HttpError(404, 'رسید پرداخت پیدا نشد.');
    db.prepare('UPDATE payment_receipts SET status = ?, review_note = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?').run(String(input.status), input.reviewNote.normalize('NFC').trim(), input.status === 'pending' ? null : new Date().toISOString(), adminId, id);
    const approved = db.prepare("SELECT id FROM payment_receipts WHERE order_id = ? AND status = 'approved' LIMIT 1").get(existing.order_id);
    // Only checkout snapshots have an explicit payment state. Fulfilment remains independent.
    db.prepare("UPDATE orders SET checkout_json = json_set(checkout_json, '$.paymentStatus', ?) WHERE id = ? AND json_type(checkout_json, '$.paymentStatus') IS NOT NULL").run(approved ? 'paid' : 'unpaid', existing.order_id);
    const row = db.prepare(`${receiptSelect} WHERE r.id = ?`).get(id)!;
    db.exec('COMMIT');
    return present(row);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export async function paymentReceiptFile(request: Request, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new HttpError(404, 'رسید پرداخت در دسترس نیست.');
  const row = getDatabase().prepare('SELECT order_id, filename FROM payment_receipts WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'رسید پرداخت در دسترس نیست.');
  if (!(await getCurrentAdmin())) await requireReceiptOrder(request, String(row.order_id));
  // Stored names are generated by the server; still constrain legacy/tampered rows.
  const filename = String(row.filename);
  if (!/^[a-f0-9-]{36}\.webp$/.test(filename)) throw new HttpError(404, 'تصویر رسید در دسترس نیست.');
  let data: Buffer;
  try { data = await readFile(join(getDataDirectory(), PRIVATE_DIRECTORY, filename)); }
  catch { throw new HttpError(404, 'تصویر رسید در دسترس نیست.'); }
  return privateReceiptResponse(new Response(new Uint8Array(data), { headers: {
    'Content-Type': 'image/webp', 'Content-Length': String(data.byteLength),
    'Content-Disposition': 'inline; filename="payment-receipt.webp"',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  } }));
}
