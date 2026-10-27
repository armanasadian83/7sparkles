import { adminMutation } from '@/server/admin-api';
import { readJson } from '@/server/http';
import { createCatalogTerm } from '@/server/store';
import { validateCatalogTerm } from '@/server/validation';

export async function POST(request: Request) {
  return adminMutation(request, async () => {
    createCatalogTerm('brands', validateCatalogTerm(await readJson(request)));
  });
}
