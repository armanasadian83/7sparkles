import 'server-only';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export function handleError(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error('[api]', error);
  return json({ error: 'خطایی در سرور رخ داد. دوباره تلاش کنید.' }, 500);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (process.env.NODE_ENV === 'production' && !process.env.APP_URL) throw new HttpError(503, 'آدرس APP_URL در تنظیمات سرور وارد نشده است.');
  const expected = new URL(process.env.APP_URL || request.url).origin;
  if (!origin || origin !== expected) throw new HttpError(403, 'درخواست از مبدأ معتبر ارسال نشده است.');
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'درخواست مجاز نیست.');
}

export async function readBody(request: Request, limit = 32_768) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > limit) throw new HttpError(413, 'حجم درخواست بیش از حد مجاز است.');
  if (!request.body) throw new HttpError(400, 'بدنه درخواست خالی است.');
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new HttpError(413, 'حجم درخواست بیش از حد مجاز است.'); }
    parts.push(value);
  }
  return Buffer.concat(parts, total);
}

export async function readJson(request: Request, limit = 32_768): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'درخواست باید با قالب JSON ارسال شود.');
  const body = await readBody(request, limit);
  try { return JSON.parse(body.toString('utf8')); }
  catch { throw new HttpError(400, 'قالب درخواست معتبر نیست.'); }
}
