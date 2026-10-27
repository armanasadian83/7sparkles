"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { AdminSettings } from "@/lib/admin-types";
import type { Product, ProductReview, ProductReviewSummary } from "@/lib/products";
import { useCatalog } from "@/lib/catalog-store";
import { AccountMenu } from "../account-menu";
import { ThemeToggle } from "../theme-switcher";
import { Icon } from "../icons";
import { ShopPanels } from "../shop-panels";
import { useShop } from "../shop-store";
import { StoreFooter } from "../store-footer";
import type { Panel } from "../store-header";
import { ProductDetail } from "./product-detail";
import styles from "./product-page-shell.module.css";

function ProductHeader({ count, openPanel }: { count: number; openPanel: (panel: Panel) => void }) {
  const [menu, setMenu] = useState(false);
  return <header className={styles.header}>
    <div className={styles.navInner}>
      <Link href="/" className={styles.wordmark} aria-label="سون اسپارکلز، صفحه اصلی" dir="ltr">Seven<br />Sparkles</Link>
      <nav aria-label="ناوبری اصلی" className={`${styles.navigation} ${menu ? styles.open : ""}`}>
        <Link href="/">خانه</Link><Link href="/shop" className={styles.active}>فروشگاه</Link><Link href="/#brands">برندها</Link><Link href="/#about">درباره ما</Link><button type="button" onClick={() => { openPanel("guide"); setMenu(false); }}>راهنمای خرید</button>
        <button className={styles.mobileSearch} type="button" onClick={() => { openPanel("search"); setMenu(false); }}>جستجوی محصولات</button>
      </nav>
      <div className={styles.headerActions}>
        <AccountMenu openPanel={openPanel} onOpen={() => setMenu(false)} />
        <ThemeToggle />
        <Link href="/cart" aria-label={`سبد خرید، ${count.toLocaleString("fa-IR")} محصول`} className={styles.cartButton} onClick={() => setMenu(false)}><Icon name="bag" size={24} /><span>{count.toLocaleString("fa-IR")}</span></Link>
        <button type="button" aria-label="جستجوی محصولات" onClick={() => openPanel("search")}><Icon name="search" size={24} /></button>
        <button type="button" aria-label={menu ? "بستن منو" : "باز کردن منو"} aria-expanded={menu} className={styles.menuButton} onClick={() => setMenu(current => !current)}><Icon name={menu ? "close" : "menu"} size={24} /></button>
      </div>
    </div>
  </header>;
}

function ProductSiteFrame({ settings, children }: { settings: AdminSettings | null; children: ReactNode }) {
  const router = useRouter();
  const shop = useShop();
  const [panel, setPanel] = useState<Panel>(null);
  return <div className={styles.site}>
    <a className="skip-link" href="#product-main">رفتن به اطلاعات محصول</a>
    <ProductHeader count={shop.cartCount} openPanel={setPanel} />
    <main id="product-main">{children}</main>
    <StoreFooter settings={settings} openPanel={setPanel} />
    <ShopPanels panel={panel} close={() => setPanel(null)} openPanel={setPanel} chooseCategory={category => { setPanel(null); router.push(`/shop?category=${encodeURIComponent(category)}`); }} />
  </div>;
}

export function ProductPageShell({ product, reviews, reviewSummary, settings }: { product: Product; reviews: ProductReview[]; reviewSummary: ProductReviewSummary; settings: AdminSettings }) {
  const catalog = useCatalog();
  return <ProductSiteFrame settings={catalog.settings ?? settings}><ProductDetail key={product.id} product={product} reviews={reviews} reviewSummary={reviewSummary} /></ProductSiteFrame>;
}

export function ProductPageNotFound() {
  return <ProductSiteFrame settings={null}><div className={styles.notFound}><span dir="ltr">404</span><h1>این محصول پیدا نشد</h1><p>این نشانی معتبر نیست یا محصول هنوز در فروشگاه منتشر نشده است.</p><Link className="button button-primary" href="/shop">بازگشت به فروشگاه <Icon name="arrow" size={19} /></Link></div></ProductSiteFrame>;
}

export function ProductPageLoading() {
  return <div className={styles.site}><ProductHeader count={0} openPanel={() => {}} /><main className={styles.loading} aria-busy="true" aria-label="در حال دریافت اطلاعات محصول"><div className={styles.loadingImage} /><div className={styles.loadingCopy}><span /><span /><span /><p role="status">در حال دریافت اطلاعات محصول…</p></div></main></div>;
}
