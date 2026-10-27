import type { Product } from "@/lib/products";
import type { CatalogTerm } from "@/lib/catalog-terms";
import type { TrashItem } from "@/lib/admin-trash";
import type { CheckoutOrderDetails } from "@/lib/checkout";

export type ProductStatus = "active" | "draft" | "archived";
export type OrderStatus = "processing" | "shipped" | "delivered" | "cancelled";
export type AdminProduct = Product & { stock: number; status: ProductStatus };
export type AdminUser = { id: string; name: string; phone: string; city: string; joinedAt: string; active: boolean };
export type AdminOrder = { id: string; userId: string; createdAt: string; status: OrderStatus; items: { productId: string; name: string; quantity: number; price: number; variantId?: string; variantLabel?: string; sku?: string }[]; checkout?: CheckoutOrderDetails };
export type ShippingMethodConfig = { id: string; name: string; fee: number; free: boolean; postpaid: boolean; enabled: boolean };
export type AdminSettings = { storeName: string; description: string; announcement: string; supportPhone: string; shippingMethods: ShippingMethodConfig[]; shippingFee: number; postShippingEnabled: boolean; tipaxShippingEnabled: boolean; freeShippingThreshold: number; acceptOrders: boolean; showStock: boolean };
export type ShippingSettings = Pick<AdminSettings, "shippingMethods">;
export type AdminSnapshot = { products: AdminProduct[]; categories: CatalogTerm[]; brands: CatalogTerm[]; trash: TrashItem[]; orders: AdminOrder[]; users: AdminUser[]; settings: AdminSettings };

export const defaultSettings: AdminSettings = {
  storeName: "سون اسپارکلز", description: "جهانی از مراقبت، درخششی از تو", announcement: "درخشش تو، از مراقبت شروع می‌شود", supportPhone: "", shippingFee: 0, postShippingEnabled: true, tipaxShippingEnabled: true, freeShippingThreshold: 0, acceptOrders: true, showStock: true,
  shippingMethods: [],
};
export const emptyAdminSnapshot: AdminSnapshot = { products: [], categories: [], brands: [], trash: [], orders: [], users: [], settings: defaultSettings };
export const productStatusLabels: Record<ProductStatus, string> = { active: "فعال", draft: "پیش‌نویس", archived: "بایگانی‌شده" };
export const orderStatusLabels: Record<OrderStatus, string> = { processing: "در حال پردازش", shipped: "ارسال‌شده", delivered: "تحویل‌شده", cancelled: "لغوشده" };
export function orderTotal(order: AdminOrder) { return order.checkout?.total ?? order.items.reduce((total, item) => total + item.price * item.quantity, 0); }
export function formatAdminDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return "تاریخ نامشخص";
  return new Intl.DateTimeFormat("fa-IR", { month: "long", day: "numeric" }).format(date);
}
export function normalizeAdminSearch(value: string) {
  return value.toLocaleLowerCase().replaceAll("ي", "ی").replaceAll("ك", "ک")
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\s\u200c.\-_/\\،,'’]+/g, "");
}
