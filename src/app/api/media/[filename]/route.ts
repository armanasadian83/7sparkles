import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDataDirectory } from '../../../../../server/database.mjs';
import { json } from '@/server/http';

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(filename)) return json({ error: 'تصویر پیدا نشد.' }, 404);
  try {
    const image = await readFile(join(getDataDirectory(), 'uploads', filename));
    return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return json({ error: 'تصویر پیدا نشد.' }, 404);
    console.error('[media]', error);
    return json({ error: 'خواندن تصویر ممکن نیست.' }, 500);
  }
}
