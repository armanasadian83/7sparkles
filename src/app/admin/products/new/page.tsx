import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminProductPage } from "@/components/admin/admin-product-page";
import { requireAdminPage } from "@/server/admin-page";

export const metadata: Metadata = { title: "افزودن محصول | سون اسپارکلز" };

async function NewProduct() {
  await requireAdminPage();
  return <AdminProductPage product={null} />;
}
export default function NewProductPage() { return <Suspense fallback={<main style={{ padding: 40 }}>در حال آماده‌سازی فرم محصول…</main>}><NewProduct /></Suspense>; }
