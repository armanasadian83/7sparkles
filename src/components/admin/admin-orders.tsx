"use client";

import { useState } from "react";
import { Dialog } from "@/components/dialog";
import { Icon } from "@/components/icons";
import { formatPrice } from "@/lib/products";
import { formatAdminDate, normalizeAdminSearch, orderStatusLabels, orderTotal, type AdminOrder, type AdminUser, type OrderStatus } from "@/lib/admin-store";
import { AdminIcon, EmptyState, StatusBadge } from "./admin-ui";

type OrdersProps = {
  orders: AdminOrder[];
  users: AdminUser[];
  onStatusChange: (id: string, status: OrderStatus) => Promise<void>;
  notify: (message: string) => void;
  initialSearch?: string;
};
export function OrdersTable({ orders, users, onSelect }: { orders: AdminOrder[]; users: AdminUser[]; onSelect: (order: AdminOrder) => void }) {
  if (!orders.length) return <EmptyState title="هنوز سفارشی ثبت نشده است" description="سفارش‌های ثبت‌شده در این بخش نمایش داده می‌شوند." />;
  const userMap = new Map(users.map(user => [user.id, user]));
  return <div className="admin-table-scroll"><table className="admin-table orders-table">
    <thead><tr><th scope="col">شماره سفارش</th><th scope="col">مشتری</th><th scope="col">تاریخ ثبت</th><th scope="col">مبلغ <small>(تومان)</small></th><th scope="col">وضعیت</th><th scope="col"><span className="sr-only">مشاهده</span></th></tr></thead>
    <tbody>{orders.map(order => <tr key={order.id}>
      <td><span className="admin-order-id" dir="ltr">{order.id}</span></td>
      <td>{order.checkout?.recipient.name ?? userMap.get(order.userId)?.name ?? "مشتری ناشناس"}</td>
      <td className="admin-muted">{formatAdminDate(order.createdAt)}</td>
      <td className="admin-number">{formatPrice(orderTotal(order))}</td>
      <td><StatusBadge status={order.status} />{order.checkout ? <small className="admin-order-unpaid">{order.checkout.paymentStatus === "paid" ? "پرداخت تایید شده" : "پرداخت‌نشده"}</small> : null}</td>
      <td><button type="button" className="admin-icon-button" aria-label={`مشاهده سفارش ${order.id}`} onClick={() => onSelect(order)}><AdminIcon name="eye" /></button></td>
    </tr>)}</tbody>
  </table></div>;
}
export function OrderDetails({ order, users, onClose, onStatusChange, notify }: { order: AdminOrder; users: AdminUser[]; onClose: () => void; onStatusChange: OrdersProps["onStatusChange"]; notify: OrdersProps["notify"] }) {
  const customer = users.find(user => user.id === order.userId);
  const checkout = order.checkout;
  const [status, setStatus] = useState(order.status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try { await onStatusChange(order.id, status); notify("وضعیت سفارش ذخیره شد."); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "ذخیره وضعیت سفارش انجام نشد."); }
    finally { setPending(false); }
  }
  return <Dialog open onClose={() => { if (!pending) onClose(); }} title={`جزئیات سفارش ${order.id}`} className="admin-dialog">
    <div className="admin-detail-meta">
      <div><span>مشتری</span><strong>{checkout?.recipient.name ?? customer?.name ?? "مشتری ناشناس"}</strong></div>
      <div><span>تاریخ ثبت</span><strong>{formatAdminDate(order.createdAt)}</strong></div>
      <div><span>شماره تماس</span><strong dir="ltr">{checkout?.recipient.phone ?? customer?.phone ?? "—"}</strong></div>
      <div><span>شهر</span><strong>{checkout ? `${checkout.address.province}، ${checkout.address.city}` : customer?.city ?? "—"}</strong></div>
    </div>
    {checkout ? <section className="admin-order-delivery" aria-label="اطلاعات تحویل سفارش">
      <h3>اطلاعات تحویل و پرداخت</h3>
      <dl><div><dt>نشانی گیرنده</dt><dd>{checkout.address.address}</dd></div><div><dt>کد پستی</dt><dd><bdi dir="ltr">{checkout.address.postalCode}</bdi></dd></div><div><dt>روش ارسال</dt><dd>{checkout.shipping.name}</dd></div><div><dt>هزینه ارسال</dt><dd>{checkout.shipping.postpaid ? "پس‌کرایه؛ پرداخت جداگانه هنگام تحویل" : checkout.shipping.fee ? `${formatPrice(checkout.shipping.fee)} تومان` : "رایگان"}</dd></div><div><dt>وضعیت پرداخت</dt><dd>{checkout.paymentStatus === "paid" ? "تایید شده با بررسی رسید پرداخت" : "پرداخت‌نشده · در انتظار بررسی فروشگاه"}</dd></div>{checkout.notes ? <div><dt>یادداشت مشتری</dt><dd>{checkout.notes}</dd></div> : null}</dl>
    </section> : null}
    <h3 className="admin-dialog-subtitle">اقلام سفارش</h3>
    <ul className="admin-order-items">{order.items.map((item, index) => <li key={`${item.productId}-${index}`}><div><strong>{item.name}</strong>{item.variantLabel ? <small className="admin-order-variant">{item.variantLabel}</small> : null}<span>{formatPrice(item.quantity)} عدد × {formatPrice(item.price)} تومان</span></div><b>{formatPrice(item.price * item.quantity)}</b></li>)}</ul>
    <div className="admin-order-total"><span>مجموع سفارش</span><strong>{formatPrice(orderTotal(order))} <small>تومان</small></strong></div>
    <form onSubmit={submit} aria-busy={pending}><fieldset disabled={pending} className="admin-form-fields">
      <label className="admin-field">وضعیت سفارش<select value={status} onChange={event => setStatus(event.target.value as OrderStatus)}>{Object.entries(orderStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      {error ? <p role="alert" className="admin-error">{error}</p> : null}
      <div className="admin-dialog-actions"><button className="admin-button" type="submit"><Icon name="check" size={18} />{pending ? "در حال ذخیره..." : "ذخیره وضعیت"}</button><button className="admin-button secondary" type="button" onClick={onClose}>بستن</button></div>
      </fieldset>
    </form>
  </Dialog>;
}
export function AdminOrders({ orders, users, onStatusChange, notify, initialSearch = "" }: OrdersProps) {
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = normalizeAdminSearch(search);
  const userMap = new Map(users.map(user => [user.id, user]));
  const filtered = orders.filter(order => (status === "all" || order.status === status) && normalizeAdminSearch(`${order.id} ${order.checkout?.recipient.name ?? userMap.get(order.userId)?.name ?? ""} ${order.checkout?.recipient.phone ?? ""}`).includes(query));
  const selected = orders.find(order => order.id === selectedId);
  return <section className="admin-panel">
    <div className="admin-panel-heading"><div><h2>همه سفارشات <span className="admin-count">{formatPrice(orders.length)}</span></h2><p>سفارش‌های فروشگاه و وضعیت آماده‌سازی آن‌ها</p></div></div>
    <div className="admin-toolbar">
      <label className="admin-search-field"><Icon name="search" size={19} /><input aria-label="جستجوی سفارش" placeholder="شماره سفارش یا نام مشتری" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="admin-filter"><span className="sr-only">وضعیت سفارش</span><select aria-label="فیلتر وضعیت سفارش" value={status} onChange={event => setStatus(event.target.value)}><option value="all">همه وضعیت‌ها</option>{Object.entries(orderStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <span className="admin-result-count">{formatPrice(filtered.length)} سفارش</span>
    </div>
    {filtered.length ? <OrdersTable orders={filtered} users={users} onSelect={order => setSelectedId(order.id)} /> : orders.length ? <EmptyState /> : <EmptyState title="هنوز سفارشی ثبت نشده است" description="سفارش‌های ثبت‌شده در این بخش نمایش داده می‌شوند." />}
    {selected ? <OrderDetails key={selected.id} order={selected} users={users} onClose={() => setSelectedId(null)} onStatusChange={onStatusChange} notify={notify} /> : null}
  </section>;
}
