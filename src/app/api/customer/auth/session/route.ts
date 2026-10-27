import { connection } from 'next/server';
import { getCurrentCustomer, customerJson, customerError } from '@/server/customer-auth';

export async function GET() {
  // Private session reads require a real request; don't catch prerender control flow.
  await connection();
  try { return customerJson({ customer: await getCurrentCustomer() }); }
  catch (error) { return customerError(error); }
}
