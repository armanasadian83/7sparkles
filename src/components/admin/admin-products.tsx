"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { formatPrice, getProductPrice } from "@/lib/products";
import { normalizeAdminSearch, productStatusLabels, useAdminStore, type AdminProduct, type ProductStatus } from "@/lib/admin-store";
import { AdminIcon, EmptyState, StatusBadge } from "./admin-ui";

type ProductsProps = {
  products: AdminProduct[];
  onStatusChange: (id: string, status: ProductStatus) => Promise<void>;
  notify: (message: string) => void;
  initialSearch?: string;
};

export function AdminProducts({ products, onStatusChange, notify, initialSearch = "" }: ProductsProps) {
  const { categories } = useAdminStore();
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function changeStatus(product: AdminProduct) {
    if (pendingStatus) return;
    setPendingStatus(product.id);
    setError("");
    try {
      await onStatusChange(product.id, "archived");
      notify("محصول به سطل زباله منتقل شد. از آنجا می‌توانید آن را بازیابی کنید.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تغییر وضعیت انجام نشد."); }
    finally { setPendingStatus(null); }
  }
  const query = normalizeAdminSearch(search);
  const selectedCategory = categories.some(item => item.id === category) ? category : "all";
  const categoryNames = new Map(categories.map(item => [item.id, item.name]));
  const filtered = products.filter(product => (selectedCategory === "all" || product.category === selectedCategory) && (status === "all" || product.status === status)
    && normalizeAdminSearch(`${product.name} ${product.slug} ${product.englishName} ${product.brand} ${product.categoryName ?? categoryNames.get(product.category) ?? ""} ${product.sku} ${product.tags.join(" ")}`).includes(query));
  return <section className="admin-panel">
    <div className="admin-panel-heading"><div><h2>مدیریت محصولات <span className="admin-count">{formatPrice(products.length)}</span></h2><p>قیمت، موجودی و نمایش محصولات را تنظیم کنید.</p></div><Link className="admin-button" href="/admin/products/new"><Icon name="plus" size={19} />افزودن محصول</Link></div>
    <div className="admin-toolbar">
      <label className="admin-search-field"><Icon name="search" size={19} /><input aria-label="جستجوی محصول" placeholder="جستجو در نام، برند یا کد محصول..." value={search} onChange={event => setSearch(event.target.value)} /></label>
      <select aria-label="فیلتر دسته‌بندی محصول" value={selectedCategory} onChange={event => setCategory(event.target.value)}><option value="all">همه دسته‌بندی‌ها</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label="فیلتر وضعیت محصول" value={status} onChange={event => setStatus(event.target.value)}><option value="all">همه وضعیت‌ها</option>{Object.entries(productStatusLabels).filter(([value]) => value !== "archived").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    {error ? <p role="alert" className="admin-error admin-inline-error">{error}</p> : null}
    {filtered.length ? <div className="admin-table-scroll"><table className="admin-table admin-products-table">
      <thead><tr><th scope="col">محصول</th><th scope="col">دسته‌بندی</th><th scope="col">قیمت <small>(تومان)</small></th><th scope="col">موجودی</th><th scope="col">وضعیت</th><th scope="col">عملیات</th></tr></thead>
      <tbody>{filtered.map(product => {
        const price = getProductPrice(product);
        const editUrl = `/admin/products/${encodeURIComponent(product.id)}/edit`;
        return <tr key={product.id}>
          <td><Link className="admin-product-cell" href={editUrl}><span className="admin-product-thumb">{product.image ? <Image src={product.image} alt="" width={54} height={64} /> : <AdminIcon name="box" />}</span><span><strong>{product.name}</strong><small dir="ltr">{product.brand}{product.sku ? ` · ${product.sku}` : ""}</small></span></Link></td>
          <td className="admin-muted">{categoryNames.get(product.category) ?? product.categoryName ?? "بدون دسته‌بندی"}</td>
          <td className="admin-number">{product.hasVariants ? <span className="admin-muted">قیمت بر اساس تنوع</span> : price === null ? <span className="admin-muted">استعلام قیمت</span> : <>{product.salePrice !== null ? <del className="admin-muted">{formatPrice(product.price!)} </del> : null}{formatPrice(price)}</>}</td>
          <td>{product.hasVariants ? "بر اساس تنوع" : product.availability === "preorder" ? "پیش‌فروش" : product.availability === "out_of_stock" ? <span className="admin-low-stock">ناموجود</span> : !product.trackStock ? "موجود" : <span className={product.stock <= 5 ? "admin-low-stock" : ""}>{formatPrice(product.stock)} عدد</span>}</td>
          <td><StatusBadge status={product.status} kind="product" /></td>
          <td><div className="admin-row-actions">{product.status === "active" && product.slug ? <Link className="admin-icon-button" aria-label={`مشاهده ${product.name} در فروشگاه`} title="مشاهده در فروشگاه" href={`/product/${encodeURIComponent(product.slug)}`} target="_blank" rel="noopener noreferrer"><AdminIcon name="external" /></Link> : null}<Link className="admin-icon-button" aria-label={`ویرایش ${product.name}`} href={editUrl}><AdminIcon name="edit" /></Link><button disabled={pendingStatus !== null} className="admin-icon-button" aria-label={`بایگانی ${product.name}`} title="انتقال به سطل زباله" onClick={() => void changeStatus(product)} type="button"><AdminIcon name="archive" /></button></div></td>
        </tr>;
      })}</tbody>
    </table></div> : products.length ? <EmptyState /> : <EmptyState title="هنوز محصولی ثبت نشده است" description="با دکمه افزودن محصول، اولین محصول فروشگاه را ثبت کنید." />}
    <div className="admin-panel-foot">{formatPrice(filtered.length)} محصول از {formatPrice(products.length)} محصول</div>
  </section>;
}
