import 'server-only';
import { cookies } from 'next/headers';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { getDatabase } from '../../server/database.mjs';
import { normalizeCheckoutDigits } from '@/lib/checkout';
import type { CustomerCodeResponse, CustomerSession } from '@/lib/customer-types';
import { handleError, HttpError, json } from './http';

const COOKIE = 'seven_sparkles_customer';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const secureCookie = () => process.env.APP_URL?.startsWith('https://') ?? process.env.NODE_ENV === 'production';

export function privateCustomerResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Vary', 'Cookie');
  return response;
}
export function customerJson(data: unknown, status = 200) { return privateCustomerResponse(json(data, status)); }
export function customerError(error: unknown) { return privateCustomerResponse(handleError(error)); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(422, 'اطلاعات درخواست معتبر نیست.');
  return value as Record<string, unknown>;
}
function phoneNumber(value: unknown) {
  if (typeof value !== 'string' || value.length > 40) throw new HttpError(422, 'شماره همراه معتبر وارد کنید.');
  let phone = normalizeCheckoutDigits(value).replace(/[\s()-]/g, '');
  if (phone.startsWith('+98')) phone = `0${phone.slice(3)}`;
  if (!/^09\d{9}$/.test(phone)) throw new HttpError(422, 'شماره همراه را با ۰۹ و در ۱۱ رقم وارد کنید.');
  return phone;
}
function localOtpOnly() {
  // Never disclose a development code or redeem a copied local challenge in
  // production. Replace this boundary with a real SMS provider before launch.
  if (process.env.NODE_ENV !== 'development') throw new HttpError(503, 'ورود پیامکی هنوز فعال نشده است. لطفاً با پشتیبانی فروشگاه تماس بگیرید.');
}
function consumeAttempt(key: string, maximum: number) {
  const now = Date.now();
  const db = getDatabase();
  db.prepare('DELETE FROM auth_attempts WHERE expires_at <= ?').run(now);
  const result = db.prepare('INSERT INTO auth_attempts (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count').get(key, now + 15 * 60_000)!;
  if (Number(result.count) > maximum) throw new HttpError(429, 'تلاش‌های زیادی انجام شده است. ۱۵ دقیقه دیگر دوباره امتحان کنید.');
}
function requestKey(request: Request) {
  // Phone throttles remain authoritative even when a proxy's IP header is
  // unavailable. Forwarded values are bounded and hashed before storage.
  return digest((request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown').trim().slice(0, 100));
}
export function requestCustomerCode(value: unknown, request: Request): CustomerCodeResponse {
  localOtpOnly();
  const phone = phoneNumber(record(value).phone);
  consumeAttempt(`customer-otp-request-phone:${digest(phone)}`, 5);
  consumeAttempt(`customer-otp-request-ip:${requestKey(request)}`, 30);
  const now = Date.now(), db = getDatabase();
  const id = randomBytes(24).toString('hex');
  const code = String(randomInt(1_000_000)).padStart(6, '0');
  const expiresAt = now + 120_000, resendAt = now + 30_000;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM customer_otp_challenges WHERE expires_at <= ?').run(now);
    const previous = db.prepare('SELECT resend_at FROM customer_otp_challenges WHERE phone = ? ORDER BY created_at DESC LIMIT 1').get(phone);
    if (previous && Number(previous.resend_at) > now) throw new HttpError(429, 'برای دریافت دوباره کد، ۳۰ ثانیه صبر کنید.');
    db.prepare('DELETE FROM customer_otp_challenges WHERE phone = ?').run(phone);
    db.prepare('INSERT INTO customer_otp_challenges (id, phone, code_hash, expires_at, resend_at, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, phone, digest(`${id}:${code}`), expiresAt, resendAt, now);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { challengeId: id, expiresAt, resendAt, developmentCode: code };
}

export async function verifyCustomerCode(value: unknown, request: Request): Promise<CustomerSession> {
  localOtpOnly();
  const input = record(value);
  if (typeof input.challengeId !== 'string' || !/^[a-f0-9]{48}$/.test(input.challengeId)) throw new HttpError(422, 'درخواست ورود معتبر نیست. یک کد جدید دریافت کنید.');
  const code = typeof input.code === 'string' ? normalizeCheckoutDigits(input.code).trim() : '';
  if (!/^\d{6}$/.test(code)) throw new HttpError(422, 'کد ورود باید ۶ رقم باشد.');
  consumeAttempt(`customer-otp-verify-ip:${requestKey(request)}`, 50);
  const db = getDatabase(), now = Date.now();
  const initial = db.prepare('SELECT phone FROM customer_otp_challenges WHERE id = ?').get(input.challengeId);
  if (initial) consumeAttempt(`customer-otp-verify-phone:${digest(String(initial.phone))}`, 15);
  const token = randomBytes(32).toString('hex');
  let customer: CustomerSession | null = null;
  let failure: HttpError | null = null;
  db.exec('BEGIN IMMEDIATE');
  try {
    const challenge = db.prepare('SELECT * FROM customer_otp_challenges WHERE id = ?').get(input.challengeId);
    if (!challenge || Number(challenge.expires_at) <= now || Number(challenge.attempts) >= 5) {
      if (challenge && Number(challenge.expires_at) <= now) db.prepare('DELETE FROM customer_otp_challenges WHERE id = ?').run(input.challengeId);
      failure = new HttpError(422, 'اعتبار کد تمام شده یا تعداد تلاش‌ها زیاد است. یک کد جدید دریافت کنید.');
    } else if (!timingSafeEqual(Buffer.from(String(challenge.code_hash), 'hex'), Buffer.from(digest(`${input.challengeId}:${code}`), 'hex'))) {
      db.prepare('UPDATE customer_otp_challenges SET attempts = attempts + 1 WHERE id = ?').run(input.challengeId);
      failure = new HttpError(422, 'کد واردشده درست نیست. دوباره تلاش کنید.');
    } else {
      const phone = String(challenge.phone);
      let account = db.prepare('SELECT id, name, phone, active FROM customers WHERE phone = ?').get(phone);
      db.prepare('DELETE FROM customer_otp_challenges WHERE id = ?').run(input.challengeId);
      if (account && !account.active) failure = new HttpError(403, 'ورود به این حساب ممکن نیست. با پشتیبانی فروشگاه تماس بگیرید.');
      else {
        if (!account) {
          const id = randomUUID();
          db.prepare('INSERT INTO customers (id, name, phone, city, joined_at, active) VALUES (?, ?, ?, ?, ?, 1)').run(id, 'مشتری فروشگاه', phone, '', new Date(now).toISOString());
          account = { id, name: 'مشتری فروشگاه', phone, active: 1 };
        }
        db.prepare('DELETE FROM customer_sessions WHERE expires_at <= ?').run(now);
        db.prepare('INSERT INTO customer_sessions (token_hash, customer_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(digest(token), String(account.id), now + SESSION_SECONDS * 1000, now);
        customer = { id: String(account.id), name: String(account.name), phone: String(account.phone), signedInAt: new Date(now).toISOString() };
      }
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  if (failure) throw failure;
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: secureCookie(), sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
  return customer!;
}

export async function getCurrentCustomer(): Promise<CustomerSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = getDatabase().prepare('SELECT c.id, c.name, c.phone, c.active, s.created_at, s.expires_at FROM customer_sessions s JOIN customers c ON c.id = s.customer_id WHERE s.token_hash = ?').get(digest(token));
  if (!row) return null;
  if (!row.active || Number(row.expires_at) <= Date.now()) { getDatabase().prepare('DELETE FROM customer_sessions WHERE token_hash = ?').run(digest(token)); return null; }
  return { id: String(row.id), name: String(row.name), phone: String(row.phone), signedInAt: new Date(Number(row.created_at)).toISOString() };
}
export async function requireCustomer() {
  const customer = await getCurrentCustomer();
  if (!customer) throw new HttpError(401, 'برای مشاهده سفارش‌ها، وارد حساب خود شوید.');
  return customer;
}
export async function logoutCustomer() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) getDatabase().prepare('DELETE FROM customer_sessions WHERE token_hash = ?').run(digest(token));
  jar.set(COOKIE, '', { httpOnly: true, secure: secureCookie(), sameSite: 'lax', path: '/', maxAge: 0 });
}
