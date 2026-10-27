import Link from "next/link";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { EmptyState } from "@/components/admin/admin-ui";

export default function ProductNotFound() {
  return <div className="admin-shell" dir="rtl"><AdminSidebar section="products" /><main className="admin-workspace admin-product-workspace"><section className="admin-panel"><EmptyState title="محصول پیدا نشد" description="ممکن است نشانی محصول تغییر کرده باشد. از فهرست محصولات دوباره انتخاب کنید." /><div style={{ padding: 24, textAlign: "center" }}><Link className="admin-button" href="/admin/products">بازگشت به محصولات</Link></div></section></main></div>;
}
