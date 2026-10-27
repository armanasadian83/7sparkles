import { connection } from 'next/server';
import { requireAdmin } from '@/server/admin-auth';
import { handleError, json } from '@/server/http';
import { listAdminPaymentReceipts, privateReceiptResponse } from '@/server/payment-receipts';

export async function GET(request: Request) {
  await connection();
  try { await requireAdmin(); return privateReceiptResponse(json(listAdminPaymentReceipts(request.url))); }
  catch (error) { return privateReceiptResponse(handleError(error)); }
}
