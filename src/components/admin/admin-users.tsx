"use client";

import { useState } from "react";
import { Dialog } from "@/components/dialog";
import { Icon } from "@/components/icons";
import { formatPrice } from "@/lib/products";
import { formatAdminDate, normalizeAdminSearch, orderTotal, type AdminOrder, type AdminUser } from "@/lib/admin-store";
import { AdminIcon, EmptyState, StatusBadge } from "./admin-ui";

type Props = {
  users: AdminUser[];
  orders: AdminOrder[];
  onActiveChange: (id: string, active: boolean) => Promise<void>;
  notify: (message: string) => void;
  initialSearch?: string;
};
export function AdminUsers({ users, orders, onActiveChange, notify, initialSearch = "" }: Props) {
  const [search, setSearch] = useState(initialSearch);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const query = normalizeAdminSearch(search);
  const filtered = users.filter(user => (filter === "all" || user.active === (filter === "active")) && normalizeAdminSearch(`${user.name} ${user.city} ${user.phone}`).includes(query));
  const selected = users.find(user => user.id === selectedId);
  const selectedOrders = orders.filter(order => order.userId === selectedId);
  async function changeActive(user: AdminUser) {
    if (pending) return;
    setPending(true);
    setError("");
    try { await onActiveChange(user.id, !user.active); notify(user.active ? "کاربر غیرفعال شد." : "کاربر فعال شد."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تغییر وضعیت کاربر انجام نشد."); }
    finally { setPending(false); }
  }
  return <section className="admin-panel">
    <div className="admin-panel-heading"><div><h2>کاربران فروشگاه <span className="admin-count">{formatPrice(users.length)}</span></h2><p>اطلاعات و فعالیت مشتریان ثبت‌شده را ببینید.</p></div></div>
    <div className="admin-toolbar"><label className="admin-search-field"><Icon name="search" size={19} /><input aria-label="جستجوی کاربر" value={search} onChange={event => setSearch(event.target.value)} placeholder="نام، شهر یا شماره تماس..." /></label><select aria-label="فیلتر وضعیت کاربر" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">همه کاربران</option><option value="active">کاربران فعال</option><option value="inactive">کاربران غیرفعال</option></select><span className="admin-result-count">{formatPrice(filtered.length)} کاربر</span></div>
    {filtered.length ? <div className="admin-table-scroll"><table className="admin-table admin-users-table">
      <thead><tr><th scope="col">کاربر</th><th scope="col">شماره تماس</th><th scope="col">شهر</th><th scope="col">تاریخ عضویت</th><th scope="col">سفارشات</th><th scope="col">وضعیت</th><th scope="col"><span className="sr-only">مشاهده</span></th></tr></thead>
      <tbody>{filtered.map(user => <tr key={user.id}><td><button className="admin-user-cell" type="button" onClick={() => setSelectedId(user.id)}><span className="admin-avatar">{user.name[0]}</span><strong>{user.name}</strong></button></td><td dir="ltr" className="admin-phone">{user.phone}</td><td className="admin-muted">{user.city}</td><td className="admin-muted">{formatAdminDate(user.joinedAt)}</td><td>{formatPrice(orders.filter(order => order.userId === user.id).length)}</td><td><span className={`admin-status ${user.active ? "status-active" : "status-archived"}`}>{user.active ? "فعال" : "غیرفعال"}</span></td><td><button className="admin-icon-button" type="button" aria-label={`مشاهده کاربر ${user.name}`} onClick={() => setSelectedId(user.id)}><AdminIcon name="eye" /></button></td></tr>)}</tbody>
    </table></div> : users.length ? <EmptyState /> : <EmptyState title="هنوز مشتری‌ای ثبت نشده است" description="اطلاعات مشتریان پس از ثبت در سامانه، در این بخش نمایش داده می‌شود." />}
    {selected ? <Dialog open onClose={() => { if (!pending) { setSelectedId(null); setError(""); } }} title="پروفایل کاربر" className="admin-dialog">
      <div className="admin-profile-heading"><span className="admin-avatar large">{selected.name[0]}</span><div><h3>{selected.name}</h3><p dir="ltr">{selected.phone}</p></div><span className={`admin-status ${selected.active ? "status-active" : "status-archived"}`}>{selected.active ? "فعال" : "غیرفعال"}</span></div>
      <div className="admin-detail-meta"><div><span>شهر</span><strong>{selected.city}</strong></div><div><span>تاریخ عضویت</span><strong>{formatAdminDate(selected.joinedAt)}</strong></div><div><span>تعداد سفارشات</span><strong>{formatPrice(selectedOrders.length)} سفارش</strong></div><div><span>مجموع سفارشات غیرلغوشده</span><strong>{formatPrice(selectedOrders.filter(order => order.status !== "cancelled").reduce((sum, order) => sum + orderTotal(order), 0))} تومان</strong></div></div>
      <h3 className="admin-dialog-subtitle">تاریخچه سفارش‌ها</h3><div className="admin-user-orders">{selectedOrders.length ? selectedOrders.map(order => <div key={order.id}><span dir="ltr">{order.id}</span><span>{formatPrice(orderTotal(order))} تومان</span><StatusBadge status={order.status} /></div>) : <p className="admin-form-hint">این مشتری هنوز سفارشی ندارد.</p>}</div>
      {error ? <p role="alert" className="admin-error">{error}</p> : null}
      <div className="admin-dialog-actions"><button disabled={pending} className={`admin-button ${selected.active ? "secondary" : ""}`} type="button" onClick={() => void changeActive(selected)}>{pending ? "در حال ذخیره..." : selected.active ? "غیرفعال‌کردن کاربر" : "فعال‌کردن کاربر"}</button><button disabled={pending} className="admin-button secondary" type="button" onClick={() => { setSelectedId(null); setError(""); }}>بستن</button></div>
    </Dialog> : null}
  </section>;
}
