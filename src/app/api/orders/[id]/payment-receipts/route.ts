import { connection } from 'next/server';
import { assertSameOrigin, handleError, json } from '@/server/http';
import { privateReceiptResponse, readOrderPaymentReceipts, requireReceiptOrder, uploadPaymentReceipt } from '@/server/payment-receipts';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await context.params;
    await requireReceiptOrder(request, id);
    return privateReceiptResponse(json({ receipts: readOrderPaymentReceipts(id) }));
  } catch (error) { return privateReceiptResponse(handleError(error)); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    return privateReceiptResponse(json({ receipt: await uploadPaymentReceipt(request, id) }, 201));
  } catch (error) { return privateReceiptResponse(handleError(error)); }
}
