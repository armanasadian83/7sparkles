"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCatalog } from "@/lib/catalog-store";
import { getCartTotals, resolveCartLines, type CartLine, type CartTotals } from "@/lib/cart";
import { normalizeCheckoutDigits, type CheckoutInput, type CheckoutReceipt } from "@/lib/checkout";
import { useCustomerSession } from "@/lib/customer-store";
import { formatPrice } from "@/lib/products";
import { getShippingMethods } from "@/lib/shipping";
import { Icon } from "../icons";
import { PaymentReceiptUploader } from "../payment-receipt-uploader";
import { variantLabel } from "../product-presentation";
import { ShippingMethodPicker } from "../shipping-method-picker";
import { ShopPanels } from "../shop-panels";
import { useShop } from "../shop-store";
import { StoreFooter } from "../store-footer";
import { StoreHeader, type Panel } from "../store-header";
import styles from "./checkout-page.module.css";

type FieldName = "name" | "phone" | "province" | "city" | "address" | "postalCode" | "notes";
type FieldErrors = Partial<Record<FieldName, string>>;
type Attempt = { fingerprint: string; request: CheckoutInput; lines: CartLine[]; totals: CartTotals };

function Money({ amount, strong = false }: { amount: number; strong?: boolean }) {
  return <span className={styles.money}>{strong ? <strong>{formatPrice(amount)}</strong> : <bdi>{formatPrice(amount)}</bdi>}<small>تومان</small></span>;
}

function Steps({ complete = false }: { complete?: boolean }) {
  return <ol className={styles.steps} aria-label="مراحل خرید">
    <li><Link href="/cart"><span>۱</span>سبد خرید</Link></li>
    <li aria-current={complete ? undefined : "step"}><span>۲</span>اطلاعات و ارسال</li>
    <li aria-current={complete ? "step" : undefined}><span>۳</span>ثبت سفارش</li>
  </ol>;
}

function SummaryItem({ line }: { line: CartLine }) {
  return <li className={styles.summaryItem} data-checkout-line={line.key}>
    <Link className={styles.itemImage} href={`/product/${encodeURIComponent(line.product.slug)}`} aria-label={`مشاهده ${line.product.name}`}><Image src={line.product.image} alt={line.product.images[0]?.alt || line.product.name} width={76} height={90} sizes="64px" /></Link>
    <div className={styles.itemDetails}><span className={styles.brand} dir="auto">{line.product.brand}</span><h3>{line.product.name}</h3>{line.variant ? <p>{variantLabel(line.product, line.variant)}</p> : line.product.size ? <p>{line.product.size}</p> : null}<span className={styles.itemQuantity}>تعداد: {formatPrice(line.quantity)}</span></div>
    <div className={styles.itemPrice}>{line.savings > 0 ? <del>{formatPrice(line.originalLineTotal)}</del> : null}<Money amount={line.lineTotal} /></div>
  </li>;
}

function Receipt({ receipt }: { receipt: CheckoutReceipt }) {
  const [paymentStatus, setPaymentStatus] = useState(receipt.paymentStatus);
  return <><section className={styles.receipt} aria-labelledby="checkout-success-heading" data-checkout-success>
    <span className={styles.successIcon}><Icon name="check" size={33} /></span>
    <span className={styles.eyebrow}>یک قدم نزدیک‌تر به درخشش</span>
    <h2 id="checkout-success-heading" tabIndex={-1}>سفارش شما ثبت شد</h2>
    <p>سفارش برای بررسی در اختیار فروشگاه قرار گرفت. رسید واریز خود را در بخش پایین بارگذاری کنید؛ شماره سفارش را برای پیگیری نگه دارید.</p>
    <dl className={styles.receiptDetails}>
      <div><dt>شماره سفارش</dt><dd data-checkout-order-id><bdi>{receipt.id}</bdi></dd></div>
      <div><dt>وضعیت پرداخت</dt><dd className={paymentStatus === "paid" ? styles.paid : styles.unpaid}>{paymentStatus === "paid" ? "پرداخت تایید شده" : "در انتظار تایید پرداخت"}</dd></div>
      <div><dt>تعداد کالاها</dt><dd>{formatPrice(receipt.totalQuantity)}</dd></div>
      <div><dt>روش ارسال</dt><dd>{receipt.shippingName}</dd></div>
      <div><dt>هزینه ارسال</dt><dd>{receipt.shippingPostpaid ? "پس‌کرایه؛ هنگام تحویل" : receipt.shippingFee ? <Money amount={receipt.shippingFee} /> : "رایگان"}</dd></div>
      <div><dt>مبلغ سفارش{receipt.shippingPostpaid ? "، بدون پس‌کرایه" : ""}</dt><dd><Money amount={receipt.total} strong /></dd></div>
    </dl>
    <p className={styles.receiptHint}>شماره سفارش را برای پیگیری نزد خود نگه دارید.</p>
    <Link className={styles.receiptHint} href="/myorders">مشاهده سفارشات من</Link>
    <Link className={styles.primaryButton} href="/shop">بازگشت به فروشگاه <Icon name="arrow" size={18} /></Link>
  </section><div className={styles.receiptUpload}><PaymentReceiptUploader orderId={receipt.id} token={receipt.paymentReceiptToken} onPaymentStatusChange={setPaymentStatus} /></div></>;
}

function isReceipt(value: unknown): value is CheckoutReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<CheckoutReceipt>;
  return typeof receipt.id === "string" && Boolean(receipt.id) && receipt.status === "processing" && (receipt.paymentStatus === "unpaid" || receipt.paymentStatus === "paid")
    && typeof receipt.paymentReceiptToken === "string" && /^[a-f0-9]{64}$/.test(receipt.paymentReceiptToken)
    && typeof receipt.total === "number" && Number.isSafeInteger(receipt.total) && receipt.total >= 0
    && typeof receipt.shippingFee === "number" && Number.isSafeInteger(receipt.shippingFee) && receipt.shippingFee >= 0
    && typeof receipt.shippingName === "string" && typeof receipt.shippingPostpaid === "boolean"
    && typeof receipt.totalQuantity === "number" && Number.isSafeInteger(receipt.totalQuantity) && receipt.totalQuantity > 0;
}

function createRequestKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function normalizedFields(form: HTMLFormElement) {
  const data = new FormData(form);
  const text = (name: FieldName) => String(data.get(name) ?? "").trim();
  let phone = normalizeCheckoutDigits(text("phone")).replace(/[\s()-]/g, "");
  if (phone.startsWith("+98")) phone = `0${phone.slice(3)}`;
  const fields = {
    name: text("name"), phone, province: text("province"), city: text("city"),
    address: text("address"), postalCode: normalizeCheckoutDigits(text("postalCode")).replace(/[\s-]/g, ""), notes: text("notes"),
  };
  const errors: FieldErrors = {};
  if (fields.name.length < 2 || fields.name.length > 100) errors.name = "نام و نام خانوادگی گیرنده را وارد کنید (۲ تا ۱۰۰ نویسه).";
  if (!/^09\d{9}$/.test(fields.phone)) errors.phone = "شماره همراه معتبر وارد کنید؛ مانند ۰۹۱۲۱۲۳۴۵۶۷.";
  if (fields.province.length < 2 || fields.province.length > 100) errors.province = "نام استان را وارد کنید (۲ تا ۱۰۰ نویسه).";
  if (fields.city.length < 2 || fields.city.length > 100) errors.city = "نام شهر را وارد کنید (۲ تا ۱۰۰ نویسه).";
  if (fields.address.length < 10 || fields.address.length > 1000) errors.address = "نشانی کامل شامل خیابان، پلاک و واحد را وارد کنید (۱۰ تا ۱۰۰۰ نویسه).";
  if (!/^\d{10}$/.test(fields.postalCode)) errors.postalCode = "کد پستی باید دقیقاً ۱۰ رقم باشد.";
  if (fields.notes.length > 2000) errors.notes = "توضیحات سفارش حداکثر ۲۰۰۰ نویسه باشد.";
  return { fields, errors };
}

export function CheckoutPage() {
  const { bfcacheId } = useRouter();
  // A fresh visit starts a new checkout; browser Back can restore its receipt.
  return <CheckoutForm key={bfcacheId} />;
}

function CheckoutForm() {
  const auth = useCustomerSession();
  const catalog = useCatalog();
  const shop = useShop();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const attemptRef = useRef<Attempt | null>(null);
  const pendingRef = useRef(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [reviewSnapshot, setReviewSnapshot] = useState<{ lines: CartLine[]; totals: CartTotals } | null>(null);
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
  const currentLines = resolveCartLines(shop.cart, catalog.products);
  const currentTotals = getCartTotals(currentLines, catalog.settings, shop.shippingMethod);
  const lines = (pending || uncertain) && reviewSnapshot ? reviewSnapshot.lines : currentLines;
  const totals = (pending || uncertain) && reviewSnapshot ? reviewSnapshot.totals : currentTotals;
  const blocked = pending || uncertain;
  const canSubmit = uncertain || Boolean(catalog.loaded && !catalog.loading && !catalog.error && catalog.settings?.acceptOrders && currentLines.length && currentTotals.shippingMethod);

  useEffect(() => {
    const phone = phoneRef.current;
    if (phone && !phone.value && auth.customer) phone.value = auth.customer.phone;
  }, [catalog.loaded, auth.customer]);

  useEffect(() => {
    if (submitError && !Object.keys(fieldErrors).length) errorRef.current?.focus({ preventScroll: false });
  }, [submitError, fieldErrors]);

  useEffect(() => {
    if (receipt) document.getElementById("checkout-success-heading")?.focus();
  }, [receipt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current || !canSubmit) return;
    let attempt = uncertain ? attemptRef.current : null;
    if (!attempt) {
      const { fields, errors } = normalizedFields(event.currentTarget);
      setFieldErrors(errors);
      if (Object.keys(errors).length) {
        setSubmitError("لطفاً موارد مشخص‌شده در فرم را اصلاح کنید.");
        const first = Object.keys(errors)[0];
        const input = event.currentTarget.elements.namedItem(first);
        if (input instanceof HTMLElement) input.focus();
        return;
      }
      if (!currentTotals.shippingMethod) return;
      const body = {
        recipient: { name: fields.name, phone: fields.phone },
        address: { province: fields.province, city: fields.city, address: fields.address, postalCode: fields.postalCode },
        notes: fields.notes, shippingMethodId: currentTotals.shippingMethod.id,
        items: currentLines.map(line => ({ id: line.product.id, ...(line.variant ? { variantId: line.variant.id } : {}), quantity: line.quantity })).sort((a, b) => `${a.id}::${a.variantId ?? ""}`.localeCompare(`${b.id}::${b.variantId ?? ""}`)),
        expectedTotal: currentTotals.total,
      };
      const fingerprint = JSON.stringify(body);
      attempt = attemptRef.current?.fingerprint === fingerprint ? attemptRef.current : {
        fingerprint, request: { ...body, idempotencyKey: createRequestKey() }, lines: currentLines, totals: currentTotals,
      };
      attemptRef.current = attempt;
    }
    const submitted = attempt;
    setReviewSnapshot({ lines: submitted.lines, totals: submitted.totals });
    pendingRef.current = true;
    setPending(true);
    setSubmitError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitted.request), signal: controller.signal,
      });
      const result: { order?: unknown; error?: unknown } | null = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status >= 500) throw new Error("uncertain");
        const message = typeof result?.error === "string" ? result.error : "ثبت سفارش ممکن نشد. لطفاً دوباره تلاش کنید.";
        setUncertain(false);
        setReviewSnapshot(null);
        if (response.status === 409) {
          attemptRef.current = null;
          setSubmitError(`${message} اطلاعات سبد به‌روز می‌شود؛ مبلغ و کالاها را دوباره بررسی کنید و سپس ثبت سفارش را بزنید.`);
          await catalog.refresh();
        } else setSubmitError(message);
        return;
      }
      if (!isReceipt(result?.order)) throw new Error("uncertain");
      setReceipt(result.order);
      setUncertain(false);
      setReviewSnapshot(null);
      shop.removeSubmittedItems(submitted.request.items);
      attemptRef.current = null;
      formRef.current?.reset();
      void catalog.refresh();
    } catch {
      setReviewSnapshot({ lines: submitted.lines, totals: submitted.totals });
      setUncertain(true);
      setSubmitError("نتیجه ثبت سفارش دریافت نشد. برای جلوگیری از ثبت تکراری، با دکمه زیر نتیجه همین درخواست را دوباره بررسی کنید. اطلاعات شما حفظ شده است.");
    } finally {
      window.clearTimeout(timeout);
      pendingRef.current = false;
      setPending(false);
    }
  }

  const errorFor = (field: FieldName) => fieldErrors[field] ? <span className={styles.fieldError} id={`checkout-${field}-error`}>{fieldErrors[field]}</span> : null;
  const describedBy = (field: FieldName) => fieldErrors[field] ? `checkout-${field}-error` : undefined;

  return <>
    <a className="skip-link" href="#checkout-main">رفتن به تکمیل سفارش</a>
    <StoreHeader activePage="checkout" cartCount={shop.cartCount} favoriteCount={shop.favorites.length} openPanel={setPanel} announcement={catalog.settings?.announcement ?? ""} storeName={catalog.settings?.storeName} />
    <main className={styles.page} id="checkout-main">
      <div className={styles.heading}><div><h1>{receipt ? "سفارش شما" : "تکمیل سفارش"}</h1><p>{receipt ? "اطلاعات ثبت سفارش را نزد خود نگه دارید." : "اطلاعات گیرنده و روش ارسال را با دقت وارد کنید."}</p></div><Steps complete={Boolean(receipt)} /></div>
      {receipt ? <Receipt receipt={receipt} /> : !catalog.loaded ? <section className={styles.state} role={catalog.error ? "alert" : "status"}><Icon name={catalog.error ? "globe" : "bag"} size={36} /><h2>{catalog.error ? "دریافت اطلاعات سفارش ممکن نشد" : "در حال آماده‌سازی سفارش شما…"}</h2>{catalog.error ? <><p>{catalog.error}</p><button className={styles.primaryButton} type="button" onClick={() => { void catalog.refresh(); }}>تلاش دوباره <Icon name="arrow" size={18} /></button></> : null}</section> : !lines.length && !uncertain && !submitError ? <section className={styles.state}><span className={styles.stateIcon}><Icon name="bag" size={35} /></span><h2>سبد خرید شما خالی است</h2><p>برای تکمیل سفارش، ابتدا محصولات دلخواهتان را به سبد خرید اضافه کنید.</p><Link className={styles.primaryButton} href="/shop">انتخاب محصولات <Icon name="arrow" size={18} /></Link></section> : <>
        {catalog.error ? <div className="catalog-notice" role="alert">{catalog.error}<button type="button" disabled={pending} onClick={() => { void catalog.refresh(); }}>تلاش دوباره</button></div> : null}
        {!catalog.settings?.acceptOrders ? <p className={styles.notice} role="status">پذیرش سفارش جدید فعلاً متوقف است. لطفاً بعداً مراجعه کنید.</p> : null}
        <form ref={formRef} className={styles.layout} onSubmit={submit} noValidate aria-busy={pending}>
          <div className={styles.formColumn}>
            <section className={styles.card} aria-labelledby="recipient-heading"><div className={styles.cardHeading}><span className={styles.sectionIcon}><Icon name="user" size={21} /></span><div><h2 id="recipient-heading">اطلاعات گیرنده</h2><p>برای ثبت سفارش، نیازی به ورود به حساب کاربری نیست.</p></div></div>
              <fieldset className={styles.fields} disabled={blocked}><legend className={styles.srOnly}>اطلاعات تماس</legend>
                <label className={styles.field} htmlFor="checkout-name"><span>نام و نام خانوادگی <small>الزامی</small></span><input id="checkout-name" name="name" autoComplete="shipping name" placeholder="نام و نام خانوادگی گیرنده" required maxLength={100} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={describedBy("name")} />{errorFor("name")}</label>
                <label className={styles.field} htmlFor="checkout-phone"><span>شماره همراه <small>الزامی</small></span><input ref={phoneRef} id="checkout-phone" name="phone" type="tel" inputMode="tel" autoComplete="shipping tel" placeholder="۰۹۱۲۱۲۳۴۵۶۷" dir="ltr" required maxLength={24} aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={describedBy("phone")} />{errorFor("phone")}</label>
              </fieldset>
            </section>
            <section className={styles.card} aria-labelledby="address-heading"><div className={styles.cardHeading}><span className={styles.sectionIcon}><Icon name="globe" size={21} /></span><div><h2 id="address-heading">نشانی ارسال</h2><p>سفارش شما به این نشانی ارسال خواهد شد.</p></div></div>
              <fieldset className={styles.fields} disabled={blocked}><legend className={styles.srOnly}>نشانی پستی گیرنده</legend>
                <label className={styles.field} htmlFor="checkout-province"><span>استان <small>الزامی</small></span><input id="checkout-province" name="province" autoComplete="shipping address-level1" placeholder="مثلاً تهران" required maxLength={100} aria-invalid={Boolean(fieldErrors.province)} aria-describedby={describedBy("province")} />{errorFor("province")}</label>
                <label className={styles.field} htmlFor="checkout-city"><span>شهر <small>الزامی</small></span><input id="checkout-city" name="city" autoComplete="shipping address-level2" placeholder="مثلاً تهران" required maxLength={100} aria-invalid={Boolean(fieldErrors.city)} aria-describedby={describedBy("city")} />{errorFor("city")}</label>
                <label className={`${styles.field} ${styles.fullWidth}`} htmlFor="checkout-address"><span>نشانی کامل <small>الزامی</small></span><textarea id="checkout-address" name="address" autoComplete="shipping street-address" placeholder="خیابان، کوچه، پلاک، طبقه و واحد" required rows={3} maxLength={1000} aria-invalid={Boolean(fieldErrors.address)} aria-describedby={describedBy("address")} />{errorFor("address")}</label>
                <label className={styles.field} htmlFor="checkout-postalCode"><span>کد پستی <small>۱۰ رقم</small></span><input id="checkout-postalCode" name="postalCode" autoComplete="shipping postal-code" inputMode="numeric" placeholder="کد پستی ۱۰ رقمی" dir="ltr" required maxLength={16} aria-invalid={Boolean(fieldErrors.postalCode)} aria-describedby={describedBy("postalCode")} />{errorFor("postalCode")}</label>
              </fieldset>
            </section>
            <section className={styles.card} aria-labelledby="shipping-heading"><div className={styles.cardHeading}><span className={styles.sectionIcon}><Icon name="bag" size={21} /></span><div><h2 id="shipping-heading">روش ارسال</h2><p>روش مناسب برای دریافت سفارش را انتخاب کنید.</p></div></div>
              <ShippingMethodPicker methods={getShippingMethods(catalog.settings)} selected={totals.shippingMethod?.id ?? null} onChange={method => { if (!shop.setShippingMethod(method)) { setSubmitError("این روش ارسال در دسترس نیست. لطفاً اطلاعات را به‌روز کنید."); void catalog.refresh(); } }} disabled={blocked || catalog.loading || Boolean(catalog.error)} />
            </section>
            <section className={styles.card} aria-labelledby="notes-heading"><h2 id="notes-heading">توضیحات سفارش <span className={styles.optional}>اختیاری</span></h2><fieldset className={`${styles.fields} ${styles.notesFields}`} disabled={blocked}><legend className={styles.srOnly}>توضیحات سفارش</legend><label className={`${styles.field} ${styles.fullWidth}`} htmlFor="checkout-notes"><span className={styles.srOnly}>توضیحات سفارش</span><textarea id="checkout-notes" name="notes" placeholder="اگر نکته‌ای درباره تحویل سفارش دارید، اینجا بنویسید…" rows={3} maxLength={2000} aria-invalid={Boolean(fieldErrors.notes)} aria-describedby={describedBy("notes")} />{errorFor("notes")}</label></fieldset></section>
            <Link className={styles.backLink} href="/cart">بازگشت و ویرایش سبد خرید <Icon name="arrow" size={17} /></Link>
          </div>
          <aside className={styles.summary} aria-label="خلاصه سفارش"><div className={styles.summaryHeading}><h2>سفارش شما</h2><span>{formatPrice(totals.totalQuantity)} کالا</span></div><ul className={styles.summaryItems}>{lines.map(line => <SummaryItem key={line.key} line={line} />)}</ul>
            <dl className={styles.totals}>
              <div><dt>جمع کالاها</dt><dd data-checkout-total="originalSubtotal"><Money amount={totals.originalSubtotal} /></dd></div>
              {totals.discount > 0 ? <div className={styles.discount}><dt>تخفیف محصولات</dt><dd data-checkout-total="discount">− <Money amount={totals.discount} /></dd></div> : null}
              <div><dt>هزینه ارسال</dt><dd data-checkout-total="shipping">{!totals.shippingMethod ? "روش ارسالی فعال نیست" : totals.shippingMethod.postpaid ? "پس‌کرایه" : totals.shipping ? <Money amount={totals.shipping} /> : "رایگان"}</dd></div>
            </dl>
            <div className={styles.total}><span>مبلغ سفارش</span><span data-checkout-total="total"><Money amount={totals.total} strong /></span></div>
            {totals.shippingMethod?.postpaid ? <p className={styles.postpaid}>هزینه ارسال جداگانه هنگام تحویل پرداخت می‌شود.</p> : null}
            <div className={styles.paymentNote}><span className={styles.noteDot} /><div><strong>ثبت سفارش بدون پرداخت آنلاین</strong><p>درگاه پرداخت هنوز فعال نیست. سفارش با وضعیت پرداخت‌نشده برای بررسی فروشگاه ثبت می‌شود.</p></div></div>
            {submitError ? <div ref={errorRef} className={styles.submitError} role="alert" tabIndex={-1} data-checkout-error>{submitError}</div> : null}
            <button className={styles.primaryButton} type="submit" disabled={!canSubmit || pending} data-checkout-submit>{pending ? "در حال ثبت سفارش…" : uncertain ? "بررسی دوباره ثبت سفارش" : "ثبت سفارش"}{!pending ? <Icon name="arrow" size={19} /> : <span className={styles.spinner} aria-hidden="true" />}</button>
            <p className={styles.submitHint}>{uncertain ? "همان درخواست قبلی بررسی می‌شود؛ سفارش تکراری ایجاد نمی‌شود." : "پیش از ثبت، مبلغ و اطلاعات گیرنده را بررسی کنید."}</p>
          </aside>
        </form>
      </>}
    </main>
    <StoreFooter settings={catalog.settings} openPanel={setPanel} />
    <ShopPanels panel={panel} close={() => setPanel(null)} openPanel={setPanel} chooseCategory={category => { setPanel(null); router.push(category === "all" ? "/shop" : `/shop?category=${encodeURIComponent(category)}`); }} />
  </>;
}
