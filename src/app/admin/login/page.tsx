import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AdminAccessForm } from '@/components/auth/admin-access-form';
import { getCurrentAdmin, hasAdmin } from '@/server/admin-auth';

export const metadata: Metadata = { title: 'ورود مدیر | سون اسپارکلز', robots: { index: false, follow: false } };
async function Access() {
  await connection();
  if (!hasAdmin()) redirect('/admin/setup');
  if (await getCurrentAdmin()) redirect('/admin');
  return <AdminAccessForm mode="login" />;
}
export default function AdminLoginPage() { return <Suspense fallback={<main style={{ padding: 40 }}>در حال بررسی حساب مدیریت…</main>}><Access /></Suspense>; }
