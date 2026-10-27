import { logoutCustomer, customerJson, customerError } from '@/server/customer-auth';
import { assertSameOrigin } from '@/server/http';

export async function POST(request: Request) {
  try { assertSameOrigin(request); await logoutCustomer(); return customerJson({ ok: true }); }
  catch (error) { return customerError(error); }
}
