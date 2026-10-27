import { adminMutation } from '@/server/admin-api';
import { readJson } from '@/server/http';
import { updateOrderStatus } from '@/server/store';
import { identifier, orderStatus, record } from '@/server/validation';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return adminMutation(request, async () => { updateOrderStatus(identifier((await context.params).id), orderStatus(record(await readJson(request)).status)); });
}
