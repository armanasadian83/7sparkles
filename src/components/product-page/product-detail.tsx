"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { formatPrice, getProductPrice, getProductStockLimit, isProductAvailable, type Product, type ProductReview, type ProductReviewSummary } from "@/lib/products";
import { useCatalog } from "@/lib/catalog-store";
import { Icon } from "@/components/icons";
import { useShop } from "@/components/shop-store";
import styles from "./product-detail.module.css";

type DetailTab = "description" | "attributes" | "reviews";
const ratingFormatter = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const reviewDateFormatter = new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" });

function RatingStars({ rating, empty = false }: { rating: number; empty?: boolean }) {
  return <span className={styles.stars} dir="ltr" role="img" aria-label={empty ? "بدون امتیاز" : `امتیاز ${ratingFormatter.format(rating)} از ۵`}>
    <span aria-hidden="true">★★★★★</span>
    <span className={styles.filledStars} style={{ width: `${Math.min(100, Math.max(0, rating * 20))}%` }} aria-hidden="true">★★★★★</span>
  </span>;
}

function ServiceIcon({ kind }: { kind: "shield" | "truck" | "return" }) {
  return <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "shield" ? <><path d="m12 3 8 3v6c0 4-5 7-8 9-3-2-8-5-8-9V6l8-3Z" /><path d="m8.5 11.5 2.2 2.2 4.8-5" /></> : kind === "truck" ? <><path d="M2 5h12v12H2zM14 9h4l4 5v3h-8" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /><path d="M18 9v5h4" /></> : <><path d="M4 9a9 9 0 1 1-.2 6M4 3v6h6" /></>}
  </svg>;
}

function ProductAccordion({ title, children, initialOpen = false }: { title: string; children: ReactNode; initialOpen?: boolean }) {
  return <details className={styles.accordion} open={initialOpen}>
    <summary>{title}<span className={styles.accordionMark} aria-hidden="true" /></summary>
    <div className={styles.accordionContent}>{children}</div>
  </details>;
}

function ReviewContent({ reviews, summary }: { reviews: ProductReview[]; summary: ProductReviewSummary }) {
  return <div className={styles.reviews}>
    <aside className={styles.reviewSummary} aria-label="خلاصه امتیازهای محصول">
      <strong className={styles.average}>{summary.count ? ratingFormatter.format(summary.average) : "—"}</strong>
      <RatingStars rating={summary.average} empty={!summary.count} />
      <p>{summary.count ? `از ${formatPrice(summary.count)} دیدگاه` : "هنوز امتیازی ثبت نشده است"}</p>
      <div className={styles.ratingDistribution}>{[5, 4, 3, 2, 1].map(rating => {
        const count = summary.distribution[rating - 1] ?? 0;
        return <div className={styles.ratingBar} key={rating} aria-label={`${formatPrice(rating)} ستاره: ${formatPrice(count)} دیدگاه`}>
          <span>{formatPrice(rating)}</span><span className={styles.barTrack}><span style={{ width: `${summary.count ? count / summary.count * 100 : 0}%` }} /></span>
        </div>;
      })}</div>
    </aside>
    <div className={styles.reviewList}>{reviews.length ? reviews.map(review => {
      const date = new Date(review.createdAt);
      return <article className={styles.review} key={review.id}>
        <div className={styles.reviewHeading}><h3>{review.author}</h3><RatingStars rating={review.rating} /></div>
        <p>{review.body}</p>
        {Number.isFinite(date.getTime()) && <time dateTime={review.createdAt}>{reviewDateFormatter.format(date)}</time>}
      </article>;
    }) : <div className={styles.noReviews}><Icon name="sparkle" size={30} /><h3>هنوز دیدگاهی ثبت نشده است</h3><p>دیدگاه‌های این محصول پس از ثبت و تأیید، اینجا نمایش داده می‌شوند.</p></div>}</div>
  </div>;
}

export function ProductDetail({ product: initialProduct, reviews, reviewSummary }: { product: Product; reviews: ProductReview[]; reviewSummary: ProductReviewSummary }) {
  const router = useRouter();
  const catalog = useCatalog();
  const liveProduct = catalog.products.find(item => item.id === initialProduct.id);
  const product = liveProduct ?? initialProduct;
  const [imageId, setImageId] = useState(product.images[0]?.id ?? "");
  const [selectedValues, setSelectedValues] = useState<string[]>(() => {
    const initial = product.variants.find(variant => isProductAvailable(product, variant)) ?? product.variants[0];
    return initial?.values ?? [];
  });
  const [quantity, setQuantity] = useState(1);
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [navigatingToCart, startCartNavigation] = useTransition();
  const [activeTab, setActiveTab] = useState<DetailTab>("description");
  const mainImageRef = useRef<HTMLImageElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabId = useId();
  const purchaseStatusId = useId();
  const shop = useShop();
  const favorite = shop.favorites.includes(product.id);
  const gallery = product.images.length ? product.images : product.image ? [{ id: "main", url: product.image, alt: product.name, caption: "" }] : [];
  const image = gallery.find(item => item.id === imageId) ?? gallery[0];
  const variant = product.hasVariants ? product.variants.find(item => item.values.length === selectedValues.length && item.values.every((value, index) => value === selectedValues[index])) : undefined;
  const price = getProductPrice(product, variant);
  const available = isProductAvailable(product, variant);
  const stock = variant?.stock ?? product.stock;
  const stockLimit = getProductStockLimit(product, variant);
  const availability = variant?.availability ?? product.availability;
  const inCart = shop.cart.find(item => item.id === product.id && item.variantId === variant?.id)?.quantity ?? 0;
  const remainingStock = Math.max(0, stockLimit - inCart);
  const displayedQuantity = Math.min(quantity, Math.max(1, remainingStock));
  const purchaseStatus = catalog.loading || !catalog.loaded && !catalog.error ? "در حال بررسی موجودی محصول…"
    : catalog.error ? "بررسی موجودی ممکن نشد. دوباره تلاش کنید."
    : !catalog.settings?.acceptOrders ? "ثبت سفارش در حال حاضر غیرفعال است."
    : !liveProduct ? "این محصول دیگر برای خرید در دسترس نیست."
    : !available ? "این محصول در حال حاضر ناموجود است."
    : price === null ? product.hasVariants && !variant ? "تنوع محصول را انتخاب کنید." : "برای این محصول هنوز قیمتی ثبت نشده است."
    : remainingStock === 0 ? "تمام موجودی قابل خرید این محصول در سبد خرید شماست."
    : "";
  const canAddToCart = !purchaseStatus && !navigatingToCart;
  const sale = !product.hasVariants && product.salePrice !== null && product.price !== null && product.price > product.salePrice;
  const discount = sale ? Math.round((1 - product.salePrice! / product.price!) * 100) : 0;
  const sku = variant?.sku || product.sku;
  const summary = product.shortDescription || (!product.descriptionHtml ? product.description : "");
  const descriptionHtml = product.descriptionHtml || (!product.description ? product.shortDescriptionHtml : "");
  const attributes = [
    { name: "برند", value: product.brand },
    { name: "دسته‌بندی", value: product.categoryName || "دسته‌بندی نشده" },
    ...product.attributes.filter(attribute => !["برند", "دسته‌بندی", "کد محصول"].includes(attribute.name)),
    ...(sku ? [{ name: "کد محصول", value: sku }] : []),
  ];
  const tabs: { id: DetailTab; label: string }[] = [
    { id: "description", label: "توضیحات" },
    { id: "attributes", label: "ویژگی‌ها" },
    { id: "reviews", label: `دیدگاه‌ها (${formatPrice(reviewSummary.count)})` },
  ];

  function moveZoom(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || !mainImageRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100));
    const y = Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100));
    mainImageRef.current.style.transformOrigin = `${x}% ${y}%`;
  }

  function chooseOption(index: number, value: string) {
    setPurchaseMessage("");
    const next = [...selectedValues];
    next[index] = value;
    const exact = product.variants.find(item => item.values.every((itemValue, itemIndex) => itemValue === next[itemIndex]));
    if (exact && isProductAvailable(product, exact)) setSelectedValues(next);
    else {
      const alternatives = product.variants.filter(item => item.values[index] === value && isProductAvailable(product, item));
      const closest = alternatives.toSorted((a, b) => {
        const aMatches = a.values.reduce((total, itemValue, itemIndex) => total + Number(itemValue === next[itemIndex]), 0);
        const bMatches = b.values.reduce((total, itemValue, itemIndex) => total + Number(itemValue === next[itemIndex]), 0);
        return bMatches - aMatches;
      })[0];
      setSelectedValues(closest?.values ?? next);
    }
    setQuantity(1);
  }

  function addToCart() {
    if (!canAddToCart) return;
    if (!shop.addToCart(product.id, variant?.id, displayedQuantity)) {
      setPurchaseMessage("افزودن محصول ممکن نشد. موجودی و اطلاعات محصول را دوباره بررسی کنید.");
      void catalog.refresh();
      return;
    }
    startCartNavigation(() => router.push("/cart"));
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    if (event.key === "ArrowLeft") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowRight") nextIndex = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return <div className={styles.page} dir="rtl">
    <nav className={styles.breadcrumb} aria-label="مسیر صفحه"><Link href="/">خانه</Link><span aria-hidden="true">‹</span><Link href="/shop">فروشگاه</Link><span aria-hidden="true">‹</span><Link href={product.category ? `/shop?category=${encodeURIComponent(product.category)}` : "/shop"}>{product.categoryName || "دسته‌بندی نشده"}</Link><span aria-hidden="true">‹</span><span aria-current="page">{product.name}</span></nav>

    <section className={styles.hero} aria-labelledby="product-title">
      <div className={styles.gallery}>
        {gallery.length > 0 && <div className={styles.thumbnails} aria-label="تصاویر محصول">{gallery.map((item, index) => <button type="button" key={item.id} className={styles.thumbnail} aria-label={`نمایش تصویر ${formatPrice(index + 1)}${item.alt ? `: ${item.alt}` : ""}`} aria-pressed={item.id === image?.id} onClick={() => setImageId(item.id)}><Image src={item.url} alt={item.alt || `${product.name}، تصویر ${formatPrice(index + 1)}`} width={120} height={120} sizes="(max-width: 760px) 72px, 94px" /></button>)}</div>}
        <figure className={styles.imageFigure}>
          <div className={styles.mainImageFrame} onPointerMove={moveZoom}>
            {image ? <Image key={image.id} ref={mainImageRef} className={styles.mainImage} src={image.url} alt={image.alt || product.name} width={1000} height={1000} sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1100px) 47vw, 610px" preload /> : <div className={styles.noImage}><Icon name="bag" size={54} /><span>تصویر محصول ثبت نشده است</span></div>}
            {discount > 0 && <span className={styles.galleryDiscount}>{formatPrice(discount)}٪ تخفیف ویژه</span>}
          </div>
          {image?.caption && <figcaption>{image.caption}</figcaption>}
        </figure>
      </div>

      <div className={styles.copy}>
        <span className={styles.brand} dir="ltr">{product.brand}</span>
        <h1 id="product-title">{product.name}</h1>
        <div className={styles.rating}><RatingStars rating={reviewSummary.average} empty={!reviewSummary.count} />{reviewSummary.count ? <><span>{ratingFormatter.format(reviewSummary.average)} از ۵</span><button type="button" onClick={() => { setActiveTab("reviews"); document.getElementById(`${tabId}-tabs`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>({formatPrice(reviewSummary.count)} دیدگاه)</button></> : <span>هنوز دیدگاهی ثبت نشده</span>}</div>

        <div className={styles.pricing} aria-live="polite">{price === null ? <strong className={styles.inquiryPrice}>{product.hasVariants && !variant ? "تنوع محصول را انتخاب کنید" : "استعلام قیمت"}</strong> : <><strong className={styles.currentPrice}>{formatPrice(price)}</strong><span className={styles.currency}>تومان</span>{sale && <><del aria-label="قیمت قبل از تخفیف">{formatPrice(product.price!)}</del><span className={styles.discount}>{formatPrice(discount)}٪</span></>}</>}</div>
        <p className={`${styles.stock} ${available ? "" : styles.unavailable}`} role="status"><span aria-hidden="true" />{!available ? "این محصول در حال حاضر ناموجود است" : availability === "preorder" ? "پیش‌فروش؛ امکان ثبت پیش‌سفارش" : product.trackStock ? stock <= 10 ? `تنها ${formatPrice(stock)} عدد در انبار باقی مانده` : `${formatPrice(stock)} عدد در انبار موجود است` : "موجود در انبار"}</p>
        {product.shortDescriptionHtml ? <div className={`${styles.shortDescription} ${styles.richSummary}`} dangerouslySetInnerHTML={{ __html: product.shortDescriptionHtml }} /> : summary ? <p className={styles.shortDescription}>{summary}</p> : null}

        {product.hasVariants ? <div className={styles.variantOptions}>{product.variantOptions.map((option, index) => <fieldset className={styles.option} key={option.id}><legend>{option.name}{selectedValues[index] ? `: ${selectedValues[index]}` : ""}</legend><div className={styles.optionValues}>{option.values.map(value => {
          const optionAvailable = product.variants.some(item => item.values[index] === value && isProductAvailable(product, item));
          return <button type="button" key={value} className={styles.optionValue} disabled={!optionAvailable} aria-pressed={selectedValues[index] === value} onClick={() => chooseOption(index, value)} title={optionAvailable ? undefined : "ناموجود"}>{value}</button>;
        })}</div></fieldset>)}</div> : product.size ? <p className={styles.simpleSize}>حجم: {product.size}</p> : null}

        <div className={styles.purchaseActions}>
          <div className={styles.quantity} aria-label="تعداد محصول"><button type="button" aria-label="کاهش تعداد" disabled={displayedQuantity <= 1 || !canAddToCart} onClick={() => { setPurchaseMessage(""); setQuantity(Math.max(1, displayedQuantity - 1)); }}><Icon name="minus" size={18} /></button><output aria-label="تعداد انتخاب‌شده">{formatPrice(displayedQuantity)}</output><button type="button" aria-label="افزایش تعداد" disabled={displayedQuantity >= remainingStock || !canAddToCart} onClick={() => { setPurchaseMessage(""); setQuantity(Math.min(remainingStock, displayedQuantity + 1)); }}><Icon name="plus" size={18} /></button></div>
          <button className={styles.addToCart} type="button" disabled={!canAddToCart} aria-busy={navigatingToCart} aria-describedby={purchaseStatusId} onClick={addToCart}>افزودن به سبد خرید</button>
          <button className={styles.favorite} type="button" aria-label={favorite ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"} aria-pressed={favorite} onClick={() => shop.toggleFavorite(product.id)}><Icon name="heart" size={24} /></button>
        </div>
        <div className={styles.purchaseStatus} id={purchaseStatusId} role="status">
          {purchaseStatus || purchaseMessage}
          {catalog.error && !catalog.loading ? <button type="button" onClick={() => { setPurchaseMessage(""); void catalog.refresh(); }}>تلاش دوباره</button> : null}
          {available && price !== null && remainingStock === 0 ? <Link href="/cart">مشاهده سبد خرید</Link> : null}
        </div>

        <div className={styles.services} aria-label="خدمات فروشگاه"><div><ServiceIcon kind="shield" /><span>ضمانت اصالت کالا</span></div><div><ServiceIcon kind="truck" /><span>ارسال سریع</span></div><div><ServiceIcon kind="return" /><span>۷ روز بازگشت</span></div></div>
        <div className={styles.accordions}>
          <ProductAccordion title="روش استفاده" initialOpen><p>{product.usageInstructions || "روش استفاده از این محصول هنوز ثبت نشده است."}</p></ProductAccordion>
          <ProductAccordion title="ارسال و بازگشت"><p>{product.shippingReturns || "اطلاعات ارسال و بازگشت این محصول هنوز ثبت نشده است."}</p></ProductAccordion>
          <ProductAccordion title="مناسب برای"><p>{product.suitableFor || "اطلاعات تکمیلی درباره مصرف‌کنندگان مناسب این محصول هنوز ثبت نشده است."}</p></ProductAccordion>
        </div>
      </div>
    </section>

    <section className={styles.details} aria-label="اطلاعات کامل محصول">
      <div className={styles.tabs} id={`${tabId}-tabs`} role="tablist" aria-label="جزئیات محصول">{tabs.map((tab, index) => <button type="button" key={tab.id} id={`${tabId}-${tab.id}-tab`} ref={element => { tabRefs.current[index] = element; }} role="tab" aria-selected={activeTab === tab.id} aria-controls={`${tabId}-${tab.id}-panel`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={event => navigateTabs(event, index)}>{tab.label}</button>)}</div>
      {tabs.map(tab => <div key={tab.id} className={styles.tabPanel} role="tabpanel" id={`${tabId}-${tab.id}-panel`} aria-labelledby={`${tabId}-${tab.id}-tab`} hidden={activeTab !== tab.id} tabIndex={0}>
        {activeTab === tab.id && (tab.id === "description" ? <div className={styles.description}><h2>درباره این محصول</h2>{descriptionHtml ? <div className={styles.richText} dangerouslySetInnerHTML={{ __html: descriptionHtml }} /> : <p className={styles.plainDescription}>{product.description || product.shortDescription || "توضیحات کامل این محصول هنوز ثبت نشده است."}</p>}</div> : tab.id === "attributes" ? <dl className={styles.attributes}>{attributes.map((attribute, index) => <div key={`${attribute.name}-${index}`}><dt>{attribute.name}</dt><dd><bdi>{attribute.value}</bdi></dd></div>)}</dl> : <ReviewContent reviews={reviews} summary={reviewSummary} />)}
      </div>)}
    </section>
  </div>;
}
