"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Dialog } from "./dialog";
import { CustomerAccountContent } from "./customer-account-content";
import { Icon, Star } from "./icons";
import { type Panel } from "./store-header";
import { type Category } from "./product-catalog";
import { formatPrice, type Product } from "@/lib/products";
import { useCatalog } from "@/lib/catalog-store";
import { buildCartShoppingList, getCartTotals, resolveCartLines } from "@/lib/cart";
import { useShop } from "./shop-store";
import { getListingPrice, variantLabel } from "./product-presentation";
import { getShippingMethods } from "@/lib/shipping";
import { ShippingMethodPicker } from "./shipping-method-picker";
import styles from "./product-details.module.css";

const panelTitles = { cart: "سبد خرید تو", search: "ستاره‌ی روتینت را پیدا کن", favorites: "محصولات دوست‌داشتنی تو", guide: "روتین تو، به سبک خودت", faq: "پاسخ به سوال‌های تو", account: "حساب من", orders: "سفارش‌های من", tracking: "پیگیری سفارش" };
const normalize = (value: string) => value.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\s\p{P}\u200c]+/gu, "");

export function ShopPanels({ panel, close, chooseCategory, openPanel }: { panel: Panel; close: () => void; chooseCategory: (category: Category) => void; openPanel: (panel: Panel) => void }) {
  const shop = useShop();
  const catalog = useCatalog();
  const { products, settings } = catalog;
  const [query, setQuery] = useState("");
  const searchResults = products.filter(product => normalize(`${product.name} ${product.englishName} ${product.brand} ${product.tags.join(" ")}`).includes(normalize(query.trim())));
  const cartProducts = resolveCartLines(shop.cart, products);
  const totals = getCartTotals(cartProducts, settings, shop.shippingMethod);
  const { productSubtotal: total, shipping } = totals;
  const favoriteProducts = products.filter(product => shop.favorites.includes(product.id));

  function saveShoppingList() {
    if (!catalog.loaded || catalog.loading || catalog.error || !settings || !cartProducts.length || !totals.shippingMethod) return;
    const content = buildCartShoppingList(cartProducts, totals, settings?.storeName || "سون اسپارکلز");
    const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "seven-sparkles-shopping-list.txt"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const miniProduct = (product: Product) => {
    const price = getListingPrice(product);
    return <Link className="mini-product" key={product.id} href={`/product/${encodeURIComponent(product.slug)}`} onClick={close}>
      <Image src={product.image} alt="" width={90} height={90} /><span><small dir="ltr">{product.brand}</small><strong>{product.name}</strong><span>{price === null ? "استعلام قیمت" : `${product.hasVariants ? "از " : ""}${formatPrice(price)} تومان`}</span></span><Icon name="arrow" size={19} />
    </Link>;
  };

  return <>
    <Dialog open={panel !== null} onClose={close} title={panel ? panelTitles[panel] : ""} className={panel === "cart" ? "cart-dialog" : ""}>
      {(panel === "account" || panel === "orders" || panel === "tracking") && <div className="panel-content"><CustomerAccountContent section={panel} onNavigate={openPanel} /></div>}
      {(panel === "search" || panel === "favorites" || panel === "cart") && !catalog.loaded && <div className="panel-content empty-state" role={catalog.error ? "alert" : "status"}><Icon name="globe" size={32} /><p>{catalog.error || "در حال دریافت محصولات…"}</p>{catalog.error && <button className="text-link" onClick={() => { void catalog.refresh(); }}>تلاش دوباره <Icon name="arrow" size={18} /></button>}</div>}
      {(panel === "search" || panel === "favorites" || panel === "cart") && catalog.loaded && catalog.error && <div className="catalog-notice" role="alert">{catalog.error}<button onClick={() => { void catalog.refresh(); }}>تلاش دوباره</button></div>}
      {panel === "search" && catalog.loaded && <div className="panel-content">
        <label className="search-field"><Icon name="search" /><input autoFocus aria-label="نام محصول یا برند" placeholder="نام محصول یا برند را جستجو کن..." value={query} onChange={event => setQuery(event.target.value)} /></label>
        <p className="panel-caption">{query ? `${searchResults.length.toLocaleString("fa-IR")} محصول پیدا شد` : "از اینجا شروع کن"}</p>
        <div className="mini-product-list">{searchResults.map(miniProduct)}</div>
        {searchResults.length === 0 && <div className="empty-state"><Icon name="search" size={36} /><p>محصولی با این نام پیدا نشد.</p><button className="text-link" onClick={() => setQuery("")}>دیدن همه محصولات <Icon name="arrow" size={18} /></button></div>}
      </div>}
      {panel === "favorites" && catalog.loaded && <div className="panel-content">
        {favoriteProducts.length ? <div className="mini-product-list">{favoriteProducts.map(miniProduct)}</div> : <div className="empty-state"><Icon name="heart" size={42} /><h3>جای علاقه‌مندی‌هایت اینجاست</h3><p>روی قلب کنار هر محصول بزن تا برای بعد نگهش داری.</p><button className="button button-primary" onClick={close}>کشف محصولات <Icon name="arrow" size={18} /></button></div>}
      </div>}
      {panel === "cart" && catalog.loaded && <div className="panel-content">
        {cartProducts.length ? <>
          <div className="cart-items">{cartProducts.map(({ product, variant, lineTotal, quantity, key, stockLimit }) => <div className="cart-item" key={key}>
            <Image src={product.image} alt={product.images[0]?.alt || product.name} width={105} height={105} />
            <div className="cart-item-content"><span className="product-brand" dir="ltr">{product.brand}</span><h3>{product.name}</h3>
              {variant && <p className={styles.cartVariant}>{variantLabel(product, variant)}</p>}
              {!product.hasVariants && product.salePrice !== null && product.price !== null && <p className={styles.cartUnitPrice}>قیمت پیش از تخفیف: <del>{formatPrice(product.price)} تومان</del></p>}
              <div className="cart-item-bottom"><div className="quantity-control">
                <button aria-label={`افزایش تعداد ${product.name}${variant ? `، ${variantLabel(product, variant)}` : ""}`} disabled={quantity >= stockLimit || !settings?.acceptOrders || catalog.loading || Boolean(catalog.error)} onClick={() => shop.setQuantity(product.id, quantity + 1, variant?.id)}><Icon name="plus" size={16} /></button>
                <span>{quantity.toLocaleString("fa-IR")}</span>
                <button aria-label={`کاهش تعداد ${product.name}${variant ? `، ${variantLabel(product, variant)}` : ""}`} onClick={() => shop.setQuantity(product.id, quantity - 1, variant?.id)}><Icon name="minus" size={16} /></button>
              </div><span>{formatPrice(lineTotal)} <small>تومان</small></span></div>
              <button className="remove-item" onClick={() => shop.setQuantity(product.id, 0, variant?.id)}>حذف از سبد</button>
            </div>
          </div>)}</div>
          <div className="cart-summary"><div><span>جمع سبد خرید</span><strong>{formatPrice(total)} <small>تومان</small></strong></div>
            <ShippingMethodPicker methods={getShippingMethods(settings)} selected={totals.shippingMethod?.id ?? null} onChange={method => { shop.setShippingMethod(method); }} disabled={catalog.loading || Boolean(catalog.error)} />
            <div className="cart-shipping"><span>هزینه ارسال</span><span>{!totals.shippingMethod ? "در دسترس نیست" : totals.shippingMethod.postpaid ? "پس‌کرایه" : shipping ? `${formatPrice(shipping)} تومان` : "رایگان"}</span></div>
            <div className="cart-shipping"><span>جمع فهرست</span><strong>{formatPrice(total + shipping)} <small>تومان</small></strong></div>
            {!settings?.acceptOrders && <p className="catalog-notice">پذیرش سفارش جدید فعلاً متوقف است.</p>}
            <Link className="button button-primary full-width" href="/cart" onClick={close}>مشاهده و مدیریت سبد خرید <Icon name="arrow" size={20} /></Link>
            {!catalog.loading && !catalog.error && settings?.acceptOrders && totals.shippingMethod ? <Link className="text-link" href="/checkout" onClick={close}>ادامه و ثبت سفارش <Icon name="arrow" size={18} /></Link> : null}
            <button className="text-link" disabled={catalog.loading || Boolean(catalog.error) || !totals.shippingMethod} onClick={saveShoppingList}>ذخیره فهرست خرید <Icon name="download" size={20} /></button>
            <p>ثبت سفارش برای بررسی فروشگاه انجام می‌شود؛ پرداخت آنلاین هنوز فعال نیست.</p>
            <button className="text-link" onClick={close}>ادامه انتخاب محصولات <Icon name="arrow" size={18} /></button>
          </div>
        </> : <div className="empty-state"><Icon name="bag" size={44} /><h3>سبد تو منتظر یک انتخاب درخشان است</h3><p>محصولات دلخواهت را پیدا کن و به سبد اضافه کن.</p><button className="button button-primary" onClick={close}>شروع خرید <Icon name="arrow" size={18} /></button><Link className="text-link" href="/cart" onClick={close}>مشاهده سبد خرید <Icon name="arrow" size={18} /></Link></div>}
      </div>}
      {panel === "guide" && <div className="panel-content">
        <div className="guide-intro"><Star /><p>هر مراقبت، از یک انتخاب آگاهانه شروع می‌شود.</p><h3>کدام دنیای مراقبت را می‌خواهی کشف کنی؟</h3></div>
        {catalog.loading && !catalog.loaded ? <p role="status">در حال دریافت دسته‌بندی‌ها…</p> : catalog.error ? <p role="alert">{catalog.error}</p> : !catalog.categories.length ? <p>هنوز دسته‌بندی‌ای ثبت نشده است.</p> : null}
        <div className="guide-options">{catalog.categories.map((category, index) => <button key={category.id} onClick={() => chooseCategory(category.id)}>
          <Icon name={index === 0 ? "leaf" : index === 1 ? "hand" : "sparkle"} size={28} />
          <span><strong>{category.name}</strong>{category.description ? <small>{category.description}</small> : null}</span><Icon name="arrow" size={20} />
        </button>)}</div><p className="guide-footnote">با دیدن جزئیات هر محصول، انتخاب‌هایت را دقیق‌تر مقایسه کن.</p>
      </div>}
      {panel === "faq" && <div className="panel-content faq-list">
        <details open><summary>چطور محصول مورد نظرم را پیدا کنم؟</summary><p>از جستجوی نام محصول یا برند استفاده کن. فیلترهای فروشگاه هم محصولات را بر اساس دسته‌بندی جدا می‌کنند.</p></details>
        <details><summary>چطور محصولات را برای بعد نگه دارم؟</summary><p>قلب کنار محصول را انتخاب کن. فهرست علاقه‌مندی‌ها از آیکون قلب در بالای صفحه در دسترس است.</p></details>
        <details><summary>آیا امکان ثبت سفارش آنلاین وجود دارد؟</summary><p>بعد از انتخاب محصولات، اطلاعات گیرنده و نشانی را در صفحه تکمیل سفارش وارد کن. سفارش برای بررسی فروشگاه ثبت می‌شود؛ پرداخت آنلاین هنوز فعال نیست.</p></details>
      </div>}
    </Dialog>
  </>;
}
