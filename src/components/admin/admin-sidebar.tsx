"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-switcher";
import { formatPrice } from "@/lib/products";
import { AdminIcon, type AdminIconName } from "./admin-ui";

export type AdminSection = "overview" | "revenue" | "products" | "categories" | "brands" | "orders" | "payment-receipts" | "shipping" | "users" | "settings" | "trash";
type NavigationIcon = AdminIconName | "categories" | "brands" | "trash" | "shipping" | "receipt";
export const adminNavigation: { id: AdminSection; label: string; icon: NavigationIcon }[] = [
  { id: "overview", label: "نمای کلی", icon: "home" },
  { id: "revenue", label: "درآمد", icon: "sales" },
  { id: "products", label: "محصولات", icon: "box" },
  { id: "categories", label: "دسته‌بندی‌ها", icon: "categories" },
  { id: "brands", label: "برندها", icon: "brands" },
  { id: "orders", label: "سفارشات", icon: "orders" },
  { id: "payment-receipts", label: "رسیدهای پرداخت", icon: "receipt" },
  { id: "shipping", label: "حمل و نقل", icon: "shipping" },
  { id: "users", label: "کاربران", icon: "users" },
  { id: "settings", label: "تنظیمات", icon: "settings" },
  { id: "trash", label: "سطل زباله", icon: "trash" },
];

export function adminSectionHref(section: AdminSection, query = "") {
  const target = section === "products" ? "/admin/products" : section === "overview" ? "/admin" : `/admin?section=${section}`;
  return query ? `${target}${target.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}` : target;
}

function NavigationIcon({ name }: { name: NavigationIcon }) {
  if (name !== "categories" && name !== "brands" && name !== "trash" && name !== "shipping" && name !== "receipt") return <AdminIcon name={name} />;
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "receipt" ? <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 7h6M9 11h6m-6 4h3" /></> : name === "shipping" ? <><path d="M3 5h11v12H3V5Zm11 5h4l3 4v3h-7M7 17h9" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></> : name === "categories" ? <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></> : name === "trash" ? <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></> : <><path d="M20 13 12 21 3 12V3h9l8 8a1.4 1.4 0 0 1 0 2Z" /><circle cx="7.5" cy="7.5" r="1" /></>}
  </svg>;
}

export function AdminSidebar({ section, processing = 0 }: { section: AdminSection; processing?: number }) {
  const [ordersExpanded, setOrdersExpanded] = useState(section === "shipping");
  function navigate() {
    setOrdersExpanded(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  return <aside className="admin-sidebar">
    <Link href="/" className="admin-brand" aria-label="سون اسپارکلز، صفحه اصلی"><Logo /><span>PERSIAN SKINCARE</span></Link>
    <div className="admin-theme-control"><ThemeToggle /></div>
    <nav className="admin-navigation" aria-label="بخش‌های مدیریت">{adminNavigation.map(item => item.id === "shipping" ? null : item.id === "orders" ? <div className="admin-nav-group" data-expanded={ordersExpanded} key={item.id}>
      <div className="admin-nav-parent"><Link href={adminSectionHref("orders")} className={section === "orders" ? "is-active" : ""} aria-current={section === "orders" ? "page" : undefined} onNavigate={navigate}><NavigationIcon name="orders" /><span>سفارشات</span>{processing ? <small>{formatPrice(processing)}</small> : null}</Link><button type="button" className="admin-nav-expand" aria-label={ordersExpanded ? "بستن زیرمنوی سفارشات" : "باز کردن زیرمنوی سفارشات"} title={ordersExpanded ? "بستن زیرمنو" : "باز کردن زیرمنو"} aria-expanded={ordersExpanded} aria-controls="admin-orders-submenu" onClick={() => setOrdersExpanded(current => !current)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></div>
      <div id="admin-orders-submenu" className="admin-nav-submenu" hidden={!ordersExpanded}><Link href={adminSectionHref("shipping")} className={section === "shipping" ? "is-active" : ""} aria-current={section === "shipping" ? "page" : undefined} onNavigate={navigate}><NavigationIcon name="shipping" /><span>حمل و نقل</span></Link></div>
    </div> : <Link
      key={item.id}
      href={adminSectionHref(item.id)}
      className={section === item.id ? "is-active" : ""}
      aria-current={section === item.id ? "page" : undefined}
      onNavigate={navigate}
    ><NavigationIcon name={item.icon} /><span>{item.label}</span></Link>)}</nav>
    <div className="admin-sidebar-bottom"><Link href="/"><AdminIcon name="external" />مشاهده فروشگاه</Link></div>
  </aside>;
}
