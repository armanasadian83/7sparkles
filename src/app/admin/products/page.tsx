import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { requireAdminPage } from "@/server/admin-page";

async function Products({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPage();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  return <AdminDashboard key={query} initialSection="products" initialQuery={query} />;
}

export default function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <Suspense fallback={<main style={{ padding: 40 }}>در حال دریافت محصولات…</main>}><Products searchParams={searchParams} /></Suspense>;
}
