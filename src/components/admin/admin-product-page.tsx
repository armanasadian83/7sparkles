import type { AdminProduct } from "@/lib/admin-types";
import { AdminSidebar } from "./admin-sidebar";
import { ProductEditor } from "./product-editor";

export function AdminProductPage({ product }: { product: AdminProduct | null }) {
  return <div className="admin-shell" dir="rtl">
    <a className="skip-link" href="#admin-main">رفتن به محتوای محصول</a>
    <AdminSidebar section="products" />
    <main id="admin-main" className="admin-workspace admin-product-workspace"><ProductEditor product={product} /></main>
  </div>;
}
