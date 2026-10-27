import type { AdminSettings } from "./admin-types";
import { formatPrice, getProductPrice, getProductStockLimit, isProductAvailable, type Product, type ProductVariant } from "./products";
import { resolveShippingMethod, type ShippingMethod, type ShippingMethodId } from "./shipping";

export type CartSelection = { id: string; variantId?: string; quantity: number };
export type CartLine = {
  key: string;
  product: Product;
  variant?: ProductVariant;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  lineTotal: number;
  originalLineTotal: number;
  savings: number;
  stockLimit: number;
};
export type CartTotals = {
  totalQuantity: number;
  originalSubtotal: number;
  productSubtotal: number;
  discount: number;
  shipping: number;
  total: number;
  shippingMethod: ShippingMethod | null;
};

/** Local storage identifies selections; the current public catalog supplies every price and stock limit. */
export function resolveCartLines(cart: readonly CartSelection[], products: readonly Product[]): CartLine[] {
  const byId = new Map(products.map(product => [product.id, product]));
  const resolved: CartLine[] = [];
  for (const item of cart) {
    const product = byId.get(item.id);
    if (!product || ("status" in product && product.status !== "active") || !Number.isFinite(item.quantity) || item.quantity < 1) continue;
    const variant = product.hasVariants ? product.variants.find(option => option.id === item.variantId) : undefined;
    if ((product.hasVariants && !variant) || (!product.hasVariants && item.variantId !== undefined) || !isProductAvailable(product, variant)) continue;
    const unitPrice = getProductPrice(product, variant);
    const stockLimit = Math.max(0, Math.floor(getProductStockLimit(product, variant)));
    if (unitPrice === null || !Number.isFinite(unitPrice) || unitPrice < 0 || !stockLimit) continue;
    const quantity = Math.min(Math.floor(item.quantity), stockLimit);
    const hasDiscount = !variant && product.price !== null && Number.isFinite(product.price)
      && product.salePrice !== null && product.salePrice >= 0 && product.salePrice < product.price;
    const originalUnitPrice = hasDiscount ? product.price! : unitPrice;
    const lineTotal = unitPrice * quantity;
    const originalLineTotal = originalUnitPrice * quantity;
    resolved.push({
      key: item.variantId ? `${product.id}::${item.variantId}` : product.id,
      product, ...(variant ? { variant } : {}), quantity, unitPrice, originalUnitPrice,
      lineTotal, originalLineTotal, savings: originalLineTotal - lineTotal, stockLimit,
    });
  }
  return resolved;
}

export function getCartTotals(lines: readonly CartLine[], settings: AdminSettings | null, preferredShipping: ShippingMethodId | null = null): CartTotals {
  let totalQuantity = 0;
  let originalSubtotal = 0;
  let productSubtotal = 0;
  for (const line of lines) {
    totalQuantity += line.quantity;
    originalSubtotal += line.originalLineTotal;
    productSubtotal += line.lineTotal;
  }
  const shippingMethod = resolveShippingMethod(settings, preferredShipping);
  const shipping = totalQuantity > 0 && shippingMethod ? shippingMethod.fee : 0;
  return {
    totalQuantity, originalSubtotal, productSubtotal, discount: originalSubtotal - productSubtotal,
    shipping, total: productSubtotal + shipping, shippingMethod,
  };
}

/** A portable shopping list, never an order receipt or payment confirmation. */
export function buildCartShoppingList(lines: readonly CartLine[], totals: CartTotals, storeName: string): string {
  const money = (amount: number) => `${formatPrice(amount)} تومان`;
  const items = lines.map((line, index) => [
    `${formatPrice(index + 1)}. ${line.product.name}`,
    line.variant ? `تنوع: ${line.variant.values.join(" / ")}` : line.product.size ? `حجم: ${line.product.size}` : null,
    `تعداد: ${formatPrice(line.quantity)} | قیمت واحد: ${money(line.unitPrice)} | جمع: ${money(line.lineTotal)}`,
    line.savings > 0 ? `تخفیف این کالا: ${money(line.savings)}` : null,
  ].filter(Boolean).join("\n"));
  return [
    `فهرست خرید — ${storeName}`,
    "",
    ...items.flatMap(item => [item, ""]),
    `جمع کالاها پیش از تخفیف: ${money(totals.originalSubtotal)}`,
    `تخفیف محصولات: ${money(totals.discount)}`,
    `جمع محصولات: ${money(totals.productSubtotal)}`,
    `روش ارسال: ${totals.shippingMethod?.name ?? "روش ارسالی فعال نیست"}`,
    totals.shippingMethod?.postpaid ? "هزینه ارسال: پس‌کرایه؛ جداگانه هنگام تحویل پرداخت می‌شود." : `هزینه ارسال برآوردی: ${money(totals.shipping)}`,
    totals.shippingMethod?.postpaid ? `مبلغ قابل پرداخت فعلی (بدون هزینه پس‌کرایه): ${money(totals.total)}` : `مبلغ کل برآوردی: ${money(totals.total)}`,
    "",
    "قیمت‌ها و موجودی بر اساس اطلاعات فعلی فروشگاه هستند و ممکن است تغییر کنند.",
    "این فایل فقط فهرست خرید است؛ سفارش ثبت نشده و پرداختی انجام نشده است.",
  ].join("\n");
}
