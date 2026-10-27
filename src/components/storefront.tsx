"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { StoreHeader, type Panel } from "./store-header";
import { ProductCatalog, type Category } from "./product-catalog";
import { ShopPanels } from "./shop-panels";
import { Icon, Star } from "./icons";
import { StoreFooter } from "./store-footer";
import { useShop } from "./shop-store";
import { getProductPrice, getProductStockLimit, type Product } from "@/lib/products";
import { useCatalog } from "@/lib/catalog-store";
import { NeedDiscovery, RoutineRitual } from "./home/home-discover";
import { IngredientExplorer, ReadingRoom, HomeQuestions, HomeFinale } from "./home/home-education";
export function Storefront({ hero, story }: { hero: ReactNode; story: ReactNode }) {
  const router = useRouter();
  const shop = useShop();
  const catalog = useCatalog();
  const [panel, setPanel] = useState<Panel>(null);
  const [category, setCategory] = useState<Category>("all");
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 3200); return () => window.clearTimeout(timer); }, [toast]);
  function addProduct(product: Product, variantId?: string) {
    if (product.hasVariants && !variantId) { viewProduct(product); return; }
    const currentProduct = catalog.products.find(item => item.id === product.id);
    const variant = currentProduct?.hasVariants ? currentProduct.variants.find(item => item.id === variantId) : undefined;
    const quantity = shop.cart.find(item => item.id === product.id && item.variantId === variantId)?.quantity ?? 0;
    const limit = currentProduct ? getProductStockLimit(currentProduct, variant) : 0;
    let message: string;
    if (catalog.error || !catalog.loaded) message = "ارتباط با فروشگاه برقرار نیست. محصولات را دوباره دریافت کن.";
    else if (!catalog.settings?.acceptOrders) message = "پذیرش سفارش جدید فعلاً متوقف است.";
    else if (!currentProduct || limit === 0) message = "این محصول یا تنوع انتخابی فعلاً موجود نیست.";
    else if (getProductPrice(currentProduct, variant) === null) message = "قیمت این انتخاب هنوز اعلام نشده است.";
    else if (quantity >= limit) message = `حداکثر تعداد قابل انتخاب این محصول، ${limit.toLocaleString("fa-IR")} عدد است.`;
    else if (shop.addToCart(product.id, variantId)) { message = `${currentProduct.name} به سبد اضافه شد`; closePanels(); }
    else message = "افزودن محصول ممکن نشد. دوباره تلاش کن.";
    setToast(current => ({ message, id: (current?.id ?? 0) + 1 }));
  }
  function closePanels() { setPanel(null); }
  function viewProduct(product: Product) { setPanel(null); router.push(`/product/${encodeURIComponent(product.slug)}`); }
  function chooseCategory(value: Category) { setCategory(value); setShowAll(true); closePanels(); document.getElementById("products")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  return <>
    <a className="skip-link" href="#products">رفتن به محصولات</a>
    <StoreHeader cartCount={shop.cartCount} favoriteCount={shop.favorites.length} openPanel={setPanel} announcement={catalog.settings?.announcement ?? ""} storeName={catalog.settings?.storeName} />
    <main>{hero}
      <section className="brand-strip container" id="brands" aria-label="برندهای منتخب"><span className="brand-intro">از دنیای علم،<br /><strong>برای زیبایی تو</strong></span><span className="brand-name brand-genosys" dir="ltr">GEN<span className="genosys-o">O</span>SYS</span><span className="brand-name brand-drgeno" dir="ltr">Dr.GENO<sup>®</sup></span><span className="brand-name brand-novoselix" dir="ltr"><i>n</i>novoselix</span><Star className="brand-strip-star" /></section>
      <NeedDiscovery products={catalog.products} loaded={catalog.loaded} />
      <ProductCatalog products={catalog.products} categories={catalog.categories} loading={catalog.loading && !catalog.loaded} error={catalog.error} onRetry={() => { void catalog.refresh(); }} showStock={catalog.settings?.showStock ?? false} acceptOrders={catalog.settings?.acceptOrders ?? false} category={category} setCategory={setCategory} showAll={showAll} setShowAll={setShowAll} favorites={shop.favorites} onFavorite={shop.toggleFavorite} onAdd={addProduct} onView={viewProduct} />
      <RoutineRitual products={catalog.products} onGuide={() => setPanel("guide")} />
      <IngredientExplorer products={catalog.products} />
      {story}
      <ReadingRoom onGuide={() => setPanel("guide")} />
      <HomeQuestions supportPhone={catalog.settings?.supportPhone} onContact={() => setPanel("guide")} />
      <HomeFinale onGuide={() => setPanel("guide")} />
    </main>
    <StoreFooter settings={catalog.settings} openPanel={setPanel} />
    <ShopPanels panel={panel} close={closePanels} openPanel={setPanel} chooseCategory={chooseCategory} />
    <div className={`toast ${toast ? "is-visible" : ""}`} role="status" aria-live="polite" inert={!toast}><Icon name="check" size={20} /><span>{toast?.message}</span><button onClick={() => { setToast(null); setPanel("cart"); }}>مشاهده سبد</button></div>
  </>;
}
