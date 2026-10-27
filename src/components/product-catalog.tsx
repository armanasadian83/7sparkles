"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon, Star } from "./icons";
import { formatPrice, type Product } from "@/lib/products";
import type { CatalogTerm } from "@/lib/catalog-terms";
import { getListingPrice, hasAvailableSelection } from "./product-presentation";
import styles from "./product-card.module.css";

export type Category = "all" | Product["category"];

export function ProductCard({ product, favorite, onFavorite, onAdd, onView, showStock, acceptOrders, layout = "grid", showDiscount = false }: {
  product: Product; favorite: boolean; onFavorite: () => void; onAdd: () => void; onView: () => void;
  showStock: boolean; acceptOrders: boolean; layout?: "grid" | "list"; showDiscount?: boolean;
}) {
  const available = hasAvailableSelection(product);
  const unavailable = !available || !acceptOrders;
  const price = getListingPrice(product);
  const sale = !product.hasVariants && product.salePrice !== null && product.price !== null;
  const discount = showDiscount && sale && product.salePrice! < product.price!
    ? Math.round((1 - product.salePrice! / product.price!) * 100)
    : null;
  const stockLabel = !available ? "ناموجود" : product.hasVariants ? "دارای تنوع" : product.availability === "preorder" ? "پیش‌فروش" : product.trackStock ? `${formatPrice(product.stock)} عدد موجود` : "موجود";
  const actionLabel = price === null ? "مشاهده محصول" : product.hasVariants ? "انتخاب تنوع" : unavailable ? "ناموجود" : "افزودن به سبد خرید";
  return <article className={`product-card ${styles.card}${layout === "list" ? ` ${styles.list}` : ""}`} data-layout={layout}>
    <div className={`product-visual ${styles.visual}`}>
      <Link className={`product-image-button ${styles.imageLink}`} href={`/product/${encodeURIComponent(product.slug)}`} aria-label={`مشاهده ${product.name}`}><Image src={product.image} alt={product.images[0]?.alt || product.name} width={500} height={500} sizes={layout === "list" ? "(max-width: 340px) calc(100vw - 68px), (max-width: 600px) 108px, (max-width: 900px) 180px, 220px" : "(max-width: 600px) 45vw, (max-width: 1000px) 46vw, 23vw"} /></Link>
      <button type="button" className={`product-favorite ${styles.favorite} ${favorite ? "is-saved" : ""}`} onClick={onFavorite} aria-label={`${favorite ? "حذف از" : "افزودن به"} علاقه‌مندی‌ها: ${product.name}`} aria-pressed={favorite}><Icon name="heart" size={20} /></button>
      {discount !== null && <span className={styles.discount}>{discount > 0 ? `${formatPrice(discount)}٪ تخفیف` : "کمتر از ۱٪ تخفیف"}</span>}
      <span className={`product-hover-label ${styles.hoverLabel}`} aria-hidden="true">نگاهی نزدیک‌تر <Icon name="arrow" size={16} /></span>
    </div>
    <div className={`product-information ${styles.information}`}><span className={`product-brand ${styles.brand}`} dir="auto">{product.brand}</span>
      <h3 className={`product-title ${styles.title}`}><Link className={`product-name ${styles.name}`} href={`/product/${encodeURIComponent(product.slug)}`}>{product.name}</Link></h3>
      {product.shortDescriptionHtml ? <div className={`product-size ${styles.summary} ${styles.richSummary}`} dangerouslySetInnerHTML={{ __html: product.shortDescriptionHtml }} /> : <p className={`product-size ${styles.summary}`}>{product.shortDescription || product.size || "مراقبت تخصصی"}</p>}
      {(showStock || !available || product.availability === "preorder") && <p className={`product-stock ${styles.stock} ${!available ? `is-unavailable ${styles.unavailable}` : ""}`}>{stockLabel}</p>}
      <div className={`product-buy ${styles.buy}`}><span className={`product-price ${styles.priceBlock}`}>{sale && <del className={styles.originalPrice} aria-label="قیمت پیش از تخفیف">{formatPrice(product.price!)} تومان</del>}{price === null ? <span className={`inquiry-price ${styles.inquiry}`}>استعلام قیمت</span> : <span className={styles.currentPrice}>{product.hasVariants && <small>از</small>}<strong>{formatPrice(price)}</strong><span>تومان</span></span>}</span>
        <button type="button" className={`add-bag ${styles.action}`} disabled={price !== null && unavailable} onClick={price === null || product.hasVariants ? onView : onAdd} aria-label={`${actionLabel}: ${product.name}`}><span className={styles.actionLabel}>{actionLabel}</span></button>
      </div>
    </div>
  </article>;
}

export function ProductCatalog({ products, categories, loading, error, onRetry, showStock, acceptOrders, category, setCategory, showAll, setShowAll, favorites, onFavorite, onAdd, onView }: {
  products: Product[]; categories: CatalogTerm[]; loading: boolean; error: string | null; onRetry: () => void; showStock: boolean; acceptOrders: boolean;
  category: Category; setCategory: (category: Category) => void; showAll: boolean; setShowAll: (value: boolean) => void;
  favorites: string[]; onFavorite: (id: string) => void; onAdd: (product: Product) => void; onView: (product: Product) => void;
}) {
  const selectedCategory = categories.some(item => item.id === category) ? category : "all";
  const filters = [{ id: "all", name: "همه محصولات" }, ...categories];
  const matchingProducts = products.filter(product => selectedCategory === "all" || product.category === selectedCategory);
  const visibleProducts = showAll ? matchingProducts : matchingProducts.slice(0, 4);
  return <section id="products" className="catalog-section container" aria-labelledby="products-title" aria-busy={loading}>
    <div className="section-heading"><div><div className="heading-with-star"><h2 id="products-title">ستاره‌های روتین تو</h2><Star /></div><p>محصولات منتخب برای مراقبتی که شایسته‌اش هستی</p></div>
      {products.length > 4 && <button className="text-link all-products" onClick={() => { setShowAll(!showAll); if (!showAll) setCategory("all"); }}>{showAll ? "نمایش منتخب‌ها" : "مشاهده همه محصولات"}<Icon name="arrow" size={22} /></button>}
    </div>
    <div className="category-filters" aria-label="دسته‌بندی محصولات">{filters.map(item => <button key={item.id} className={selectedCategory === item.id ? "filter-button is-active" : "filter-button"} onClick={() => setCategory(item.id)} aria-pressed={selectedCategory === item.id}>{item.name}</button>)}</div>
    {loading && !products.length ? <div className="catalog-state" role="status"><Star /><p>در حال دریافت محصولات…</p></div> : error && !products.length ? <div className="catalog-state" role="alert"><Icon name="globe" size={32} /><p>{error}</p><button className="text-link" onClick={onRetry}>تلاش دوباره <Icon name="arrow" size={18} /></button></div> : visibleProducts.length ? <>
      {error && <div className="catalog-notice" role="alert">{error}<button onClick={onRetry}>تلاش دوباره</button></div>}
      {!acceptOrders && <p className="catalog-notice">پذیرش سفارش جدید فعلاً متوقف است. می‌توانی محصولات را بررسی کنی.</p>}
      <div className="product-grid">{visibleProducts.map(product => <ProductCard key={product.id} product={product} favorite={favorites.includes(product.id)} onFavorite={() => onFavorite(product.id)} onAdd={() => onAdd(product)} onView={() => onView(product)} showStock={showStock} acceptOrders={acceptOrders} />)}</div>
    </> : <div className="catalog-state"><Icon name="bag" size={36} /><h3>{products.length ? "در این دسته محصولی موجود نیست" : "به‌زودی، انتخاب‌های تازه"}</h3><p>{products.length ? "دسته‌بندی دیگری را ببین." : "هنوز محصولی برای نمایش ثبت نشده است."}</p>{category !== "all" && <button className="text-link" onClick={() => setCategory("all")}>همه محصولات <Icon name="arrow" size={18} /></button>}</div>}
    <p className="catalog-note"><Star /> هر روتین، یک شروع تازه است.</p>
  </section>;
}
