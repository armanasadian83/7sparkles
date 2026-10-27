import { verifyCustomerCode, customerJson, customerError } from '@/server/customer-auth';
import { assertSameOrigin, readJson } from '@/server/http';

export async function POST(request: Request) {
  try { assertSameOrigin(request); return customerJson({ customer: await verifyCustomerCode(await readJson(request, 4096), request) }); }
  catch (error) { return customerError(error); }
}
