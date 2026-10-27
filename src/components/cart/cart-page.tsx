"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCatalog } from "@/lib/catalog-store";
import { buildCartShoppingList, getCartTotals, resolveCartLines, type CartLine, type CartTotals } from "@/lib/cart";
import { normalizeDigits } from "@/lib/demo-auth";
import { formatPrice, getProductPrice, isProductAvailable, type Product } from "@/lib/products";
import type { AdminSettings } from "@/lib/admin-types";
import { getShippingMethods, type ShippingMethodId } from "@/lib/shipping";
import { Icon } from "../icons";
import { getListingPrice, hasAvailableSelection, variantLabel } from "../product-presentation";
import { ShopPanels } from "../shop-panels";
import { ShippingMethodPicker } from "../shipping-method-picker";
import { useShop } from "../shop-store";
import { StoreFooter } from "../store-footer";
import { StoreHeader, type Panel } from "../store-header";
import styles from "./cart-page.module.css";

function Money({ amount, strong = false }: { amount: number; strong?: boolean }) {
  return <span className={styles.money}>{strong ? <strong>{formatPrice(amount)}</strong> : <bdi>{formatPrice(amount)}</bdi>}<small>تومان</small></span>;
}

function availableListingPrice(product: Product): number | null {
  if (!product.hasVariants) return isProductAvailable(product) ? getProductPrice(product) : null;
  const prices = product.variants.filter(variant => isProductAvailable(product, variant))
    .map(variant => getProductPrice(product, variant)).filter((price): price is number => price !== null);
  return prices.length ? Math.min(...prices) : null;
}

function CheckoutSteps() {
  return <ol className={styles.steps} aria-label="مراحل خرید">
    <li aria-current="step"><span>۱</span>سبد خرید</li>
    <li><span>۲</span>اطلاعات و ارسال</li>
    <li><span>۳</span>ثبت سفارش</li>
  </ol>;
}

function CartRow({ line, showStock, canIncrease, onQuantity, onRemove, onSave }: { line: CartLine; showStock: boolean; canIncrease: boolean; onQuantity: (line: CartLine, quantity: number) => void; onRemove: (line: CartLine) => void; onSave: (line: CartLine) => void }) {
  const { product, variant } = line;
  const label = `${product.name}${variant ? `، ${variantLabel(product, variant)}` : ""}`;
  const preorder = (variant?.availability ?? product.availability) === "preorder";
  const stock = variant?.stock ?? product.stock;
  return <article className={styles.cartRow} aria-label={label} data-cart-line={line.key}>
    <Link className={styles.productImage} href={`/product/${encodeURIComponent(product.slug)}`} aria-label={`مشاهده ${label}`}><Image src={product.image} alt={product.images[0]?.alt || product.name} width={180} height={190} sizes="(max-width: 600px) 86px, 120px" /></Link>
    <div className={styles.productInfo}>
      <span className={styles.brand} dir="auto">{product.brand}</span>
      <h2><Link href={`/product/${encodeURIComponent(product.slug)}`}>{product.name}</Link></h2>
      {variant ? <p className={styles.variant}>{variantLabel(product, variant)}</p> : product.size ? <p className={styles.variant}>{product.size}</p> : null}
      {preorder ? <p className={styles.stock}>پیش‌فروش</p> : showStock && product.trackStock && stock <= 5 ? <p className={styles.stock}>تنها {formatPrice(stock)} عدد در انبار باقی مانده</p> : null}
      <div className={styles.rowActions}>
        <button type="button" onClick={() => onSave(line)} aria-label={`ذخیره ${label} برای بعد`}><Icon name="heart" size={15} />ذخیره برای بعد</button>
        <button type="button" onClick={() => onRemove(line)} aria-label={`حذف ${label} از سبد`}>حذف</button>
      </div>
    </div>
    <div className={styles.lineControls}>
      <div className={styles.quantity} dir="ltr" role="group" aria-label={`تعداد ${label}`}>
        <button type="button" aria-label={`افزایش تعداد ${label}`} disabled={!canIncrease || line.quantity >= line.stockLimit} onClick={() => onQuantity(line, line.quantity + 1)}><Icon name="plus" size={15} /></button>
        <output aria-label={`تعداد انتخاب‌شده ${label}`}>{formatPrice(line.quantity)}</output>
        <button type="button" aria-label={`کاهش تعداد ${label}`} disabled={line.quantity <= 1} onClick={() => onQuantity(line, line.quantity - 1)}><Icon name="minus" size={15} /></button>
      </div>
      <div className={styles.linePrice}>
        {line.savings > 0 ? <del>{formatPrice(line.originalLineTotal)} تومان</del> : null}
        <Money amount={line.lineTotal} strong />
        {line.savings > 0 ? <span className={styles.savings}>{formatPrice(line.savings)} تومان صرفه‌جویی</span> : null}
      </div>
    </div>
  </article>;
}

function MiniProduct({ product, onAdd, saved, canAdd }: { product: Product; onAdd: (product: Product) => void; saved?: boolean; canAdd: boolean }) {
  const price = product.hasVariants ? availableListingPrice(product) : getListingPrice(product);
  const available = hasAvailableSelection(product);
  const viewOnly = product.hasVariants || price === null || !available;
  const href = `/product/${encodeURIComponent(product.slug)}`;
  const action = product.hasVariants && available && price !== null ? "انتخاب تنوع" : viewOnly ? "مشاهده محصول" : saved ? "برگرداندن به سبد خرید" : "افزودن به سبد خرید";
  return <article className={styles.miniProduct} data-saved-product={saved ? product.id : undefined} data-recommendation={saved ? undefined : product.id}>
    <Link className={styles.miniImage} href={href} aria-label={`مشاهده ${product.name}`}><Image src={product.image} alt={product.images[0]?.alt || product.name} width={110} height={120} sizes="(max-width: 600px) 85px, 80px" /></Link>
    <div className={styles.miniInfo}><h3><Link href={href}>{product.name}</Link></h3>{price === null ? <span className={styles.inquiry}>استعلام قیمت</span> : <span className={styles.miniPrice}>{product.hasVariants ? <small>از</small> : null}<Money amount={price} /></span>}</div>
    {viewOnly ? <Link className={styles.miniAction} href={href}>{action}</Link> : <button className={styles.miniAction} type="button" disabled={!canAdd} onClick={() => onAdd(product)} aria-label={`${action}: ${product.name}`}>{action}</button>}
  </article>;
}

function OrderSummary({ totals, settings, canDownload, onDownload, onShippingChange, shippingDisabled }: { totals: CartTotals; settings: AdminSettings; canDownload: boolean; onDownload: () => void; onShippingChange: (method: ShippingMethodId) => void; shippingDisabled: boolean }) {
  const rawPhone = normalizeDigits(settings.supportPhone).replace(/[^\d+]/g, "");
  const supportHref = /^\+?\d{7,15}$/.test(rawPhone) ? `tel:${rawPhone}` : null;
  return <aside className={styles.summary} aria-label="خلاصه سفارش">
    <h2>خلاصه سفارش</h2>
    <dl className={styles.summaryLines}>
      <div><dt>جمع کالاها <span>({formatPrice(totals.totalQuantity)})</span></dt><dd data-cart-total="originalSubtotal"><Money amount={totals.originalSubtotal} /></dd></div>
      {totals.discount > 0 ? <div className={styles.discountRow}><dt>تخفیف محصولات</dt><dd data-cart-total="discount"><span aria-hidden="true">− </span><Money amount={totals.discount} /></dd></div> : null}
    </dl>
    <ShippingMethodPicker methods={getShippingMethods(settings)} selected={totals.shippingMethod?.id ?? null} onChange={onShippingChange} disabled={shippingDisabled} />
    <dl className={styles.summaryLines}><div><dt>هزینه ارسال</dt><dd data-cart-total="shipping">{!totals.shippingMethod ? "در دسترس نیست" : totals.shippingMethod.postpaid ? "پس‌کرایه" : totals.shipping ? <Money amount={totals.shipping} /> : "رایگان"}</dd></div></dl>
    <div className={styles.total}><span>مبلغ قابل پرداخت</span><span data-cart-total="total"><Money amount={totals.total} strong /></span></div>
    {totals.discount > 0 ? <p className={styles.totalSaving}><span>مجموع سود شما</span><Money amount={totals.discount} /></p> : null}
    {canDownload && settings.acceptOrders && totals.shippingMethod ? <Link className={styles.downloadButton} href="/checkout">ادامه و ثبت سفارش <Icon name="arrow" size={19} /></Link> : <button className={styles.downloadButton} type="button" disabled>ادامه و ثبت سفارش <Icon name="arrow" size={19} /></button>}
    <button className={styles.exportButton} type="button" onClick={onDownload} disabled={!canDownload || !totals.shippingMethod}>ذخیره فهرست خرید <Icon name="download" size={16} /></button>
    <p className={styles.checkoutNote}>سفارش برای بررسی فروشگاه ثبت می‌شود. پرداخت آنلاین هنوز فعال نیست.</p>
    {supportHref ? <a className={styles.supportLink} href={supportHref}>تماس با پشتیبانی فروشگاه <Icon name="arrow" size={16} /></a> : null}
  </aside>;
}

export function CartPage() {
  const catalog = useCatalog();
  const shop = useShop();
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const lines = resolveCartLines(shop.cart, catalog.products);
  const totals = getCartTotals(lines, catalog.settings, shop.shippingMethod);
  const inCart = new Set(lines.map(line => line.product.id));
  const saved = catalog.products.filter(product => shop.favorites.includes(product.id) && !inCart.has(product.id));
  const inCartCategories = new Set(lines.map(line => line.product.category));
  const recommendations = catalog.products.filter(product => !inCart.has(product.id) && !shop.favorites.includes(product.id) && availableListingPrice(product) !== null)
    .sort((left, right) => Number(inCartCategories.has(right.category)) - Number(inCartCategories.has(left.category))).slice(0, 3);
  const canIncrease = Boolean(catalog.loaded && !catalog.loading && !catalog.error && catalog.settings?.acceptOrders);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function notify(message: string) { setToast(previous => ({ message, id: (previous?.id ?? 0) + 1 })); }
  function focusHeading() { requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true })); }
  function changeQuantity(line: CartLine, quantity: number) {
    if (!shop.setQuantity(line.product.id, quantity, line.variant?.id)) {
      notify("تعداد انتخاب‌شده با موجودی فعلی محصول هماهنگ نیست.");
      void catalog.refresh();
    }
  }
  function removeLine(line: CartLine) {
    if (shop.setQuantity(line.product.id, 0, line.variant?.id)) { notify("محصول از سبد خرید حذف شد."); focusHeading(); }
  }
  function saveForLater(line: CartLine) {
    if (shop.moveToFavorites(line.product.id, line.variant?.id)) { notify("محصول برای بعد در علاقه‌مندی‌ها ذخیره شد."); focusHeading(); }
  }
  function addProduct(product: Product) {
    if (product.hasVariants) { router.push(`/product/${encodeURIComponent(product.slug)}`); return; }
    notify(shop.addToCart(product.id) ? `${product.name} به سبد اضافه شد.` : "افزودن این محصول با موجودی فعلی ممکن نیست.");
  }
  function changeShippingMethod(method: ShippingMethodId) {
    if (!shop.setShippingMethod(method)) {
      notify("این روش ارسال در حال حاضر در دسترس نیست. اطلاعات فروشگاه را به‌روز کنید.");
      void catalog.refresh();
    }
  }
  function downloadShoppingList() {
    if (!catalog.settings || !lines.length || catalog.error || catalog.loading || !totals.shippingMethod) return;
    const content = buildCartShoppingList(lines, totals, catalog.settings.storeName);
    const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "seven-sparkles-shopping-list.txt";
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("فهرست خرید برای ذخیره آماده شد.");
  }

  const savedSection = saved.length ? <section className={styles.relatedSection} aria-label="ذخیره‌شده برای بعد"><div className={styles.sectionHeading}><h2>ذخیره‌شده برای بعد <span>({formatPrice(saved.length)})</span></h2>{saved.length > 3 ? <button type="button" onClick={() => setPanel("favorites")}>همه علاقه‌مندی‌ها <Icon name="arrow" size={16} /></button> : null}</div><div className={styles.miniGrid}>{saved.slice(0, 3).map(product => <MiniProduct key={product.id} product={product} saved onAdd={addProduct} canAdd={canIncrease} />)}</div></section> : null;
  const recommendationsSection = recommendations.length ? <section className={styles.relatedSection} aria-label="محصولات پیشنهادی"><h2>شاید این‌ها را هم بپسندی</h2><div className={styles.miniGrid}>{recommendations.map(product => <MiniProduct key={product.id} product={product} onAdd={addProduct} canAdd={canIncrease} />)}</div></section> : null;

  return <>
    <a className="skip-link" href="#cart-main">رفتن به سبد خرید</a>
    <StoreHeader activePage="cart" cartCount={shop.cartCount} favoriteCount={shop.favorites.length} openPanel={setPanel} announcement={catalog.settings?.announcement ?? ""} storeName={catalog.settings?.storeName} />
    <main className={styles.page} id="cart-main">
      <div className={styles.pageHeading}><h1 ref={headingRef} tabIndex={-1}>سبد خرید{catalog.loaded ? <span>({formatPrice(totals.totalQuantity)} کالا)</span> : null}</h1><CheckoutSteps /></div>
      {!catalog.loaded ? <div className={styles.state} role={catalog.error ? "alert" : "status"}><Icon name={catalog.error ? "globe" : "bag"} size={38} /><h2>{catalog.error ? "دریافت سبد خرید ممکن نشد" : "در حال دریافت اطلاعات سبد خرید…"}</h2>{catalog.error ? <><p>{catalog.error}</p><button className="button button-primary" onClick={() => { void catalog.refresh(); }}>تلاش دوباره <Icon name="arrow" size={18} /></button></> : null}</div> : <>
        {catalog.error ? <div className="catalog-notice" role="alert">{catalog.error}<button type="button" onClick={() => { void catalog.refresh(); }}>تلاش دوباره</button></div> : null}
        {!catalog.settings?.acceptOrders && lines.length ? <p className="catalog-notice">پذیرش سفارش جدید فعلاً متوقف است. می‌توانی تعداد کالاها را کاهش بدهی یا آن‌ها را برای بعد ذخیره کنی.</p> : null}
        {lines.length ? <div className={styles.cartLayout}>
          <div className={styles.cartContents}><section className={styles.items} aria-label="کالاهای سبد خرید">{lines.map(line => <CartRow key={line.key} line={line} showStock={catalog.settings?.showStock ?? false} canIncrease={canIncrease} onQuantity={changeQuantity} onRemove={removeLine} onSave={saveForLater} />)}</section>{savedSection}{recommendationsSection}<Link className={styles.continueShopping} href="/shop">ادامه خرید از فروشگاه <Icon name="arrow" size={19} /></Link></div>
          {catalog.settings ? <OrderSummary totals={totals} settings={catalog.settings} canDownload={!catalog.error && !catalog.loading} onDownload={downloadShoppingList} onShippingChange={changeShippingMethod} shippingDisabled={catalog.loading || Boolean(catalog.error)} /> : null}
        </div> : <>
          <div className={styles.state}><span className={styles.emptyIcon}><Icon name="bag" size={37} /></span><h2>سبد خریدت منتظر یک انتخاب درخشان است</h2><p>محصولات دلخواهت را از فروشگاه انتخاب کن و اینجا کنار هم ببین.</p><Link className="button button-primary" href="/shop">کشف محصولات <Icon name="arrow" size={19} /></Link></div>
          {savedSection}{recommendationsSection}
        </>}
      </>}
    </main>
    <StoreFooter settings={catalog.settings} openPanel={setPanel} />
    <ShopPanels panel={panel} close={() => setPanel(null)} openPanel={setPanel} chooseCategory={category => { setPanel(null); router.push(category === "all" ? "/shop" : `/shop?category=${encodeURIComponent(category)}`); }} />
    <div className={`toast ${toast ? "is-visible" : ""}`} role="status" aria-live="polite" inert={!toast}><Icon name="check" size={20} /><span>{toast?.message}</span></div>
  </>;
}
