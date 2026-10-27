import { requireAdmin } from '@/server/admin-auth';
import { assertSameOrigin, handleError, json, readJson } from '@/server/http';
import { privateReceiptResponse, reviewPaymentReceipt } from '@/server/payment-receipts';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin(), { id } = await context.params;
    return privateReceiptResponse(json({ receipt: reviewPaymentReceipt(id, await readJson(request), admin.id) }));
  } catch (error) { return privateReceiptResponse(handleError(error)); }
}
