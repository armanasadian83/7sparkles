"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/dialog";
import { Icon } from "@/components/icons";
import { adminRequest, formatAdminDate } from "@/lib/admin-store";
import { formatPrice } from "@/lib/products";
import type { PaymentReceipt, PaymentReceiptStatus, PaymentReceiptsResponse } from "@/lib/payment-receipts";
import { AdminIcon, EmptyState } from "./admin-ui";
import { adminSectionHref } from "./admin-sidebar";
import styles from "./admin-payment-receipts.module.css";

const statusLabels: Record<PaymentReceiptStatus, string> = {
  pending: "در انتظار بررسی",
  approved: "تایید شده",
  rejected: "عدم تایید",
};

function ReceiptStatus({ status }: { status: PaymentReceiptStatus }) {
  return <span className={styles.status} data-status={status}>{statusLabels[status]}</span>;
}

function ReceiptImage({ receipt, large = false }: { receipt: PaymentReceipt; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={styles.imageError}><AdminIcon name="info" /><span>تصویر در دسترس نیست</span></span>;
  // Receipt files require the current admin cookie and must bypass public image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={receipt.fileUrl} alt={`رسید پرداخت سفارش ${receipt.orderId}`} className={large ? styles.largeImage : styles.thumbnailImage} loading={large ? "eager" : "lazy"} referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

function ReceiptReview({ receipt, onClose, onReviewed }: { receipt: PaymentReceipt; onClose: () => void; onReviewed: (receipt: PaymentReceipt) => void }) {
  const [note, setNote] = useState(receipt.reviewNote);
  const [saving, setSaving] = useState<PaymentReceiptStatus | null>(null);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  async function review(status: PaymentReceiptStatus) {
    if (pending.current) return;
    pending.current = true;
    setSaving(status);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const result = await adminRequest<{ receipt: PaymentReceipt }>(`/api/admin/payment-receipts/${encodeURIComponent(receipt.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote: note.trim() }), signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      onReviewed(result.receipt);
      onClose();
    } catch (cause) {
      if (request.current !== controller) return;
      setError(controller.signal.aborted ? "زمان درخواست به پایان رسید. وضعیت رسید را به‌روزرسانی و دوباره بررسی کنید." : cause instanceof Error ? cause.message : "ذخیره بررسی رسید انجام نشد.");
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) { pending.current = false; setSaving(null); request.current = null; }
    }
  }
  return <Dialog open onClose={() => { if (!pending.current) onClose(); }} title="بررسی رسید پرداخت" className={`admin-dialog ${styles.dialog}`}>
    <div className={styles.reviewHeading}><ReceiptStatus status={receipt.status} /><span>{formatAdminDate(receipt.createdAt)}</span></div>
    <div className={styles.reviewLayout}>
      <div className={styles.imagePreview}><ReceiptImage receipt={receipt} large /><a href={receipt.fileUrl} target="_blank" rel="noopener noreferrer" className={styles.openImage}>مشاهده تصویر در اندازه اصلی <AdminIcon name="external" /></a></div>
      <div className={styles.reviewInfo}>
        <dl><div><dt>شماره سفارش</dt><dd><Link href={adminSectionHref("orders", receipt.orderId)} onClick={onClose}><bdi>{receipt.orderId}</bdi><AdminIcon name="external" /></Link></dd></div><div><dt>مشتری</dt><dd>{receipt.customerName || "—"}</dd></div><div><dt>مبلغ سفارش</dt><dd>{receipt.orderTotal === null ? "ثبت نشده" : <>{formatPrice(receipt.orderTotal)} <small>تومان</small></>}</dd></div>{receipt.reviewedAt ? <div><dt>آخرین بررسی</dt><dd>{formatAdminDate(receipt.reviewedAt)}</dd></div> : null}<div><dt>نام فایل</dt><dd className={styles.fileName} dir="auto">{receipt.originalName}</dd></div></dl>
        <label className="admin-field">یادداشت بررسی <small className="admin-muted">(اختیاری؛ قابل مشاهده برای مشتری)</small><textarea rows={4} maxLength={1000} disabled={Boolean(saving)} value={note} onChange={event => setNote(event.target.value)} placeholder="برای مثال: تصویر رسید خوانا نیست؛ لطفاً دوباره ارسال کنید." /></label>
        <p className={styles.hint}>با تایید رسید، وضعیت پرداخت سفارش «پرداخت‌شده» می‌شود. عدم تایید همه رسیدها، وضعیت پرداخت را به «پرداخت‌نشده» برمی‌گرداند.</p>
        {error ? <p className="admin-error" role="alert">{error}</p> : null}
        <div className={styles.reviewActions} aria-busy={Boolean(saving)}>
          <button className="admin-button" type="button" disabled={Boolean(saving)} onClick={() => void review("approved")}><Icon name="check" size={18} />{saving === "approved" ? "در حال ذخیره..." : "تایید رسید"}</button>
          <button className={`admin-button secondary ${styles.reject}`} type="button" disabled={Boolean(saving)} onClick={() => void review("rejected")}><Icon name="close" size={17} />{saving === "rejected" ? "در حال ذخیره..." : "عدم تایید"}</button>
          {receipt.status !== "pending" ? <button className={`admin-button secondary ${styles.reset}`} type="button" disabled={Boolean(saving)} onClick={() => void review("pending")}>{saving === "pending" ? "در حال ذخیره..." : "بازگشت به انتظار بررسی"}</button> : null}
        </div>
      </div>
    </div>
  </Dialog>;
}

function ReceiptList({ query, status, notify, onReviewed }: { query: string; status: string; notify: (message: string) => void; onReviewed: () => void }) {
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PaymentReceipt | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const lastRequest = useRef<{ cursor: string | null; replace: boolean }>({ cursor: null, replace: true });
  const load = useCallback(async (cursor: string | null, replace: boolean) => {
    if (!replace && inFlight.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const version = ++generation.current;
    inFlight.current = true;
    lastRequest.current = { cursor, replace };
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status !== "all") params.set("status", status);
    if (cursor) params.set("cursor", cursor);
    try {
      const result = await adminRequest<PaymentReceiptsResponse>(`/api/admin/payment-receipts?${params}`, { signal: controller.signal });
      if (version !== generation.current || controller.signal.aborted) return;
      if (!result || !Array.isArray(result.receipts) || !Number.isSafeInteger(result.total) || result.total < 0 || !(result.nextCursor === null || typeof result.nextCursor === "string")) throw new Error("اطلاعات رسیدها قابل دریافت نیست. دوباره تلاش کنید.");
      setReceipts(previous => replace ? result.receipts : [...new Map([...previous, ...result.receipts].map(receipt => [receipt.id, receipt])).values()]);
      setTotal(result.total);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      if (version !== generation.current) return;
      setError(controller.signal.aborted ? "زمان دریافت رسیدها به پایان رسید. دوباره تلاش کنید." : cause instanceof Error ? cause.message : "دریافت رسیدها انجام نشد.");
    } finally {
      window.clearTimeout(timeout);
      if (version === generation.current) { setLoading(false); inFlight.current = false; request.current = null; }
    }
  }, [query, status]);
  const cancelLoad = useCallback(() => { ++generation.current; request.current?.abort(); }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(null, true); });
    return () => { active = false; cancelLoad(); };
  }, [load, cancelLoad]);
  function beginLoad(cursor: string | null, replace: boolean) {
    if (!replace && inFlight.current) return;
    setLoading(true);
    setError("");
    void load(cursor, replace);
  }
  function reviewed(receipt: PaymentReceipt) {
    setReceipts(previous => previous.map(item => item.id === receipt.id ? receipt : item));
    notify("وضعیت رسید پرداخت ذخیره شد.");
    onReviewed();
    beginLoad(null, true);
  }
  return <>
    <div className={styles.listHeading}><span>{formatPrice(total)} رسید{query || status !== "all" ? " مطابق فیلتر" : " ثبت‌شده"}</span><button className="admin-button secondary small" type="button" disabled={loading} onClick={() => beginLoad(null, true)}>به‌روزرسانی رسیدها</button></div>
    {loading ? <p className={styles.loading} role="status">در حال دریافت رسیدهای پرداخت...</p> : null}
    {error ? <div className={styles.error} role="alert"><p>{error}</p><button className="admin-button secondary small" type="button" onClick={() => beginLoad(lastRequest.current.cursor, lastRequest.current.replace)}>تلاش دوباره</button></div> : null}
    {receipts.length ? <div className={styles.grid}>{receipts.map(receipt => <article className={styles.card} key={receipt.id} data-payment-receipt={receipt.id}>
      <button className={styles.thumbnail} type="button" aria-label={`بررسی رسید سفارش ${receipt.orderId}`} onClick={() => setSelected(receipt)}><ReceiptImage receipt={receipt} /><span><AdminIcon name="eye" />مشاهده رسید</span></button>
      <div className={styles.cardBody}><div className={styles.cardMeta}><ReceiptStatus status={receipt.status} /><time dateTime={receipt.createdAt}>{formatAdminDate(receipt.createdAt)}</time></div><span className={styles.orderLabel}>شماره سفارش</span><Link className={styles.orderId} href={adminSectionHref("orders", receipt.orderId)}><bdi>{receipt.orderId}</bdi><AdminIcon name="external" /></Link><div className={styles.customer}><span>{receipt.customerName || "مشتری"}</span><strong>{receipt.orderTotal === null ? "—" : <>{formatPrice(receipt.orderTotal)} <small>تومان</small></>}</strong></div>{receipt.reviewNote ? <p className={styles.note}>{receipt.reviewNote}</p> : null}<button className="admin-button secondary" type="button" onClick={() => setSelected(receipt)}>{receipt.status === "pending" ? "بررسی و تعیین وضعیت" : "مشاهده و ویرایش بررسی"}<AdminIcon name="chevron" /></button></div>
    </article>)}</div> : !loading && !error ? <EmptyState title={query || status !== "all" ? "رسیدی با این مشخصات پیدا نشد" : "هنوز رسید پرداختی ارسال نشده است"} description={query || status !== "all" ? "عبارت جستجو یا وضعیت انتخاب‌شده را تغییر دهید." : "رسیدهای ارسالی مشتریان، همراه با شماره سفارش در این بخش نمایش داده می‌شوند."} /> : null}
    {nextCursor && !error ? <div className={styles.pagination}><button type="button" className="admin-button secondary" disabled={loading} onClick={() => beginLoad(nextCursor, false)}>{loading ? "در حال دریافت..." : "نمایش رسیدهای بیشتر"}</button></div> : null}
    {selected ? <ReceiptReview key={selected.id} receipt={selected} onClose={() => setSelected(null)} onReviewed={reviewed} /> : null}
  </>;
}

export function AdminPaymentReceipts({ initialSearch = "", notify, onReviewed }: { initialSearch?: string; notify: (message: string) => void; onReviewed: () => void }) {
  const [search, setSearch] = useState(initialSearch);
  const [query, setQuery] = useState(initialSearch.trim());
  const [status, setStatus] = useState("all");
  function searchReceipts(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setQuery(search.trim()); }
  return <section className={`admin-panel ${styles.panel}`} data-admin-payment-receipts>
    <div className="admin-panel-heading"><div><h2>رسیدهای پرداخت</h2><p>تصویر رسید، شماره سفارش و نتیجه بررسی هر پرداخت را مدیریت کنید.</p></div><span className={styles.headingIcon}><AdminIcon name="orders" /></span></div>
    <form className={`admin-toolbar ${styles.toolbar}`} onSubmit={searchReceipts}><label className="admin-search-field"><Icon name="search" size={19} /><input aria-label="جستجوی رسید با شماره سفارش" placeholder="جستجو با شماره سفارش..." maxLength={200} value={search} onChange={event => setSearch(event.target.value)} /></label><button className="admin-button secondary" type="submit">جستجو</button><label className="admin-filter"><span className="sr-only">وضعیت رسید پرداخت</span><select aria-label="فیلتر وضعیت رسید پرداخت" value={status} onChange={event => setStatus(event.target.value)}><option value="all">همه وضعیت‌ها</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{query || status !== "all" ? <button type="button" className={styles.clear} onClick={() => { setSearch(""); setQuery(""); setStatus("all"); }}>پاک کردن فیلترها</button> : null}</form>
    <ReceiptList key={`${query}:${status}`} query={query} status={status} notify={notify} onReviewed={onReviewed} />
  </section>;
}
