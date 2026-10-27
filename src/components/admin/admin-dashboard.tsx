"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/dialog";
import { Icon, Star } from "@/components/icons";
import { formatPrice } from "@/lib/products";
import { adminRequest, clearAdminStore, normalizeAdminSearch, orderTotal, useAdminStore, type AdminOrder, type AdminProduct, type AdminUser } from "@/lib/admin-store";
import { AdminOrders, OrderDetails, OrdersTable } from "./admin-orders";
import { AdminPaymentReceipts } from "./admin-payment-receipts";
import { AdminProducts } from "./admin-products";
import { AdminSettings } from "./admin-settings";
import { AdminShipping } from "./admin-shipping";
import { AdminTaxonomy } from "./admin-taxonomy";
import { AdminTrash } from "./admin-trash";
import { AdminUsers } from "./admin-users";
import { AdminIcon, type AdminIconName, EmptyState } from "./admin-ui";
import { AdminSidebar, adminNavigation as navigation, adminSectionHref, type AdminSection as Section } from "./admin-sidebar";

const AdminRevenue = dynamic(() => import("./admin-revenue").then(module => module.AdminRevenue), {
  loading: () => <div className="admin-loading" role="status">در حال آماده‌سازی گزارش درآمد...</div>,
});

function GlobalSearch({ open, onClose, products, orders, users, onNavigate }: { open: boolean; onClose: () => void; products: AdminProduct[]; orders: AdminOrder[]; users: AdminUser[]; onNavigate: (section: Section, query?: string) => void }) {
  const [query, setQuery] = useState("");
  const search = normalizeAdminSearch(query);
  const productResults = products.filter(product => normalizeAdminSearch(`${product.name} ${product.englishName} ${product.brand}`).includes(search)).slice(0, 3);
  const orderResults = orders.filter(order => normalizeAdminSearch(`${order.id} ${order.checkout?.recipient.name ?? users.find(user => user.id === order.userId)?.name ?? ""} ${order.checkout?.recipient.phone ?? ""}`).includes(search)).slice(0, 3);
  const userResults = users.filter(user => normalizeAdminSearch(`${user.name} ${user.city}`).includes(search)).slice(0, 3);
  const count = productResults.length + orderResults.length + userResults.length;
  function choose(section: Section, value: string) {
    onNavigate(section, value);
    onClose();
  }
  return <Dialog open={open} onClose={onClose} title="جستجو در پنل مدیریت" className="admin-dialog">
    <label className="admin-search-field admin-global-search-input"><Icon name="search" size={20} /><input autoFocus aria-label="جستجوی سراسری" value={query} onChange={event => setQuery(event.target.value)} placeholder="نام محصول، شماره سفارش یا نام کاربر..." /></label>
    {!count ? <EmptyState /> : <div className="admin-global-results">
      {productResults.length ? <section><h3>محصولات</h3>{productResults.map(product => <button key={product.id} type="button" onClick={() => choose("products", product.name)}>{product.image ? <Image src={product.image} alt="" width={38} height={44} /> : <AdminIcon name="box" />}<span>{product.name}<small dir="ltr">{product.brand}</small></span><AdminIcon name="chevron" /></button>)}</section> : null}
      {orderResults.length ? <section><h3>سفارشات</h3>{orderResults.map(order => <button key={order.id} type="button" onClick={() => choose("orders", order.id)}><AdminIcon name="orders" /><span><b dir="ltr">{order.id}</b><small>{order.checkout?.recipient.name ?? users.find(user => user.id === order.userId)?.name ?? "مشتری ناشناس"}</small></span><AdminIcon name="chevron" /></button>)}</section> : null}
      {userResults.length ? <section><h3>کاربران</h3>{userResults.map(user => <button key={user.id} type="button" onClick={() => choose("users", user.name)}><span className="admin-avatar">{user.name[0]}</span><span>{user.name}<small>{user.city}</small></span><AdminIcon name="chevron" /></button>)}</section> : null}
    </div>}
  </Dialog>;
}
export function AdminDashboard({ initialSection: section = "overview", initialQuery: sectionQuery = "" }: { initialSection?: Section; initialQuery?: string }) {
  const router = useRouter();
  const store = useAdminStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  function notify(text: string) {
    setToast({ text, id: Date.now() });
  }
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try { await adminRequest("/api/admin/auth/logout", { method: "POST" }); clearAdminStore(); router.replace("/admin/login"); router.refresh(); }
    catch (cause) { setLogoutError(cause instanceof Error ? cause.message : "خروج از حساب انجام نشد."); setLoggingOut(false); }
  }
  function navigate(next: Section, query = "") {
    // The committed route owns the active tab; a pending navigation must not
    // mutate the previous page's section while Next.js resolves another route.
    router.push(adminSectionHref(next, query));
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const activeLabel = navigation.find(item => item.id === section)!.label;
  const processing = store.orders.filter(order => order.status === "processing").length;
  const activeProducts = store.products.filter(product => product.status === "active");
  const lowStock = activeProducts.toSorted((a, b) => a.stock - b.stock).slice(0, 3);
  const totalSales = store.orders.filter(order => order.status !== "cancelled").reduce((total, order) => total + orderTotal(order), 0);
  const selectedOrder = store.orders.find(order => order.id === selectedOrderId);
  const stats: { label: string; value: string; unit?: string; detail: string; icon: AdminIconName; section: Section }[] = [
    { label: "ارزش سفارش‌ها", value: formatPrice(totalSales), unit: "تومان", detail: "بدون لغوشده‌ها؛ شامل هزینه ارسال", icon: "sales", section: "revenue" },
    { label: "سفارشات", value: formatPrice(store.orders.length), detail: `${formatPrice(processing)} سفارش در حال پردازش`, icon: "orders", section: "orders" },
    { label: "محصولات", value: formatPrice(store.products.length), detail: `${formatPrice(activeProducts.length)} محصول فعال`, icon: "box", section: "products" },
    { label: "کاربران", value: formatPrice(store.users.length), detail: `${formatPrice(store.users.filter(user => user.active).length)} کاربر فعال`, icon: "users", section: "users" },
  ];
  return <div className="admin-shell" dir="rtl">
    <a className="skip-link" href="#admin-main">رفتن به محتوای مدیریت</a>
    <AdminSidebar section={section} processing={processing} />
    <div className="admin-workspace">
      <header className="admin-topbar"><div className="admin-breadcrumb"><AdminIcon name="home" /><span>مدیریت فروشگاه</span><AdminIcon name="chevron" /><strong>{activeLabel}</strong></div><button type="button" className="admin-global-search" onClick={() => setSearchOpen(true)}><span>جستجوی سفارش، محصول یا کاربر...</span><Icon name="search" size={20} /></button><div className="admin-manager"><span>مدیر فروشگاه</span><span className="admin-avatar">م</span></div><button className="admin-logout" type="button" disabled={loggingOut} onClick={() => void logout()}>{loggingOut ? "خروج..." : "خروج"}</button></header>
      <main id="admin-main" className="admin-main">
        <div className="admin-page-title"><div><h1>{section === "overview" ? <>سلام، به پنل مدیریت خوش آمدید <Star /></> : activeLabel}</h1><p>{section === "overview" ? "از این بخش می‌توانید محصولات، سفارشات، کاربران و تنظیمات فروشگاه خود را مدیریت کنید." : section === "revenue" ? "گزارش فروش، سفارش‌ها و وضعیت فروشگاه بر اساس اطلاعات ثبت‌شده." : "مدیریت آسان، در یک فضای آشنا و آرام."}</p></div><button type="button" className="admin-demo-badge" onClick={() => void store.refresh()} disabled={store.loading}><span />به‌روزرسانی اطلاعات</button></div>
        {logoutError ? <p role="alert" className="admin-error">{logoutError}</p> : null}
        {store.loading ? <div className="admin-loading" role="status">در حال دریافت اطلاعات فروشگاه...</div> : null}
        {store.error ? <div className="admin-load-error" role="alert"><p>{store.error}</p><button className="admin-button secondary small" type="button" onClick={() => void store.refresh()}>تلاش دوباره</button></div> : null}
        {store.loaded ? <>
        {section === "revenue" ? <AdminRevenue snapshot={store} /> : null}
        {section === "overview" ? <>
          <div className="admin-stats">{stats.map(stat => <button className="admin-stat" type="button" key={stat.label} onClick={() => navigate(stat.section)}><div><span>{stat.label}</span><strong>{stat.value} {stat.unit ? <small>{stat.unit}</small> : null}</strong><p>{stat.detail}</p></div><span className={`admin-stat-icon stat-${stat.icon}`}><AdminIcon name={stat.icon} /></span></button>)}</div>
          <div className="admin-overview-grid">
            <section className="admin-panel admin-recent-orders"><div className="admin-panel-heading"><h2><AdminIcon name="orders" />آخرین سفارشات</h2><button className="admin-button outline small" type="button" onClick={() => navigate("orders")}>مشاهده همه<Icon name="arrow" size={17} /></button></div><OrdersTable orders={store.orders.slice(0, 6)} users={store.users} onSelect={order => setSelectedOrderId(order.id)} /></section>
            <section className="admin-panel admin-inventory"><div className="admin-panel-heading"><h2>وضعیت موجودی محصولات</h2><AdminIcon name="box" /></div><div className="admin-inventory-list">{lowStock.length ? lowStock.map(product => <button type="button" className="admin-inventory-item" key={product.id} onClick={() => navigate("products", product.name)}><span className="admin-inventory-photo"><Image src={product.image} alt="" width={74} height={96} /></span><span className="admin-inventory-info"><strong>{product.name}</strong><small dir="ltr">{product.brand}</small><span className={product.stock <= 5 ? "admin-low-stock" : ""}>موجودی: {formatPrice(product.stock)} عدد</span><span className="admin-stock-track"><span style={{ width: `${Math.min(100, product.stock / 24 * 100)}%` }} className={product.stock <= 5 ? "is-low" : ""} /></span></span></button>) : <EmptyState title="محصول فعالی وجود ندارد" description="از بخش محصولات یک محصول را فعال کنید." />}</div><button className="admin-button admin-inventory-action" type="button" onClick={() => navigate("products")}>مدیریت محصولات<Icon name="arrow" size={20} /></button></section>
          </div>
        </> : null}
        {section === "products" ? <AdminProducts key={`products-${sectionQuery}`} products={store.products} onStatusChange={store.setProductStatus} notify={notify} initialSearch={sectionQuery} /> : null}
        {section === "categories" ? <AdminTaxonomy key={`categories-${sectionQuery}`} kind="category" terms={store.categories} onSave={store.saveCategory} onDelete={store.deleteCategory} notify={notify} initialSearch={sectionQuery} /> : null}
        {section === "brands" ? <AdminTaxonomy key={`brands-${sectionQuery}`} kind="brand" terms={store.brands} onSave={store.saveBrand} onDelete={store.deleteBrand} notify={notify} initialSearch={sectionQuery} /> : null}
        {section === "orders" ? <AdminOrders key={`orders-${sectionQuery}`} orders={store.orders} users={store.users} onStatusChange={store.setOrderStatus} notify={notify} initialSearch={sectionQuery} /> : null}
        {section === "payment-receipts" ? <AdminPaymentReceipts key={`payment-receipts-${sectionQuery}`} initialSearch={sectionQuery} notify={notify} onReviewed={() => void store.refresh()} /> : null}
        {section === "shipping" ? <AdminShipping settings={store.settings} onSave={store.saveShipping} notify={notify} /> : null}
        {section === "users" ? <AdminUsers key={`users-${sectionQuery}`} users={store.users} orders={store.orders} onActiveChange={store.setUserActive} notify={notify} initialSearch={sectionQuery} /> : null}
        {section === "settings" ? <AdminSettings settings={store.settings} onSave={store.saveSettings} notify={notify} /> : null}
        {section === "trash" ? <AdminTrash key={`trash-${sectionQuery}`} items={store.trash} onRestore={store.restoreTrashItem} onPermanentlyDelete={store.permanentlyDeleteTrashItem} notify={notify} initialSearch={sectionQuery} /> : null}
        </> : null}
        <footer className="admin-page-foot"><span>Seven Sparkles</span><p>مدیریت فروشگاه سون اسپارکلز</p></footer>
      </main>
    </div>
    {searchOpen ? <GlobalSearch open onClose={() => setSearchOpen(false)} products={store.products} orders={store.orders} users={store.users} onNavigate={navigate} /> : null}
    {selectedOrder ? <OrderDetails key={selectedOrder.id} order={selectedOrder} users={store.users} onClose={() => setSelectedOrderId(null)} onStatusChange={store.setOrderStatus} notify={notify} /> : null}
    {toast ? <div className="admin-toast" role="status"><Icon name="check" size={19} />{toast.text}</div> : null}
  </div>;
}
