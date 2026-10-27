export type PaymentReceiptStatus = 'pending' | 'approved' | 'rejected';

export type PaymentReceipt = {
  id: string;
  orderId: string;
  createdAt: string;
  status: PaymentReceiptStatus;
  reviewNote: string;
  reviewedAt: string | null;
  fileUrl: string;
  originalName: string;
  orderTotal: number | null;
  customerName: string;
};

export type PaymentReceiptsResponse = { receipts: PaymentReceipt[]; nextCursor: string | null; total: number };
export const PAYMENT_RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
