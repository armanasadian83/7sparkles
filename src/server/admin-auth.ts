import 'server-only';
import { cookies } from 'next/headers';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { getDatabase } from '../../server/database.mjs';
import { HttpError } from './http';

const COOKIE = 'seven_sparkles_admin';
const SESSION_SECONDS = 8 * 60 * 60;
type Admin = { id: string; email: string; name: string };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
  });
}
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derivePassword(password, salt)).toString('hex')}`;
}
async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await derivePassword(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hasAdmin() {
  return Boolean(getDatabase().prepare('SELECT id FROM admin_accounts LIMIT 1').get());
}
export function setupEnabled() { return Boolean(process.env.ADMIN_SETUP_KEY && process.env.ADMIN_SETUP_KEY.length >= 32); }
export async function getCurrentAdmin(): Promise<Admin | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return (getDatabase().prepare('SELECT a.id, a.email, a.name FROM admin_sessions s JOIN admin_accounts a ON a.id = s.admin_id WHERE s.token_hash = ? AND s.expires_at > ?').get(digest(token), Date.now()) as Admin | undefined) ?? null;
}
export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) throw new HttpError(401, 'برای ادامه، وارد حساب مدیریت شوید.');
  return admin;
}

function credentials(data: Record<string, unknown>) {
  if (typeof data.email !== 'string' || data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) throw new HttpError(422, 'ایمیل معتبر وارد کنید.');
  if (typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 128) throw new HttpError(422, 'رمز عبور باید بین ۱۲ تا ۱۲۸ نویسه باشد.');
  return { email: data.email.trim().toLowerCase(), password: data.password };
}
function consumeAttempt(key: string, max: number) {
  const db = getDatabase();
  const now = Date.now();
  db.prepare('DELETE FROM auth_attempts WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO auth_attempts (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1').run(key, now + 15 * 60_000);
  const row = db.prepare('SELECT count FROM auth_attempts WHERE key = ?').get(key)!;
  if (Number(row.count) > max) throw new HttpError(429, 'تلاش‌های زیادی انجام شده است. ۱۵ دقیقه دیگر دوباره امتحان کنید.');
}
async function createSession(adminId: string) {
  const db = getDatabase();
  const now = Date.now();
  db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(now);
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO admin_sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(digest(token), adminId, now + SESSION_SECONDS * 1000, now);
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.APP_URL?.startsWith('https://') ?? process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
}
export async function loginAdmin(data: Record<string, unknown>) {
  const { email, password } = credentials(data);
  const key = `login:${digest(email)}`;
  consumeAttempt(key, 10);
  const account = getDatabase().prepare('SELECT id, password_hash FROM admin_accounts WHERE email = ?').get(email);
  // Derive even for unknown emails, keeping the public response uniform.
  const stored = account ? String(account.password_hash) : `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
  if (!(await verifyPassword(password, stored)) || !account) throw new HttpError(401, 'ایمیل یا رمز عبور صحیح نیست.');
  getDatabase().prepare('DELETE FROM auth_attempts WHERE key = ?').run(key);
  await createSession(String(account.id));
}
export async function setupAdmin(data: Record<string, unknown>) {
  if (hasAdmin()) throw new HttpError(409, 'حساب مدیریت قبلاً ایجاد شده است.');
  if (!setupEnabled()) throw new HttpError(503, 'ابتدا دستور npm run setup را در سرور اجرا و برنامه را راه‌اندازی مجدد کنید.');
  consumeAttempt('setup', 10);
  const key = typeof data.setupKey === 'string' ? data.setupKey : '';
  if (!timingSafeEqual(Buffer.from(digest(key), 'hex'), Buffer.from(digest(process.env.ADMIN_SETUP_KEY!), 'hex'))) throw new HttpError(403, 'کلید راه‌اندازی صحیح نیست.');
  const { email, password } = credentials(data);
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 120) throw new HttpError(422, 'نام مدیر را وارد کنید.');
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (hasAdmin()) throw new HttpError(409, 'حساب مدیریت قبلاً ایجاد شده است.');
    db.prepare('INSERT INTO admin_accounts (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(id, email, data.name.trim(), passwordHash, new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  await createSession(id);
}
export async function logoutAdmin() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) getDatabase().prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(digest(token));
  jar.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.APP_URL?.startsWith('https://') ?? process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
}
