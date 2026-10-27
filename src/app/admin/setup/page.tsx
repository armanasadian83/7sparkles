import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AdminAccessForm } from '@/components/auth/admin-access-form';
import { hasAdmin, setupEnabled } from '@/server/admin-auth';

export const metadata: Metadata = { title: 'راه‌اندازی مدیریت | سون اسپارکلز', robots: { index: false, follow: false } };
async function Setup() {
  await connection();
  if (hasAdmin()) redirect('/admin/login');
  return <AdminAccessForm mode="setup" enabled={setupEnabled()} />;
}
export default function AdminSetupPage() { return <Suspense fallback={<main style={{ padding: 40 }}>در حال آماده‌سازی مدیریت…</main>}><Setup /></Suspense>; }
