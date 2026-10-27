import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/server/admin-page";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import "./admin.css";

export const metadata: Metadata = {
  title: "پنل مدیریت | سون اسپارکلز",
  description: "پنل مدیریت فروشگاه سون اسپارکلز",
  robots: { index: false, follow: false },
};

async function ProtectedDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const params = await searchParams;
  const section = params.section === "revenue" || params.section === "orders" || params.section === "payment-receipts" || params.section === "shipping" || params.section === "users" || params.section === "settings" || params.section === "products" || params.section === "categories" || params.section === "brands" || params.section === "trash" ? params.section : "overview";
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  return <AdminDashboard key={`${section}-${query}`} initialSection={section} initialQuery={query} />;
}
export default function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <Suspense fallback={<main style={{ padding: 40 }}>در حال بررسی دسترسی مدیریت…</main>}><ProtectedDashboard searchParams={searchParams} /></Suspense>; }
