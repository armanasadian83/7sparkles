import { connection } from 'next/server';
import { readPublicProductBySlug } from '@/server/store';
import { handleError, HttpError, json } from '@/server/http';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  await connection();
  try {
    const { slug } = await params;
    const product = readPublicProductBySlug(slug);
    if (!product) throw new HttpError(404, 'محصول پیدا نشد.');
    return json(product);
  } catch (error) { return handleError(error); }
}
