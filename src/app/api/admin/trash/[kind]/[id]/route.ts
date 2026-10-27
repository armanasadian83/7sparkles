import { adminMutation } from '@/server/admin-api';
import { HttpError } from '@/server/http';
import { purgeTrashItem, restoreTrashItem } from '@/server/store';
import { identifier } from '@/server/validation';
import type { TrashKind } from '@/lib/admin-trash';

type Context = { params: Promise<{ kind: string; id: string }> };
function trashKind(value: string): TrashKind {
  if (value !== 'product' && value !== 'category' && value !== 'brand') throw new HttpError(404, 'نوع مورد پیدا نشد.');
  return value;
}

export async function POST(request: Request, context: Context) {
  return adminMutation(request, async () => {
    const { kind, id } = await context.params;
    restoreTrashItem(trashKind(kind), identifier(id));
  });
}

export async function DELETE(request: Request, context: Context) {
  return adminMutation(request, async () => {
    const { kind, id } = await context.params;
    purgeTrashItem(trashKind(kind), identifier(id));
  });
}
