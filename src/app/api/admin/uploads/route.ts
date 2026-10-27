import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDataDirectory } from '../../../../../server/database.mjs';
import { requireAdmin } from '@/server/admin-auth';
import { assertSameOrigin, handleError, HttpError, json, readBody } from '@/server/http';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.startsWith('multipart/form-data;')) throw new HttpError(415, 'تصویر را با فرم بارگذاری ارسال کنید.');
    const bytes = await readBody(request, 6 * 1024 * 1024);
    let form: FormData;
    try { form = await new Response(new Uint8Array(bytes), { headers: { 'Content-Type': contentType } }).formData(); }
    catch { throw new HttpError(400, 'فرم بارگذاری معتبر نیست.'); }
    const file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) throw new HttpError(422, 'تصویر باید حداکثر ۵ مگابایت باشد.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new HttpError(422, 'فقط تصویر JPG، PNG یا WebP انتخاب کنید.');
    let output: Buffer;
    try {
      const input = Buffer.from(await file.arrayBuffer());
      const metadata = await sharp(input, { limitInputPixels: 20_000_000, animated: false }).metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages ?? 1) > 1) throw new Error('Unsupported image');
      output = await sharp(input, { limitInputPixels: 20_000_000 }).rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    } catch { throw new HttpError(422, 'فایل انتخاب‌شده تصویر معتبر یا قابل پشتیبانی نیست.'); }
    const directory = join(getDataDirectory(), 'uploads');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = `${randomUUID()}.webp`;
    await writeFile(join(directory, filename), output, { flag: 'wx', mode: 0o600 });
    return json({ image: `/api/media/${filename}` }, 201);
  } catch (error) { return handleError(error); }
}
