import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminProductPage } from "@/components/admin/admin-product-page";
import { requireAdminPage } from "@/server/admin-page";
import { readProduct } from "@/server/store";

export const metadata: Metadata = { title: "ویرایش محصول | سون اسپارکلز" };

async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const product = readProduct(id);
  if (!product) notFound();
  return <AdminProductPage key={product.id} product={product} />;
}
export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<main style={{ padding: 40 }}>در حال دریافت اطلاعات محصول…</main>}><EditProduct params={params} /></Suspense>; }
