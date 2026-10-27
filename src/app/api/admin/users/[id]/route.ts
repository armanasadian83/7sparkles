import { adminMutation } from '@/server/admin-api';
import { readJson } from '@/server/http';
import { updateCustomerActive } from '@/server/store';
import { boolean, identifier, record } from '@/server/validation';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return adminMutation(request, async () => { updateCustomerActive(identifier((await context.params).id), boolean(record(await readJson(request)).active)); });
}
