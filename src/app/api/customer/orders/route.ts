import { connection } from 'next/server';
import { requireCustomer, customerJson, customerError } from '@/server/customer-auth';
import { readCustomerOrders } from '@/server/customer-orders';

export async function GET(request: Request) {
  // Keep SQLite/private cookie reads beyond the real-request boundary.
  await connection();
  try { return customerJson(readCustomerOrders(await requireCustomer(), request.url)); }
  catch (error) { return customerError(error); }
}
