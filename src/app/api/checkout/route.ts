import { createCheckoutOrder, validateCheckout } from '@/server/checkout';
import { assertSameOrigin, handleError, json, readJson } from '@/server/http';
import { getCurrentCustomer } from '@/server/customer-auth';
import { createPaymentReceiptGrant, privateReceiptResponse } from '@/server/payment-receipts';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = validateCheckout(await readJson(request));
    const order = createCheckoutOrder(input, await getCurrentCustomer());
    return privateReceiptResponse(json({ order: { ...order, paymentReceiptToken: createPaymentReceiptGrant(order.id) } }, 201));
  } catch (error) { return privateReceiptResponse(handleError(error)); }
}
