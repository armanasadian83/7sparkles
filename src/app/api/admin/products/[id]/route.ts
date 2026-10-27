import { adminMutation } from '@/server/admin-api';
import { HttpError, readJson } from '@/server/http';
import { updateProduct, updateProductStatus } from '@/server/store';
import { identifier, productStatus, record, validateProduct } from '@/server/validation';

type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  return adminMutation(request, async () => {
    const id = identifier((await context.params).id);
    const product = validateProduct(await readJson(request, 262_144));
    if (product.id !== id) throw new HttpError(422, 'شناسه محصول مطابقت ندارد.');
    updateProduct(product);
  });
}
export async function PATCH(request: Request, context: Context) {
  return adminMutation(request, async () => {
    const id = identifier((await context.params).id);
    updateProductStatus(id, productStatus(record(await readJson(request)).status));
  });
}
export async function DELETE(request: Request, context: Context) {
  return adminMutation(request, async () => {
    updateProductStatus(identifier((await context.params).id), 'archived');
  });
}
