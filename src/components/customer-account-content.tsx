"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCatalog } from "@/lib/catalog-store";
import { normalizeDigits } from "@/lib/demo-auth";
import { useCustomerSession } from "@/lib/customer-store";
import { Icon } from "./icons";
import type { Panel } from "./store-header";
import styles from "./customer-account-content.module.css";

type AccountSection = "account" | "orders" | "tracking";
type Props = { section: AccountSection; onNavigate: (panel: Panel) => void };

const signInDate = new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" });

export function CustomerAccountContent({ section, onNavigate }: Props) {
  const router = useRouter();
  const auth = useCustomerSession();
  const session = auth.customer;
  const catalog = useCatalog();
  const supportPhone = catalog.settings?.supportPhone.trim() ?? "";
  const phoneDigits = normalizeDigits(supportPhone).replace(/[^\d+]/g, "");
  const phoneHref = /^\+?\d{7,15}$/.test(phoneDigits) ? `tel:${phoneDigits}` : null;

  function orders() { onNavigate(null); router.push("/myorders"); }
  if (!auth.loaded || auth.loading) return <p className={styles.note} role="status">در حال بررسی حساب شما…</p>;
  if (auth.error) return <div className={styles.empty} role="alert"><p>{auth.error}</p><button className="button button-primary" type="button" onClick={() => void auth.refresh()}>تلاش دوباره</button></div>;

  if (!session) return <div className={styles.content}>
    <div className={styles.empty}>
      <span className={styles.symbol}><Icon name="user" size={30} /></span>
      <h3>به حساب خودت وارد شو</h3>
      <p>با شماره همراهت وارد شو تا بخش حساب من در دسترس باشد.</p>
      <Link className="button button-primary" href="/login?next=/myorders" onClick={() => onNavigate(null)}>ورود به حساب <Icon name="arrow" size={18} /></Link>
    </div>
  </div>;

  return <div className={styles.content}>
    {section === "account" ? <>
      <div className={styles.identity}>
        <span className={styles.avatar}><Icon name="user" size={28} /></span>
        <div><h3>خوش آمدی، همراه درخشان ما</h3><p>انتخاب‌های مراقبتی تو، در یک جا</p></div>
      </div>
      <dl className={styles.details}>
        <div><dt>شماره همراه</dt><dd><bdi dir="ltr">{normalizeDigits(session.phone).replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)])}</bdi></dd></div>
        <div><dt>زمان ورود به حساب</dt><dd>{signInDate.format(new Date(session.signedInAt))}</dd></div>
      </dl>
      <div className={styles.actions}>
        <button type="button" onClick={orders}><Icon name="bag" size={21} /><span>سفارشات من</span><Icon name="arrow" size={17} /></button>
        <button type="button" onClick={orders}><Icon name="search" size={21} /><span>پیگیری سفارش</span><Icon name="arrow" size={17} /></button>
        <button type="button" onClick={() => onNavigate("favorites")}><Icon name="heart" size={21} /><span>علاقه‌مندی‌ها</span><Icon name="arrow" size={17} /></button>
        <button type="button" onClick={() => onNavigate("faq")}><Icon name="globe" size={21} /><span>راهنما و پشتیبانی</span><Icon name="arrow" size={17} /></button>
      </div>
      <p className={styles.note}>برای ثبت سفارش، اطلاعات گیرنده را در صفحه تکمیل سفارش وارد کن و شماره سفارش را برای پیگیری نگه دار.</p>
    </> : section === "orders" ? <div className={styles.empty}>
      <span className={styles.symbol}><Icon name="bag" size={32} /></span>
      <h3>سفارش‌های شما، در یک نگاه</h3>
      <p>جزئیات کالاها، اطلاعات ارسال و وضعیت سفارش‌های ثبت‌شده را در صفحه سفارشات من ببینید.</p>
      <button type="button" className="button button-primary" onClick={orders}>مشاهده سفارشات من <Icon name="arrow" size={18} /></button>
    </div> : <div className={styles.empty}>
      <span className={styles.symbol}><Icon name="search" size={32} /></span>
      <h3>برای پیگیری، کنارت هستیم</h3>
      <p>وضعیت ثبت، پردازش و ارسال سفارش را در سفارشات من ببینید. برای راهنمایی بیشتر، شماره سفارش را به پشتیبانی اعلام کنید.</p>
      <button type="button" className="button button-primary" onClick={orders}>پیگیری سفارش‌های من <Icon name="arrow" size={18} /></button>
      {phoneHref ? <a className={`button button-primary ${styles.contact}`} href={phoneHref}><span>تماس با پشتیبانی</span><bdi dir="ltr">{supportPhone}</bdi></a> : null}
      {catalog.loading && !catalog.loaded ? <p className={styles.note} role="status">در حال دریافت راه ارتباطی فروشگاه…</p> : catalog.error ? <button type="button" className={styles.textButton} onClick={() => { void catalog.refresh(); }}>دریافت دوباره اطلاعات پشتیبانی</button> : null}
      <div className={styles.inlineActions}>
        <button type="button" onClick={() => onNavigate("faq")}>سوال‌های متداول</button>
        <button type="button" onClick={orders}>سفارشات من <Icon name="arrow" size={16} /></button>
      </div>
    </div>}
  </div>;
}
