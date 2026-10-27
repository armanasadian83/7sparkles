"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useCatalog } from "@/lib/catalog-store";
import type { CatalogTerm } from "@/lib/catalog-terms";
import { normalizeDigits } from "@/lib/demo-auth";
import { formatPrice, getProductStockLimit, type Product } from "@/lib/products";
import { Dialog } from "../dialog";
import { Icon, Star } from "../icons";
import { ProductCard } from "../product-catalog";
import { ShopPanels } from "../shop-panels";
import { useShop } from "../shop-store";
import { StoreFooter } from "../store-footer";
import { StoreHeader, type Panel } from "../store-header";
import { filterShopProducts, getShopPriceBounds, readShopFilters, readShopSort, readShopView, type ShopFilters } from "./shop-filtering";
import styles from "./shop-page.module.css";

type Catalog = ReturnType<typeof useCatalog>;
type UpdateParams = (changes: Record<string, string | string[] | null>, replace?: boolean) => void;
const FILTER_KEYS = ["q", "category", "brand", "min", "max", "available", "sale"];
const PAGE_SIZE = 9;

function ShopIcon({ name }: { name: "grid" | "list" | "filter" | "chevron" }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "grid" ? <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></> : name === "list" ? <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="3" /></> : name === "filter" ? <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="var(--paper)" /><circle cx="15" cy="17" r="2" fill="var(--paper)" /></> : <path d="m7 10 5 5 5-5" />}
  </svg>;
}

function ShopBanner() {
  return <section className={styles.banner} aria-labelledby="shop-title">
    <div className={styles.cosmos} aria-hidden="true"><span className={styles.orbit} /><span className={styles.orbitTwo} /><Star className={styles.bannerStar} /><Star className={styles.bannerStarSmall} /></div>
    <nav className={styles.breadcrumb} aria-label="مسیر صفحه"><Link href="/">خانه</Link><span aria-hidden="true">‹</span><span aria-current="page">فروشگاه</span></nav>
    <h1 id="shop-title">فروشگاه <Star /></h1>
    <p>انتخابی آگاهانه از برندهای معتبر پوست و مو</p>
  </section>;
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return <details className={styles.filterSection} open><summary>{title}<ShopIcon name="chevron" /></summary><div className={styles.filterBody}>{children}</div></details>;
}

function PriceFilter({ bounds, filters, update }: { bounds: { min: number; max: number } | null; filters: ShopFilters; update: UpdateParams }) {
  const id = useId();
  const [draftMin, setDraftMin] = useState<string | null>(null);
  const [draftMax, setDraftMax] = useState<string | null>(null);
  const [error, setError] = useState("");
  const rangeMin = bounds?.min ?? 0;
  const rangeMax = bounds?.max ?? 0;
  const low = Math.max(rangeMin, Math.min(rangeMax, filters.minPrice ?? rangeMin));
  const high = Math.max(low, Math.min(rangeMax, filters.maxPrice ?? rangeMax));
  const span = rangeMax - rangeMin;
  const left = span ? (low - rangeMin) / span * 100 : 0;
  const right = span ? (high - rangeMin) / span * 100 : 100;

  function changeBounds(min: number | null, max: number | null, replace = false) {
    update({ min: min === null ? null : String(min), max: max === null ? null : String(max) }, replace);
  }

  function commit(key: "min" | "max", value: string) {
    const normalized = normalizeDigits(value).replace(/[\s,٬]/g, "");
    if (normalized && (!/^\d+$/.test(normalized) || !Number.isSafeInteger(Number(normalized)))) {
      setError("قیمت را به‌صورت یک عدد معتبر وارد کن.");
      return;
    }
    const valueNumber = normalized ? Number(normalized) : null;
    const nextMin = key === "min" ? valueNumber : filters.minPrice;
    const nextMax = key === "max" ? valueNumber : filters.maxPrice;
    if (nextMin !== null && nextMax !== null && nextMin > nextMax) {
      setError("حداقل قیمت باید کمتر یا مساوی حداکثر قیمت باشد.");
      return;
    }
    setError("");
    if (key === "min") setDraftMin(null); else setDraftMax(null);
    changeBounds(nextMin, nextMax);
  }

  return <>
    {bounds ? <div className={styles.rangeControls} dir="ltr" style={{ "--range-left": `${left}%`, "--range-width": `${right - left}%` } as CSSProperties}>
      <span className={styles.rangeTrack} /><span className={styles.rangeFill} />
      <input type="range" aria-label="حداقل قیمت" min={rangeMin} max={rangeMax} step="1" value={low} disabled={!span} onChange={event => changeBounds(Math.min(Number(event.target.value), high), filters.maxPrice === null ? null : high, true)} />
      <input type="range" aria-label="حداکثر قیمت" min={rangeMin} max={rangeMax} step="1" value={high} disabled={!span} onChange={event => changeBounds(filters.minPrice === null ? null : low, Math.max(Number(event.target.value), low), true)} />
    </div> : <p className={styles.filterHint}>هنوز قیمتی برای محصولات ثبت نشده است.</p>}
    <div className={styles.priceFields}>
      <label><span>از</span><input aria-label="قیمت از (تومان)" inputMode="numeric" dir="ltr" placeholder={bounds ? formatPrice(rangeMin) : "۰"} value={draftMin ?? (filters.minPrice === null ? "" : formatPrice(filters.minPrice))} onChange={event => setDraftMin(event.target.value)} onBlur={event => commit("min", event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-invalid={Boolean(error)} aria-describedby={error ? id : undefined} /></label>
      <label><span>تا</span><input aria-label="قیمت تا (تومان)" inputMode="numeric" dir="ltr" placeholder={bounds ? formatPrice(rangeMax) : "—"} value={draftMax ?? (filters.maxPrice === null ? "" : formatPrice(filters.maxPrice))} onChange={event => setDraftMax(event.target.value)} onBlur={event => commit("max", event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-invalid={Boolean(error)} aria-describedby={error ? id : undefined} /></label>
    </div>
    {error ? <p id={id} role="alert" className={styles.priceError}>{error}</p> : null}
  </>;
}

function Filters({ catalog, filters, update, reset, showHeading = true }: { catalog: Catalog; filters: ShopFilters; update: UpdateParams; reset: () => void; showHeading?: boolean }) {
  function toggle(key: "category" | "brand", value: string, selected: string[]) {
    update({ [key]: selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value] });
  }
  const terms = (items: CatalogTerm[], kind: "category" | "brand") => items.length ? items.map(term => {
    const value = kind === "category" ? term.id : term.name;
    const selected = kind === "category" ? filters.categories : filters.brands;
    const count = catalog.products.filter(product => kind === "category" ? product.category === term.id : product.brand === term.name).length;
    return <label className={styles.term} key={term.id}><input type="checkbox" name={kind} value={value} checked={selected.includes(value)} onChange={() => toggle(kind, value, selected)} /><span dir="auto">{term.name}</span><small>{formatPrice(count)}</small></label>;
  }) : <p className={styles.filterHint}>هنوز {kind === "category" ? "دسته‌بندی" : "برندی"} ثبت نشده است.</p>;
  return <>
    <div className={styles.filterHeading}>{showHeading ? <h2>فیلترها</h2> : <span>انتخاب‌های تو</span>}<button type="button" onClick={reset}>پاک‌کردن همه</button></div>
    <FilterSection title="دسته‌بندی">{terms(catalog.categories, "category")}</FilterSection>
    <FilterSection title="برند">{terms(catalog.brands, "brand")}</FilterSection>
    <FilterSection title="محدوده قیمت (تومان)"><PriceFilter bounds={getShopPriceBounds(catalog.products)} filters={filters} update={update} /></FilterSection>
    <FilterSection title="موجودی و تخفیف">
      <label className={styles.switchRow}><span>فقط کالاهای موجود</span><input type="checkbox" role="switch" checked={filters.availableOnly} onChange={event => update({ available: event.target.checked ? "1" : null })} /><span className={styles.switch} aria-hidden="true" /></label>
      <label className={styles.switchRow}><span>فقط محصولات تخفیف‌دار</span><input type="checkbox" role="switch" checked={filters.discountedOnly} onChange={event => update({ sale: event.target.checked ? "1" : null })} /><span className={styles.switch} aria-hidden="true" /></label>
    </FilterSection>
  </>;
}

function CatalogLoading() {
  return <div className={styles.loading} role="status"><Star /><p>در حال دریافت محصولات فروشگاه…</p></div>;
}

function ShopCatalog({ catalog, favorites, onFavorite, onAdd, onView }: { catalog: Catalog; favorites: string[]; onFavorite: (id: string) => void; onAdd: (product: Product) => void; onView: (product: Product) => void }) {
  const params = useSearchParams();
  const filters = readShopFilters(params);
  const sort = readShopSort(params);
  const view = readShopView(params);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const signature = JSON.stringify([filters, sort]);
  const [windowSize, setWindowSize] = useState({ signature, count: PAGE_SIZE });
  const limit = windowSize.signature === signature ? windowSize.count : PAGE_SIZE;
  const matching = filterShopProducts(catalog.products, filters, sort);
  const visible = matching.slice(0, limit);
  const filterCount = filters.categories.length + filters.brands.length + Number(Boolean(filters.query)) + Number(filters.minPrice !== null || filters.maxPrice !== null) + Number(filters.availableOnly) + Number(filters.discountedOnly);

  // Native typing stays immediate while URL snapshots settle; back/reset still sync the field.
  useLayoutEffect(() => {
    const query = new URLSearchParams(window.location.search).get("q") ?? "";
    if (searchInput.current && searchInput.current.value !== query) searchInput.current.value = query;
  });

  function update(changes: Record<string, string | string[] | null>, replace = false) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key);
      if (Array.isArray(value)) value.forEach(item => next.append(key, item));
      else if (value) next.set(key, value);
    }
    const query = next.toString();
    const href = `/shop${query ? `?${query}` : ""}`;
    if (href === `${window.location.pathname}${window.location.search}`) return;
    if (replace) window.history.replaceState(null, "", href); else window.history.pushState(null, "", href);
  }
  function reset() {
    setResetVersion(version => version + 1);
    update(Object.fromEntries(FILTER_KEYS.map(key => [key, null])));
  }
  const selectedFilters = [
    ...filters.categories.map(value => ({ label: catalog.categories.find(term => term.id === value)?.name || "دسته‌بندی انتخاب‌شده", remove: () => update({ category: filters.categories.filter(item => item !== value) }) })),
    ...filters.brands.map(value => ({ label: value, remove: () => update({ brand: filters.brands.filter(item => item !== value) }) })),
    ...(filters.query ? [{ label: `جستجو: ${filters.query}`, remove: () => update({ q: null }) }] : []),
    ...(filters.minPrice !== null || filters.maxPrice !== null ? [{ label: `قیمت${filters.minPrice !== null ? ` از ${formatPrice(filters.minPrice)}` : ""}${filters.maxPrice !== null ? ` تا ${formatPrice(filters.maxPrice)}` : ""} تومان`, remove: () => update({ min: null, max: null }) }] : []),
    ...(filters.availableOnly ? [{ label: "فقط کالاهای موجود", remove: () => update({ available: null }) }] : []),
    ...(filters.discountedOnly ? [{ label: "تخفیف‌دار", remove: () => update({ sale: null }) }] : []),
  ];

  if (!catalog.loaded && !catalog.error) return <CatalogLoading />;
  if (!catalog.loaded && catalog.error) return <div className={styles.state} role="alert"><Icon name="globe" size={36} /><h2>ارتباط با فروشگاه برقرار نشد</h2><p>{catalog.error}</p><button className="button button-primary" onClick={() => { void catalog.refresh(); }}>تلاش دوباره <Icon name="arrow" size={18} /></button></div>;

  return <div className={styles.shopLayout}>
    <aside className={styles.filters} aria-label="فیلتر محصولات"><Filters key={resetVersion} catalog={catalog} filters={filters} update={update} reset={reset} /></aside>
    <section className={styles.results} aria-label="محصولات فروشگاه" aria-busy={catalog.loading}>
      <div className={styles.toolbar}>
        <p className={styles.resultCount} id="shop-result-count" role="status"><strong>{formatPrice(matching.length)}</strong> محصول{filterCount > 0 ? <span> از {formatPrice(catalog.products.length)}</span> : null}</p>
        <button className={styles.mobileFilterButton} type="button" onClick={() => setMobileFilters(true)} aria-haspopup="dialog"><ShopIcon name="filter" />فیلترها{filterCount ? <span>{formatPrice(filterCount)}</span> : null}</button>
        <label className={styles.search}><Icon name="search" size={19} /><input ref={searchInput} type="search" aria-label="جستجو در محصولات فروشگاه" placeholder="جستجو در محصولات…" defaultValue={params.get("q") ?? ""} onChange={event => update({ q: event.target.value || null }, true)} /></label>
        <label className={styles.sort}><span className="sr-only">مرتب‌سازی محصولات</span><select value={sort} onChange={event => update({ sort: event.target.value === "recommended" ? null : event.target.value })}><option value="recommended">پیشنهادی</option><option value="price-asc">ارزان‌ترین</option><option value="price-desc">گران‌ترین</option><option value="name">نام محصول</option></select><ShopIcon name="chevron" /></label>
        <div className={styles.viewToggle} role="group" aria-label="نمایش محصولات"><button type="button" aria-label="نمایش شبکه‌ای" aria-pressed={view === "grid"} onClick={() => update({ view: null })}><ShopIcon name="grid" /></button><button type="button" aria-label="نمایش فهرستی" aria-pressed={view === "list"} onClick={() => update({ view: "list" })}><ShopIcon name="list" /></button></div>
      </div>
      {selectedFilters.length ? <div className={styles.selectedFilters} aria-label="فیلترهای انتخاب‌شده">{selectedFilters.map((item, index) => <button type="button" key={`${index}-${item.label}`} onClick={item.remove} aria-label={`حذف فیلتر ${item.label}`}>{item.label}<Icon name="close" size={13} /></button>)}<button type="button" className={styles.clearFilters} onClick={reset}>پاک‌کردن همه</button></div> : null}
      {catalog.error ? <div className="catalog-notice" role="alert">{catalog.error}<button onClick={() => { void catalog.refresh(); }}>تلاش دوباره</button></div> : null}
      {!catalog.settings?.acceptOrders ? <p className="catalog-notice">پذیرش سفارش جدید فعلاً متوقف است. می‌توانی محصولات را بررسی کنی.</p> : null}
      {visible.length ? <>
        <div className={`${styles.productGrid} ${view === "list" ? styles.productList : ""}`} data-shop-view={view}>
          {visible.map(product => <ProductCard key={product.id} product={product} layout={view} showDiscount favorite={favorites.includes(product.id)} onFavorite={() => onFavorite(product.id)} onAdd={() => onAdd(product)} onView={() => onView(product)} showStock={catalog.settings?.showStock ?? false} acceptOrders={Boolean(catalog.settings?.acceptOrders && !catalog.error)} />)}
        </div>
        <div className={styles.pagination}><p>نمایش {formatPrice(visible.length)} از {formatPrice(matching.length)} محصول</p>{visible.length < matching.length ? <button type="button" className="button button-outline" onClick={() => setWindowSize({ signature, count: limit + PAGE_SIZE })}>نمایش بیشتر <span>({formatPrice(matching.length - visible.length)})</span><ShopIcon name="chevron" /></button> : null}</div>
      </> : <div className={styles.state}><Icon name={catalog.products.length ? "search" : "bag"} size={40} /><h2>{catalog.products.length ? "برای این انتخاب، محصولی پیدا نشد" : "انتخاب‌های تازه در راه‌اند"}</h2><p>{catalog.products.length ? "فیلترها را تغییر بده یا جستجوی دیگری را امتحان کن." : "هنوز محصولی در فروشگاه منتشر نشده است."}</p>{filterCount > 0 ? <button className="button button-outline" onClick={reset}>دیدن همه محصولات <Icon name="arrow" size={18} /></button> : null}</div>}
    </section>
    <Dialog open={mobileFilters} onClose={() => setMobileFilters(false)} title="فیلتر محصولات" className={styles.filterDialog}>
      <Filters key={resetVersion} catalog={catalog} filters={filters} update={update} reset={reset} showHeading={false} />
      <button type="button" className={`button button-primary ${styles.applyFilters}`} onClick={() => setMobileFilters(false)}>نمایش {formatPrice(matching.length)} محصول <Icon name="arrow" size={19} /></button>
    </Dialog>
  </div>;
}

export function ShopPage() {
  const catalog = useCatalog();
  const shop = useShop();
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function viewProduct(product: Product) { router.push(`/product/${encodeURIComponent(product.slug)}`); }
  function addProduct(product: Product) {
    const current = catalog.products.find(item => item.id === product.id);
    const quantity = shop.cart.find(item => item.id === product.id && !item.variantId)?.quantity ?? 0;
    const limit = current ? getProductStockLimit(current) : 0;
    let message: string;
    if (catalog.error || !catalog.loaded) message = "ارتباط با فروشگاه برقرار نیست. دوباره تلاش کن.";
    else if (!catalog.settings?.acceptOrders) message = "پذیرش سفارش جدید فعلاً متوقف است.";
    else if (quantity >= limit) message = limit ? `حداکثر تعداد قابل انتخاب این محصول، ${formatPrice(limit)} عدد است.` : "این محصول فعلاً موجود نیست.";
    else message = shop.addToCart(product.id) ? `${product.name} به سبد اضافه شد` : "افزودن محصول ممکن نشد. دوباره تلاش کن.";
    setToast(previous => ({ message, id: (previous?.id ?? 0) + 1 }));
  }

  return <>
    <a className="skip-link" href="#shop-products">رفتن به محصولات فروشگاه</a>
    <StoreHeader activePage="shop" cartCount={shop.cartCount} favoriteCount={shop.favorites.length} openPanel={setPanel} announcement={catalog.settings?.announcement ?? ""} storeName={catalog.settings?.storeName} />
    <main className={styles.page}>
      <ShopBanner />
      <div id="shop-products" className={styles.catalogAnchor}><Suspense fallback={<CatalogLoading />}><ShopCatalog catalog={catalog} favorites={shop.favorites} onFavorite={shop.toggleFavorite} onAdd={addProduct} onView={viewProduct} /></Suspense></div>
    </main>
    <StoreFooter settings={catalog.settings} openPanel={setPanel} />
    <ShopPanels panel={panel} close={() => setPanel(null)} openPanel={setPanel} chooseCategory={category => { setPanel(null); router.push(category === "all" ? "/shop" : `/shop?category=${encodeURIComponent(category)}`); }} />
    <div className={`toast ${toast ? "is-visible" : ""}`} role="status" aria-live="polite" inert={!toast}><Icon name="check" size={20} /><span>{toast?.message}</span><button onClick={() => { setToast(null); setPanel("cart"); }}>مشاهده سبد</button></div>
  </>;
}
