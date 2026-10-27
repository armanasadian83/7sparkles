"use client";

import Link from "next/link";
import type { AdminSettings } from "@/lib/admin-types";
import { Icon, Logo, Star } from "./icons";
import type { Panel } from "./store-header";

export function StoreFooter({ settings, openPanel }: { settings: AdminSettings | null; openPanel: (panel: Panel) => void }) {
  return <footer className="site-footer"><div className="footer-grid container">
    <div className="footer-brand"><Link href="/#home" aria-label="سون اسپارکلز، صفحه اصلی"><Logo /></Link><p>{settings?.storeName}</p><span className="footer-brand-note">{settings?.description}</span></div>
    <div className="footer-column"><h3>دسترسی سریع</h3><Link href="/shop">فروشگاه</Link><Link href="/#brands">برندها</Link><Link href="/#about">درباره ما</Link></div>
    <div className="footer-column"><h3>راهنمای خرید</h3><button onClick={() => openPanel("guide")}>انتخاب محصول</button><button onClick={() => openPanel("faq")}>سوالات متداول</button><Link href="/cart">سبد خرید</Link></div>
    <div className="footer-connect"><h3>همراه سون اسپارکلز</h3><p>یک قدم نزدیک‌تر به روتین دلخواهت.</p>{settings?.supportPhone && <a className="footer-support-phone" href={`tel:${settings.supportPhone}`} dir="ltr">{settings.supportPhone}</a>}<button className="button button-outline" onClick={() => openPanel("guide")}>راهنمای انتخاب محصول <Icon name="arrow" size={23} /></button></div>
  </div><div className="footer-bottom container"><div className="footer-rule"><span /><Star /><span /></div><p>تمامی حقوق برای سون اسپارکلز محفوظ است.</p><span className="footer-signature" dir="ltr">A LITTLE CARE. A LITTLE MAGIC.</span></div></footer>;
}
