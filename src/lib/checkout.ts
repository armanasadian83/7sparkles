/** Only product identities and quantities cross the checkout boundary; the server prices them. */
export type CheckoutInput = {
  idempotencyKey: string;
  recipient: { name: string; phone: string };
  address: { province: string; city: string; address: string; postalCode: string };
  notes: string;
  shippingMethodId: string;
  items: { id: string; variantId?: string; quantity: number }[];
  expectedTotal: number;
};

export type CheckoutOrderDetails = {
  recipient: CheckoutInput["recipient"];
  address: CheckoutInput["address"];
  notes: string;
  shipping: { id: string; name: string; fee: number; postpaid: boolean };
  productSubtotal: number;
  originalSubtotal: number;
  discount: number;
  total: number;
  totalQuantity: number;
  paymentStatus: "unpaid" | "paid";
};

/** No recipient information is exposed by the public order-creation endpoint. */
export type CheckoutReceipt = {
  id: string;
  createdAt: string;
  status: "processing";
  paymentStatus: "unpaid" | "paid";
  total: number;
  shippingFee: number;
  shippingName: string;
  shippingPostpaid: boolean;
  totalQuantity: number;
  paymentReceiptToken: string;
};

export function normalizeCheckoutDigits(value: string): string {
  return value.replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660));
}
