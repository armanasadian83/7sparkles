"use client";

import { useState } from "react";
import { Icon, Star } from "@/components/icons";
import { formatPrice } from "@/lib/products";
import type { AdminSettings, ShippingMethodConfig, ShippingSettings } from "@/lib/admin-store";
import styles from "./admin-shipping.module.css";

type MethodDraft = Omit<ShippingMethodConfig, "fee"> & { fee: string };
type PaymentMode = "fixed" | "free" | "postpaid";

function makeDraft(methods: ShippingMethodConfig[]): MethodDraft[] {
  return methods.map(method => ({ ...method, free: method.postpaid ? false : method.free, postpaid: method.postpaid ?? false, fee: method.free || method.postpaid ? "0" : String(method.fee) }));
}

function validFee(value: string) {
  const fee = Number(value);
  return value.trim() !== "" && Number.isSafeInteger(fee) && fee >= 0 && fee <= 1_000_000_000_000;
}

export function AdminShipping({ settings, onSave, notify }: { settings: AdminSettings; onSave: (settings: ShippingSettings) => Promise<void>; notify: (message: string) => void }) {
  const [methods, setMethods] = useState(() => makeDraft(settings.shippingMethods));
  const [newMethodId, setNewMethodId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const savedIds = new Set(settings.shippingMethods.map(method => method.id));
  const enabledMethods = methods.filter(method => method.enabled);
  const dirty = JSON.stringify(methods) !== JSON.stringify(makeDraft(settings.shippingMethods));

  function change(id: string, update: Partial<MethodDraft>) {
    setMethods(current => current.map(method => method.id === id ? { ...method, ...update } : method));
    setError("");
  }

  function changePaymentMode(id: string, mode: PaymentMode) {
    change(id, { free: mode === "free", postpaid: mode === "postpaid", fee: mode === "fixed" ? "" : "0" });
  }

  function addMethod() {
    if (methods.length >= 30) return;
    const id = crypto.randomUUID();
    setMethods(current => [...current, { id, name: "", fee: "", free: false, postpaid: false, enabled: true }]);
    setNewMethodId(id);
    setError("");
  }

  function cancelMethod(id: string) {
    if (savedIds.has(id)) return;
    setMethods(current => current.filter(method => method.id !== id));
    setError("");
    document.getElementById("add-shipping-method")?.focus();
  }

  function reset() {
    setMethods(makeDraft(settings.shippingMethods));
    setNewMethodId(null);
    setError("");
    notify("تغییرات ذخیره‌نشده کنار گذاشته شد.");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const invalidName = methods.find(method => !method.name.trim() || method.name.trim().length > 100);
    if (invalidName) {
      setError("نام هر روش ارسال را وارد کنید؛ نام می‌تواند حداکثر ۱۰۰ نویسه باشد.");
      document.getElementById(`shipping-name-${invalidName.id}`)?.focus();
      return;
    }
    const invalidFee = methods.find(method => !method.free && !method.postpaid && !validFee(method.fee));
    if (invalidFee) {
      setError("مبلغ هر روش ارسال باید عدد صحیح بین صفر و هزار میلیارد تومان باشد؛ یا گزینه «رایگان» یا «پس‌کرایه» را انتخاب کنید.");
      document.getElementById(`shipping-fee-${invalidFee.id}`)?.focus();
      return;
    }
    const shippingMethods = methods.map(method => ({ ...method, name: method.name.trim(), free: method.postpaid ? false : method.free, fee: method.free || method.postpaid ? 0 : Number(method.fee) }));
    setPending(true);
    setError("");
    try {
      await onSave({ shippingMethods });
      setMethods(makeDraft(shippingMethods));
      setNewMethodId(null);
      notify("روش‌های ارسال ذخیره شد.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ذخیره روش‌های ارسال انجام نشد.");
    } finally {
      setPending(false);
    }
  }

  return <div className={`${styles.layout} ${!methods.length ? styles.emptyLayout : ""}`}>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><h2>روش‌های ارسال</h2><p>روش‌های ارسال فروشگاه و هزینه هرکدام را تعریف کنید.</p></div></div>
      <form className={styles.form} onSubmit={submit} aria-label="تنظیمات حمل و نقل" aria-busy={pending}>
        <fieldset className="admin-form-fields" disabled={pending}>
          {!methods.length ? <div className={styles.emptyState}>
            <span className={styles.emptyIcon}><ShippingIcon /></span>
            <h3>هنوز روش ارسالی اضافه نشده است</h3>
            <p>اولین روش ارسال را با نام دلخواه و مبلغ ثابت، رایگان یا پس‌کرایه اضافه کنید.</p>
            <button id="add-shipping-method" className="admin-button secondary" type="button" onClick={addMethod}><Icon name="plus" size={18} />افزودن روش ارسال</button>
          </div> : <>
            <div className={styles.methodList}>
              {methods.map((method, index) => <section key={method.id} className={styles.method} data-shipping-method={method.id} aria-labelledby={`shipping-title-${method.id}`}>
                <div className={styles.methodHeading}>
                  <span className={styles.methodIcon}><ShippingIcon /></span>
                  <div><h3 id={`shipping-title-${method.id}`}>{method.name.trim() || `روش ارسال ${formatPrice(index + 1)}`}</h3><p>{savedIds.has(method.id) ? "ذخیره‌شده در فروشگاه" : "روش جدید · هنوز ذخیره نشده"}</p></div>
                  <span className={`${styles.status} ${method.enabled ? styles.activeStatus : ""}`}>{method.enabled ? "فعال" : "غیرفعال"}</span>
                  {!savedIds.has(method.id) ? <button type="button" className={styles.cancel} aria-label={`لغو روش ارسال جدید ${formatPrice(index + 1)}`} onClick={() => cancelMethod(method.id)}><Icon name="close" size={18} /></button> : null}
                </div>
                <div className={styles.fields}>
                  <label className="admin-field" htmlFor={`shipping-name-${method.id}`}>نام روش ارسال<input id={`shipping-name-${method.id}`} autoFocus={method.id === newMethodId} required maxLength={100} value={method.name} placeholder="نام روش ارسال را وارد کنید" onChange={event => change(method.id, { name: event.target.value })} /></label>
                  <label className={`admin-field ${styles.feeField}`} htmlFor={`shipping-fee-${method.id}`}>مبلغ ارسال (تومان)<span className={styles.feeInput}><input id={`shipping-fee-${method.id}`} required={!method.free && !method.postpaid} disabled={method.free || method.postpaid} type="number" inputMode="numeric" min="0" max="1000000000000" step="1" value={method.free || method.postpaid ? "0" : method.fee} placeholder="مبلغ را وارد کنید" onChange={event => change(method.id, { fee: event.target.value })} /><span aria-hidden="true">تومان</span></span></label>
                </div>
                <fieldset className={styles.paymentMode} aria-describedby={`shipping-payment-hint-${method.id}`}>
                  <legend>نحوه پرداخت هزینه ارسال</legend>
                  <div className={styles.paymentOptions}>
                    <label className={styles.paymentOption}><input type="radio" name={`shipping-payment-${method.id}`} value="fixed" checked={!method.free && !method.postpaid} onChange={() => changePaymentMode(method.id, "fixed")} /><span>مبلغ ثابت</span></label>
                    <label className={styles.paymentOption}><input type="radio" name={`shipping-payment-${method.id}`} value="free" checked={method.free} onChange={() => changePaymentMode(method.id, "free")} /><span>رایگان</span></label>
                    <label className={styles.paymentOption}><input type="radio" name={`shipping-payment-${method.id}`} value="postpaid" checked={method.postpaid} onChange={() => changePaymentMode(method.id, "postpaid")} /><span>پس‌کرایه</span></label>
                  </div>
                  <p id={`shipping-payment-hint-${method.id}`} className={styles.paymentHint}>{method.postpaid ? "هزینه ارسال هنگام تحویل، جداگانه پرداخت می‌شود." : method.free ? "این روش بدون هزینه ارسال محاسبه می‌شود." : "هزینه ارسال همراه با مبلغ سفارش محاسبه می‌شود."}</p>
                </fieldset>
                <div className={styles.switches}>
                  <label className="admin-switch-row"><span><strong>نمایش در سبد خرید</strong><small>{method.enabled ? "مشتری می‌تواند این روش را انتخاب کند" : "این روش برای مشتری نمایش داده نمی‌شود"}</small></span><input type="checkbox" role="switch" aria-label={`فعال بودن ${method.name.trim() || `روش ارسال ${formatPrice(index + 1)}`}`} checked={method.enabled} onChange={event => change(method.id, { enabled: event.target.checked })} /><span className="admin-switch" aria-hidden="true" /></label>
                </div>
              </section>)}
            </div>
            <button id="add-shipping-method" className={`admin-button secondary ${styles.addButton}`} type="button" disabled={methods.length >= 30} title={methods.length >= 30 ? "حداکثر ۳۰ روش ارسال قابل تعریف است" : undefined} onClick={addMethod}><Icon name="plus" size={18} />افزودن روش ارسال</button>
            {!enabledMethods.length ? <p className={styles.notice} role="status">هیچ روش ارسالی فعال نیست؛ مشتری در سبد خرید گزینه‌ای برای انتخاب نخواهد داشت.</p> : null}
          </>}
          {error ? <p role="alert" className="admin-error">{error}</p> : null}
          {methods.length || dirty ? <div className={`admin-settings-actions ${styles.actions}`}><button className="admin-button" type="submit" disabled={!dirty}><Icon name="check" size={18} />{pending ? "در حال ذخیره..." : "ذخیره روش‌های ارسال"}</button><button className="admin-button secondary" type="button" disabled={!dirty} onClick={reset}>بازگردانی تغییرات</button></div> : null}
        </fieldset>
      </form>
    </section>
    {methods.length ? <aside className={styles.preview} aria-label="پیش‌نمایش روش‌های ارسال">
      <div className={styles.previewHeading}><h2>پیش‌نمایش سبد خرید</h2><Star /></div>
      <p className={styles.previewIntro}>روش‌های فعال برای مشتری</p>
      {enabledMethods.map((method, index) => <div key={method.id} className={`${styles.previewOption} ${index === 0 ? styles.previewSelected : ""}`}><span className={styles.radio} aria-hidden="true" /><strong>{method.name.trim() || "نام روش ارسال"}</strong><span>{method.postpaid ? "پس‌کرایه" : method.free ? "رایگان" : validFee(method.fee) ? `${formatPrice(Number(method.fee))} تومان` : "مبلغ را وارد کنید"}</span></div>)}
      {!enabledMethods.length ? <p className={styles.emptyPreview}>روش ارسالی فعال نیست.</p> : null}
      <p className={styles.previewNote}>این پیش‌نمایش زنده است؛ تغییرات پس از ذخیره در فروشگاه نمایش داده می‌شوند.</p>
    </aside> : null}
  </div>;
}

function ShippingIcon() {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h11v12H3V5Zm11 5h4l3 4v3h-7M7 17h9" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
}
