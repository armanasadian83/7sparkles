"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useCatalog } from "@/lib/catalog-store";
import { useCustomerSession } from "@/lib/customer-store";
import type { CustomerOrder, CustomerOrdersResponse } from "@/lib/customer-types";
import { formatPrice } from "@/lib/products";
import { Icon } from "../icons";
import { PaymentReceiptUploader } from "../payment-receipt-uploader";
import { ShopPanels } from "../shop-panels";
import { useShop } from "../shop-store";
import { StoreFooter } from "../store-footer";
import { StoreHeader, type Panel } from "../store-header";
import styles from "./myorders-page.module.css";

const orderDate = new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tehran" });
const statusLabels: Record<CustomerOrder["status"], string> = { processing: "در حال پردازش", shipped: "ارسال‌شده", delivered: "تحویل‌شده", cancelled: "لغوشده" };

function formatDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isFinite(date.getTime()) ? orderDate.format(date) : "تاریخ ثبت نشده";
}

function Money({ value, strong = false }: { value: number; strong?: boolean }) {
  return <span className={styles.money}>{strong ? <strong>{formatPrice(value)}</strong> : <bdi>{formatPrice(value)}</bdi>}<small>تومان</small></span>;
}

function DownArrow({ open }: { open: boolean }) {
  return <svg className={styles.downArrow} data-open={open} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
}

function OrderItem({ item }: { item: CustomerOrder["items"][number] }) {
  const image = <span className={styles.itemImage}>{item.image ? <Image src={item.image} alt="" width={100} height={116} sizes="(max-width: 600px) 58px, 74px" /> : <Icon name="bag" size={27} />}</span>;
  return <li className={styles.item} data-order-item={item.productId}>
    {item.slug ? <Link href={`/product/${encodeURIComponent(item.slug)}`} aria-label={`مشاهده ${item.name}`}>{image}</Link> : image}
    <div className={styles.itemInfo}><h3>{item.slug ? <Link href={`/product/${encodeURIComponent(item.slug)}`}>{item.name}</Link> : item.name}</h3>{item.variantLabel ? <p>{item.variantLabel}</p> : null}{item.sku ? <span className={styles.sku}>کد محصول: <bdi dir="ltr">{item.sku}</bdi></span> : null}<span className={styles.unitPrice}>{formatPrice(item.quantity)} عدد × <Money value={item.unitPrice} /></span></div>
    <div className={styles.itemTotal}><Money value={item.lineTotal} strong /></div>
  </li>;
}

function OrderCard({ order, expanded, onToggle }: { order: CustomerOrder; expanded: boolean; onToggle: () => void }) {
  const id = useId();
  const [paymentStatus, setPaymentStatus] = useState(order.paymentStatus);
  const titleId = `${id}-title`, detailsId = `${id}-details`;
  const delivery = order.delivery;
  return <article className={styles.order} data-order-id={order.id} data-expanded={expanded}>
    <h2 className="sr-only" id={titleId}>سفارش {order.id}</h2>
    <button className={styles.summary} type="button" data-order-toggle aria-expanded={expanded} aria-controls={detailsId} aria-describedby={`${id}-status ${id}-facts`} aria-label={`${expanded ? "بستن" : "نمایش"} جزئیات سفارش ${order.id}`} onClick={onToggle}>
      <span className={styles.summaryTop}><span className={styles.reference}><small>شماره سفارش</small><bdi dir="ltr">{order.id}</bdi></span><span className={styles.status} id={`${id}-status`} data-status={order.status}><i />{statusLabels[order.status]}</span></span>
      <span className={styles.summaryBody}><span className={styles.preview}>{order.items.slice(0, 3).map((item, index) => <span key={`${item.productId}-${index}`}>{item.image ? <Image src={item.image} alt="" width={70} height={80} sizes="50px" /> : <Icon name="bag" size={22} />}</span>)}{order.items.length > 3 ? <span className={styles.morePreview}>+{formatPrice(order.items.length - 3)}</span> : null}</span><span className={styles.summaryFacts} id={`${id}-facts`}><span><small>تاریخ ثبت</small><span>{formatDate(order.createdAt)}</span></span><span><small>تعداد کالا</small><span>{formatPrice(order.totalQuantity)} عدد</span></span><span><small>مبلغ سفارش</small><Money value={order.total} strong /></span></span></span>
      <span className={styles.summaryBottom}><span className={styles.payment} data-payment={paymentStatus}>{paymentStatus === "paid" ? "پرداخت تایید شده" : paymentStatus === "unpaid" ? "پرداخت‌نشده" : "وضعیت پرداخت ثبت نشده"}</span><span className={styles.expandLabel}>{expanded ? "بستن جزئیات" : "جزئیات سفارش"}<span className={styles.arrowButton}><DownArrow open={expanded} /></span></span></span>
    </button>
    <div className={styles.details} id={detailsId} role="region" aria-labelledby={titleId} hidden={!expanded} data-order-details>
      <section className={styles.itemsSection} aria-label="اقلام سفارش"><div className={styles.detailHeading}><h3>کالاهای سفارش</h3><span>{formatPrice(order.totalQuantity)} عدد</span></div><ul className={styles.items}>{order.items.map((item, index) => <OrderItem key={`${item.productId}-${index}`} item={item} />)}</ul></section>
      <div className={styles.detailGrid}>
        <section className={styles.delivery} aria-label="اطلاعات دریافت و ارسال"><h3>اطلاعات دریافت و ارسال</h3>{delivery ? <dl><div><dt>گیرنده</dt><dd>{delivery.recipient.name}</dd></div><div><dt>شماره همراه</dt><dd><bdi dir="ltr">{delivery.recipient.phone}</bdi></dd></div><div><dt>نشانی</dt><dd>{delivery.address.province}، {delivery.address.city}، {delivery.address.address}</dd></div><div><dt>کد پستی</dt><dd><bdi dir="ltr">{delivery.address.postalCode}</bdi></dd></div><div><dt>روش ارسال</dt><dd>{delivery.shipping.name}{delivery.shipping.postpaid ? <span className={styles.postpaid}>پس‌کرایه؛ پرداخت هنگام تحویل</span> : null}</dd></div></dl> : <p className={styles.missing}>اطلاعات دریافت و ارسال برای این سفارش ثبت نشده است.</p>}{delivery?.notes ? <div className={styles.notes}><span>یادداشت سفارش</span><p>{delivery.notes}</p></div> : null}</section>
        <section className={styles.totals} aria-label="خلاصه مبالغ سفارش"><h3>خلاصه سفارش</h3><dl>{order.discount !== null && order.discount > 0 ? <><div><dt>جمع کالاها پیش از تخفیف</dt><dd><Money value={order.productSubtotal + order.discount} /></dd></div><div className={styles.discount}><dt>تخفیف محصولات</dt><dd>− <Money value={order.discount} /></dd></div></> : null}<div><dt>ارزش محصولات</dt><dd><Money value={order.productSubtotal} /></dd></div><div><dt>هزینه ارسال</dt><dd>{delivery?.shipping.postpaid ? "پس‌کرایه" : order.shippingFee === null ? "ثبت نشده" : order.shippingFee === 0 ? "رایگان" : <Money value={order.shippingFee} />}</dd></div><div className={styles.grandTotal}><dt>مبلغ سفارش</dt><dd><Money value={order.total} strong /></dd></div><div><dt>وضعیت پرداخت</dt><dd className={styles.paymentText}>{paymentStatus === "paid" ? "پرداخت تایید شده" : paymentStatus === "unpaid" ? "پرداخت‌نشده" : "ثبت نشده"}</dd></div></dl>{delivery?.shipping.postpaid ? <p className={styles.totalNote}>هزینه پس‌کرایه در مبلغ سفارش محاسبه نشده است.</p> : null}</section>
      </div>
      {expanded ? <PaymentReceiptUploader orderId={order.id} disabled={order.status === "cancelled"} onPaymentStatusChange={order.paymentStatus === "unknown" ? undefined : setPaymentStatus} /> : null}
    </div>
  </article>;
}

type OrdersState = { orders: CustomerOrder[]; nextCursor: string | null; loaded: boolean; loading: boolean; error: string };
const INITIAL_ORDERS: OrdersState = { orders: [], nextCursor: null, loaded: false, loading: true, error: "" };

function OrderHistory({ customerId, refreshSession }: { customerId: string; refreshSession: () => Promise<void> }) {
  const [state, setState] = useState<OrdersState>(INITIAL_ORDERS);
  const [expanded, setExpanded] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const version = useRef(0);
  const lastCursor = useRef<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async (cursor: string | null) => {
    const token = ++version.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    lastCursor.current = cursor;
    setState(current => ({ ...(cursor ? current : INITIAL_ORDERS), loading: true, error: "" }));
    if (!cursor) setExpanded(null);
    try {
      const response = await fetch(`/api/customer/orders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      const result = await response.json().catch(() => null) as (CustomerOrdersResponse & { error?: string }) | null;
      if (token !== version.current || controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        setState({ orders: [], nextCursor: null, loaded: true, loading: false, error: "نشست شما پایان یافته است. دوباره وارد حساب خود شوید." });
        void refreshSession();
        return;
      }
      if (!response.ok) throw new Error(result?.error || "دریافت سفارش‌ها انجام نشد. دوباره تلاش کنید.");
      if (result?.customerId !== customerId) {
        setState({ orders: [], nextCursor: null, loaded: true, loading: false, error: "حساب کاربری تغییر کرده است؛ در حال بررسی دوباره حساب…" });
        void refreshSession();
        return;
      }
      if (!result || !Array.isArray(result.orders) || !(result.nextCursor === null || typeof result.nextCursor === "string")) throw new Error("اطلاعات سفارش‌ها قابل دریافت نیست. دوباره تلاش کنید.");
      setState(current => {
        const combined = cursor ? [...current.orders, ...result.orders] : result.orders;
        const seen = new Set<string>();
        const orders = combined.filter(order => { if (seen.has(order.id)) return false; seen.add(order.id); return true; });
        return { orders, nextCursor: result.nextCursor, loaded: true, loading: false, error: "" };
      });
    } catch (cause) {
      if (token !== version.current || controller.signal.aborted) return;
      setState(current => ({ ...current, loaded: true, loading: false, error: cause instanceof Error ? cause.message : "ارتباط با فروشگاه برقرار نشد." }));
    }
  }, [customerId, refreshSession]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    queueMicrotask(() => { if (active) void load(null); });
    // The shared customer store owns focus/pageshow/visibility listeners.
    // Background account checks preserve selected receipt files and loaded pages.
    return () => { active = false; mounted.current = false; request.current?.abort(); };
  }, [load]);

  async function refreshOrders() {
    await refreshSession();
    if (mounted.current) await load(null);
  }

  return <section className={styles.history} aria-label="فهرست سفارشات من" aria-busy={state.loading}>
    <div className={styles.listHeading}><p>جدیدترین سفارش‌ها در ابتدای فهرست هستند.</p><button type="button" className={styles.refresh} disabled={state.loading} onClick={() => void refreshOrders()} data-myorders-refresh><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1a8 8 0 0 1 13 2.3M4.9 15.6a8 8 0 0 0 13 2.3" /></svg>{state.loading ? "در حال دریافت…" : "به‌روزرسانی سفارش‌ها"}</button></div>
    {!state.loaded ? <div className={styles.loading} role="status"><span /><p>در حال دریافت سفارش‌های شما…</p></div> : null}
    {state.error ? <div className={styles.error} role="alert"><p>{state.error}</p><button type="button" disabled={state.loading} onClick={() => void load(lastCursor.current)}>تلاش دوباره</button></div> : null}
    {state.loaded && !state.error && !state.orders.length ? <div className={styles.empty}><span className={styles.emptyIcon}><Icon name="bag" size={34} /></span><h2>هنوز سفارشی ثبت نکرده‌اید</h2><p>بعد از ثبت اولین سفارش، می‌توانید جزئیات و وضعیت آن را اینجا ببینید.</p><Link className={styles.primary} href="/shop">کشف محصولات <Icon name="arrow" size={18} /></Link></div> : null}
    <div className={styles.orders}>{state.orders.map(order => <OrderCard key={`${order.id}:${order.paymentStatus}`} order={order} expanded={expanded === order.id} onToggle={() => setExpanded(current => current === order.id ? null : order.id)} />)}</div>
    {state.nextCursor ? <button className={styles.loadMore} type="button" data-myorders-more disabled={state.loading} onClick={() => void load(state.nextCursor)}>{state.loading ? "در حال دریافت…" : "نمایش سفارش‌های بیشتر"}<Icon name="plus" size={16} /></button> : null}
  </section>;
}

export function MyOrdersPage() {
  const router = useRouter();
  const { bfcacheId } = router;
  const catalog = useCatalog();
  const shop = useShop();
  const auth = useCustomerSession();
  const [panel, setPanel] = useState<Panel>(null);
  return <>
    <a className="skip-link" href="#myorders-main">رفتن به سفارشات من</a>
    <StoreHeader cartCount={shop.cartCount} favoriteCount={shop.favorites.length} announcement={catalog.settings?.announcement ?? ""} storeName={catalog.settings?.storeName} openPanel={setPanel} activePage="myorders" />
    <main id="myorders-main" className={styles.page} data-myorders-page>
      <nav className={styles.breadcrumb} aria-label="مسیر صفحه"><Link href="/">خانه</Link><span aria-hidden="true">‹</span><span>حساب کاربری</span><span aria-hidden="true">‹</span><span aria-current="page">سفارشات من</span></nav>
      <div className={styles.heading}><div><span className={styles.eyebrow}>همراه سون اسپارکلز</span><h1>سفارشات من</h1><p>خریدهای شما و جزئیات هر سفارش، در یک نگاه.</p></div><span className={styles.headingIcon} aria-hidden="true"><Icon name="bag" size={36} /></span></div>
      {!auth.loaded || auth.loading ? <div className={styles.loading} role="status"><span /><p>در حال بررسی حساب شما…</p></div> : auth.error ? <div className={styles.error} role="alert"><p>{auth.error}</p><button type="button" onClick={() => void auth.refresh()}>تلاش دوباره</button></div> : !auth.customer ? <section className={styles.empty}><span className={styles.emptyIcon}><Icon name="user" size={33} /></span><h2>برای دیدن سفارش‌ها وارد شوید</h2><p>با شماره همراه حساب خود وارد شوید تا سفارش‌های ثبت‌شده‌تان را ببینید.</p><Link className={styles.primary} href="/login?next=/myorders" data-myorders-login>ورود به حساب <Icon name="arrow" size={18} /></Link></section> : null}
      {auth.loaded && !auth.error && auth.customer ? <div hidden={auth.loading} inert={auth.loading} data-private-order-history><OrderHistory key={`${bfcacheId}:${auth.customer.id}:${auth.customer.signedInAt}:${auth.version}`} customerId={auth.customer.id} refreshSession={auth.refresh} /></div> : null}
      <Link className={styles.shopLink} href="/shop">بازگشت به فروشگاه <Icon name="arrow" size={17} /></Link>
    </main>
    <StoreFooter settings={catalog.settings} openPanel={setPanel} />
    <ShopPanels panel={panel} close={() => setPanel(null)} openPanel={setPanel} chooseCategory={category => { setPanel(null); router.push(`/shop?category=${encodeURIComponent(category)}`); }} />
  </>;
}
