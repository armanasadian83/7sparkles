import { connection } from 'next/server';
import { handleError } from '@/server/http';
import { paymentReceiptFile, privateReceiptResponse } from '@/server/payment-receipts';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  try { const { id } = await context.params; return await paymentReceiptFile(request, id); }
  catch (error) { return privateReceiptResponse(handleError(error)); }
}
