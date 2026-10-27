import type { ReactNode, SVGProps } from "react";
import { orderStatusLabels, productStatusLabels, type OrderStatus, type ProductStatus } from "@/lib/admin-store";

export type AdminIconName = "home" | "box" | "orders" | "users" | "settings" | "external" | "sales" | "eye" | "edit" | "archive" | "info" | "chevron";
const paths: Record<AdminIconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3V10Z" /></>,
  box: <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" /><path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5" /></>,
  orders: <><path d="M5 3h10l4 4v14H5V3Z" /><path d="M15 3v5h4M9 12h6M9 16h6" /></>,
  users: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-3a7 7 0 0 1 14 0v3H2ZM17 3a4 4 0 0 1 0 8m2 3a6 6 0 0 1 3 5v2h-3" /></>,
  settings: <><path d="m10 2-.5 3-2 .9-2.8-1L2.5 8.5l2.2 2v3l-2.2 2 2.2 3.6 2.8-1 2 .9.5 3h4l.5-3 2-.9 2.8 1 2.2-3.6-2.2-2v-3l2.2-2-2.2-3.6-2.8 1-2-.9L14 2h-4Z" /><circle cx="12" cy="12" r="3" /></>,
  external: <><path d="M14 3h7v7m0-7L11 13M10 4H4v16h16v-6" /></>,
  sales: <><path d="M5 20v-5M12 20V9M19 20V3" strokeWidth="3" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  edit: <><path d="m15 4 5 5M4 15 16 3a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L9 20l-6 1 1-6Z" /></>,
  archive: <><path d="M3 3h18v5H3V3Zm2 5v13h14V8M9 12h6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  chevron: <path d="m14 5-7 7 7 7" />,
};
export function AdminIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: AdminIconName }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
export function StatusBadge({ status, kind = "order" }: { status: OrderStatus | ProductStatus; kind?: "order" | "product" }) {
  const label = kind === "order" ? orderStatusLabels[status as OrderStatus] : productStatusLabels[status as ProductStatus];
  return <span className={`admin-status status-${status}`}>{label}</span>;
}
export function EmptyState({ title = "نتیجه‌ای پیدا نشد", description = "عبارت جستجو یا فیلترها را تغییر دهید." }: { title?: string; description?: string }) {
  return <div className="admin-empty"><AdminIcon name="box" /><h3>{title}</h3><p>{description}</p></div>;
}
