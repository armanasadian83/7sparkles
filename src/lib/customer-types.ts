import type { OrderStatus } from './admin-types';
import type { CheckoutInput, CheckoutOrderDetails } from './checkout';

export type CustomerSession = { id: string; name: string; phone: string; signedInAt: string };
export type CustomerSessionResponse = { customer: CustomerSession | null };
export type CustomerCodeResponse = { challengeId: string; expiresAt: number; resendAt: number; developmentCode?: string };
export type CustomerOrderItem = { productId: string; name: string; quantity: number; unitPrice: number; lineTotal: number; variantLabel?: string; sku?: string; image: string | null; slug: string | null };
export type CustomerOrder = {
  id: string; createdAt: string; status: OrderStatus; items: CustomerOrderItem[];
  totalQuantity: number; productSubtotal: number; shippingFee: number | null; total: number; discount: number | null;
  paymentStatus: 'unpaid' | 'paid' | 'unknown';
  delivery: { recipient: CheckoutInput['recipient']; address: CheckoutInput['address']; shipping: CheckoutOrderDetails['shipping']; notes: string } | null;
};
export type CustomerOrdersResponse = { customerId: string; orders: CustomerOrder[]; nextCursor: string | null };
