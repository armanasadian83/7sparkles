import { adminMutation } from '@/server/admin-api';
import { readJson } from '@/server/http';
import { deleteCatalogTerm, updateCatalogTerm } from '@/server/store';
import { identifier, validateCatalogTerm } from '@/server/validation';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  return adminMutation(request, async () => {
    const id = identifier((await context.params).id);
    updateCatalogTerm('brands', id, validateCatalogTerm(await readJson(request)));
  });
}

export async function DELETE(request: Request, context: Context) {
  return adminMutation(request, async () => {
    deleteCatalogTerm('brands', identifier((await context.params).id));
  });
}
