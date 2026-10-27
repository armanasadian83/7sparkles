import { requestCustomerCode, customerJson, customerError } from '@/server/customer-auth';
import { assertSameOrigin, readJson } from '@/server/http';

export async function POST(request: Request) {
  try { assertSameOrigin(request); return customerJson(requestCustomerCode(await readJson(request, 4096), request)); }
  catch (error) { return customerError(error); }
}
