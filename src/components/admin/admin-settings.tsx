"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, Star } from "@/components/icons";
import type { AdminSettings as Settings } from "@/lib/admin-store";
import { adminSectionHref } from "./admin-sidebar";

export function AdminSettings({ settings, onSave, notify }: { settings: Settings; onSave: (settings: Settings) => Promise<void>; notify: (message: string) => void }) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft(current => ({ ...current, [key]: value }));
    setError("");
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!draft.storeName.trim()) {
      setError("نام فروشگاه را وارد کنید.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await onSave({ ...draft, storeName: draft.storeName.trim(), shippingMethods: settings.shippingMethods, shippingFee: settings.shippingFee, freeShippingThreshold: settings.freeShippingThreshold, postShippingEnabled: settings.postShippingEnabled, tipaxShippingEnabled: settings.tipaxShippingEnabled });
      notify("تنظیمات فروشگاه ذخیره شد.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ذخیره تنظیمات انجام نشد."); }
    finally { setPending(false); }
  }
  return <div className="admin-settings-layout">
    <section className="admin-panel"><div className="admin-panel-heading"><div><h2>تنظیمات فروشگاه</h2><p>اطلاعات عمومی و نمایش محصولات</p></div></div>
      <form className="admin-settings-form" onSubmit={submit} aria-busy={pending}><fieldset disabled={pending} className="admin-form-fields">
        <div className="admin-form-section"><h3>اطلاعات عمومی</h3><div className="admin-form-grid">
          <label className="admin-field">نام فروشگاه<input required maxLength={60} value={draft.storeName} onChange={event => change("storeName", event.target.value)} /></label>
          <label className="admin-field">شماره پشتیبانی<input type="tel" dir="ltr" maxLength={20} placeholder="اختیاری" value={draft.supportPhone} onChange={event => change("supportPhone", event.target.value)} /></label>
          <label className="admin-field span-two">شعار فروشگاه<input maxLength={120} value={draft.description} onChange={event => change("description", event.target.value)} /></label>
          <label className="admin-field span-two">متن نوار اطلاع‌رسانی<textarea rows={2} maxLength={200} value={draft.announcement} onChange={event => change("announcement", event.target.value)} /></label>
        </div></div>
        <div className="admin-form-section"><h3>تنظیمات حمل و نقل</h3><p className="admin-settings-shipping-note">روش‌های ارسال و هزینه هر روش را از بخش حمل و نقل مدیریت کنید.</p><Link className="admin-button secondary small" href={adminSectionHref("shipping")}>مدیریت حمل و نقل<Icon name="arrow" size={17} /></Link></div>
        <div className="admin-form-section"><h3>سفارش‌گیری و نمایش محصولات</h3>
          <label className="admin-switch-row"><span><strong>پذیرش سفارش جدید</strong><small>اجازه افزودن محصول به سبد خرید</small></span><input type="checkbox" role="switch" checked={draft.acceptOrders} onChange={event => change("acceptOrders", event.target.checked)} /><span className="admin-switch" aria-hidden="true" /></label>
          <label className="admin-switch-row"><span><strong>نمایش تعداد موجودی</strong><small>نمایش موجودی محصولات در فروشگاه</small></span><input type="checkbox" role="switch" checked={draft.showStock} onChange={event => change("showStock", event.target.checked)} /><span className="admin-switch" aria-hidden="true" /></label>
        </div>
        {error ? <p role="alert" className="admin-error">{error}</p> : null}
        <div className="admin-settings-actions"><button className="admin-button" type="submit"><Icon name="check" size={18} />{pending ? "در حال ذخیره..." : "ذخیره تنظیمات"}</button><button className="admin-button secondary" type="button" onClick={() => { setDraft(settings); setError(""); notify("تغییرات ذخیره‌نشده کنار گذاشته شد."); }}>بازگردانی تغییرات</button></div>
        </fieldset>
      </form>
    </section>
    <aside className="admin-settings-preview"><div className="admin-panel-heading"><h2>پیش‌نمایش تنظیمات</h2><Star /></div><div className="admin-preview-announcement">{draft.announcement || "نوار اطلاع‌رسانی بدون متن"}</div><div className="admin-preview-brand"><Star /><h3>{draft.storeName || "نام فروشگاه"}</h3><p>{draft.description}</p></div><dl><div><dt>وضعیت فروشگاه</dt><dd>{draft.acceptOrders ? "پذیرش سفارش" : "توقف سفارش‌گیری"}</dd></div><div><dt>نمایش موجودی</dt><dd>{draft.showStock ? "فعال" : "غیرفعال"}</dd></div>{draft.supportPhone ? <div><dt>پشتیبانی</dt><dd dir="ltr">{draft.supportPhone}</dd></div> : null}</dl><p className="admin-preview-note">پیش‌نمایش تغییرات را ببینید؛ با ذخیره تنظیمات، اطلاعات فروشگاه به‌روز می‌شود.</p></aside>
  </div>;
}
