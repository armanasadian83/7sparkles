"use client";

import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from "react";
import type { PaymentReceipt } from "@/lib/payment-receipts";
import { Dialog } from "./dialog";
import { Icon } from "./icons";
import styles from "./payment-receipt-uploader.module.css";

const labels = { pending: "در انتظار بررسی", approved: "تایید شده", rejected: "عدم تایید" };
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
type Props = { orderId: string; token?: string; disabled?: boolean; onPaymentStatusChange?: (status: "paid" | "unpaid") => void };
type Selection = { file: File; url: string };

export function PaymentReceiptUploader({ orderId, token, disabled = false, onPaymentStatusChange }: Props) {
  const titleId = useId(), inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const requests = useRef(new Set<AbortController>());
  const alive = useRef(true);
  const pending = useRef(false);
  const loadVersion = useRef(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const approved = receipts.some(receipt => receipt.status === "approved");
  const awaitingReview = receipts.some(receipt => receipt.status === "pending");
  const blocked = disabled || uploading || loading || !loaded || approved || awaitingReview;
  const showUploader = loaded && !loading && !disabled && !approved && !awaitingReview;
  const endpoint = `/api/orders/${encodeURIComponent(orderId)}/payment-receipts`;

  const request = useCallback(async (url: string, init?: RequestInit) => {
    const controller = new AbortController();
    requests.current.add(controller);
    const timer = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const headers = new Headers(init?.headers);
      if (token) headers.set("X-Receipt-Token", token);
      const response = await fetch(url, { ...init, headers, cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "دریافت اطلاعات رسید انجام نشد. دوباره تلاش کنید.");
      }
      // Consume the response while the timeout and abort protection are active.
      return response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.blob();
    } catch (cause) {
      if (controller.signal.aborted) throw new Error("زمان ارتباط با سرور به پایان رسید. دوباره تلاش کنید.");
      throw cause;
    } finally { window.clearTimeout(timer); requests.current.delete(controller); }
  }, [token]);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const result = await request(endpoint) as { receipts: PaymentReceipt[] };
      if (!alive.current || version !== loadVersion.current) return;
      if (!Array.isArray(result.receipts)) throw new Error("اطلاعات رسیدها قابل دریافت نیست.");
      setReceipts(result.receipts);
      setLoaded(true);
      onPaymentStatusChange?.(result.receipts.some(receipt => receipt.status === "approved") ? "paid" : "unpaid");
    } catch (cause) {
      if (alive.current && version === loadVersion.current) setError(cause instanceof Error ? cause.message : "ارتباط با سرور برقرار نشد.");
    } finally { if (alive.current && version === loadVersion.current) setLoading(false); }
  }, [endpoint, request, onPaymentStatusChange]);

  const cancelLoad = useCallback(() => { ++loadVersion.current; }, []);

  useEffect(() => {
    alive.current = true;
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    const activeRequests = requests.current, activeUrls = urls.current;
    return () => {
      active = false;
      alive.current = false;
      cancelLoad();
      activeRequests.forEach(controller => controller.abort());
      activeUrls.forEach(url => URL.revokeObjectURL(url));
      activeUrls.clear();
    };
  }, [load, cancelLoad]);

  function release(url?: string) {
    if (!url) return;
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  }
  function choose(file?: File) {
    if (blocked || !file) return;
    setError(""); setSuccess("");
    if (!acceptedTypes.has(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
      setError("یک تصویر JPG، PNG یا WebP با حجم حداکثر ۵ مگابایت انتخاب کنید.");
      if (input.current) input.current.value = "";
      return;
    }
    release(selection?.url);
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    setSelection({ file, url });
  }
  function removeSelection() {
    release(selection?.url); setSelection(null);
    if (input.current) input.current.value = "";
  }
  async function upload() {
    if (pending.current || blocked || !selection) return;
    pending.current = true; setUploading(true); setError(""); setSuccess("");
    const body = new FormData(); body.set("file", selection.file);
    try {
      const result = await request(endpoint, { method: "POST", body }) as { receipt: PaymentReceipt };
      if (!alive.current) return;
      setReceipts(current => [result.receipt, ...current.filter(receipt => receipt.id !== result.receipt.id)]);
      removeSelection();
      setSuccess("رسید شما ارسال شد و در انتظار بررسی فروشگاه است.");
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "ارسال رسید انجام نشد. دوباره تلاش کنید."); }
    finally { pending.current = false; if (alive.current) setUploading(false); }
  }
  async function view(receipt: PaymentReceipt) {
    if (openingId) return;
    setOpeningId(receipt.id); setError("");
    try {
      const blob = await request(receipt.fileUrl) as Blob;
      if (!alive.current) return;
      const url = URL.createObjectURL(blob); urls.current.add(url);
      setPreview({ url, title: "تصویر رسید پرداخت" });
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "تصویر رسید دریافت نشد."); }
    finally { if (alive.current) setOpeningId(null); }
  }
  function closePreview() { release(preview?.url); setPreview(null); }
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false);
    if (event.dataTransfer.files.length > 1) { setError("هر بار یک تصویر رسید انتخاب کنید."); return; }
    choose(event.dataTransfer.files[0]);
  }

  return <section className={styles.box} aria-labelledby={titleId} data-payment-receipt-uploader>
    <div className={styles.heading}><span className={styles.icon}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6" /></svg></span><div><h3 id={titleId}>{approved || awaitingReview ? "رسید پرداخت سفارش" : "بارگذاری رسید پرداخت"}</h3><p>{approved || awaitingReview ? "وضعیت بررسی رسید و پیام فروشگاه را در این بخش ببینید." : "تصویر رسید واریز خود را برای بررسی و تایید فروشگاه ارسال کنید."}</p></div></div>
    <div className={styles.orderReference}><span>برای سفارش</span><bdi dir="ltr">{orderId}</bdi></div>
    {showUploader ? <>
      <div className={styles.dropzone} data-dragging={dragging} aria-busy={uploading} onDragOver={event => { event.preventDefault(); if (!blocked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
        <input className={styles.fileInput} ref={input} id={inputId} type="file" accept="image/jpeg,image/png,image/webp" disabled={blocked} onChange={event => choose(event.target.files?.[0])} aria-label="انتخاب تصویر رسید پرداخت" />
        {selection ? <div className={styles.selection}>
          {/* Blob previews are private browser resources, never image-optimizer inputs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selection.url} alt="پیش‌نمایش رسید انتخاب‌شده" />
          <div><strong dir="auto">{selection.file.name}</strong><small>آماده ارسال</small></div><button type="button" className={styles.remove} disabled={uploading} onClick={removeSelection} aria-label="حذف تصویر انتخاب‌شده"><Icon name="close" size={18} /></button>
        </div> : <div className={styles.dropContent}><svg className={styles.uploadIcon} width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" /></svg><strong>تصویر رسید را اینجا رها کنید</strong><span>یا از دستگاه خود انتخاب کنید</span><button className={styles.choose} type="button" disabled={blocked} onClick={() => input.current?.click()}>انتخاب تصویر رسید</button></div>}
        <p className={styles.fileHint}>JPG، PNG یا WebP · حداکثر ۵ مگابایت</p>
      </div>
      {selection ? <button className={styles.submit} type="button" disabled={blocked} onClick={() => void upload()} data-receipt-submit>{uploading ? "در حال ارسال رسید…" : "ارسال رسید پرداخت"}<Icon name={uploading ? "globe" : "arrow"} size={18} /></button> : null}
    </> : loading ? <p className={styles.notice} role="status">در حال بررسی وضعیت رسید…</p> : approved || awaitingReview || disabled ? <p className={styles.notice}>{approved ? "رسید پرداخت این سفارش تایید شده است." : disabled ? "امکان ارسال رسید جدید برای سفارش لغوشده وجود ندارد." : "رسید شما ارسال شده و در انتظار بررسی فروشگاه است. پس از اعلام نتیجه می‌توانید وضعیت آن را اینجا ببینید."}</p> : null}
    <div className={styles.listHeading}><span>رسیدهای این سفارش</span><button type="button" disabled={loading || uploading} onClick={() => void load()} data-receipts-refresh>{loading ? "در حال دریافت…" : "به‌روزرسانی وضعیت"}</button></div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {success ? <p className={styles.success} role="status">{success}</p> : null}
    {!loading && loaded && !receipts.length ? <p className={styles.empty}>هنوز رسیدی ارسال نکرده‌اید.</p> : null}
    <ul className={styles.list}>{receipts.map(receipt => <li key={receipt.id} data-receipt-id={receipt.id}>
      <div className={styles.receiptMeta}><span className={styles.badge} data-status={receipt.status}>{labels[receipt.status]}</span><button type="button" disabled={Boolean(openingId)} onClick={() => void view(receipt)}>{openingId === receipt.id ? "در حال دریافت…" : "مشاهده رسید"}<Icon name="arrow" size={15} /></button></div>
      {receipt.reviewNote ? <p className={styles.reviewNote}><strong>پیام فروشگاه:</strong> {receipt.reviewNote}</p> : null}
    </li>)}</ul>
    <p className={styles.privacy}>رسید فقط برای شما و مدیریت فروشگاه قابل مشاهده است. ارسال رسید تا پیش از تایید فروشگاه به معنی تایید پرداخت نیست.</p>
    {preview ? <Dialog open onClose={closePreview} title={preview.title} className={styles.previewDialog}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.previewImage} src={preview.url} alt="رسید پرداخت سفارش" />
    </Dialog> : null}
  </section>;
}
