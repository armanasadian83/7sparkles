"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Logo } from '@/components/icons';
import { ThemeToggle } from '@/components/theme-switcher';
import styles from './admin-access.module.css';

export function AdminAccessForm({ mode, enabled = true }: { mode: 'login' | 'setup'; enabled?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    if (mode === 'setup' && password !== form.get('confirm')) { setError('تکرار رمز عبور مطابقت ندارد.'); return; }
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/auth/${mode}`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password, name: form.get('name'), setupKey: form.get('setupKey') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ورود انجام نشد. دوباره تلاش کنید.');
      router.replace('/admin');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ارتباط با سرور برقرار نشد.');
      setPending(false);
    }
  }
  const setup = mode === 'setup';
  return <main className={styles.page}>
    <div className={styles.card}>
      <div className={styles.themeControl}><ThemeToggle /></div>
      <Link className={styles.brand} href="/" aria-label="فروشگاه سون اسپارکلز"><Logo /></Link>
      <h1>{setup ? 'راه‌اندازی حساب مدیریت' : 'ورود به مدیریت فروشگاه'}</h1>
      <p>{setup ? 'اولین حساب مدیر را ایجاد کنید. این مرحله فقط یک بار انجام می‌شود.' : 'برای مدیریت محصولات و فروشگاه، وارد حساب خود شوید.'}</p>
      {setup ? <div className={styles.note}>کلید راه‌اندازی در فایل <bdi>.env.local</bdi> یا متغیر <bdi>ADMIN_SETUP_KEY</bdi> سرور قرار دارد. برای ساخت کلید، دستور <code>npm run setup</code> را اجرا کنید.</div> : null}
      {!enabled ? <div role="alert" className={styles.error}>کلید راه‌اندازی هنوز تنظیم نشده است. پس از اجرای دستور راه‌اندازی، برنامه را دوباره اجرا کنید.</div> : null}
      <form onSubmit={submit}>
        <fieldset disabled={pending || !enabled}>
          {setup ? <label>نام مدیر<input name="name" autoComplete="name" maxLength={120} required /></label> : null}
          <label>ایمیل<input name="email" type="email" dir="ltr" autoComplete="username" maxLength={254} required /></label>
          <label>رمز عبور<input name="password" type="password" dir="ltr" autoComplete={setup ? 'new-password' : 'current-password'} minLength={12} maxLength={128} required />{setup ? <small>حداقل ۱۲ نویسه</small> : null}</label>
          {setup ? <>
            <label>تکرار رمز عبور<input name="confirm" type="password" dir="ltr" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            <label>کلید راه‌اندازی<input name="setupKey" type="password" dir="ltr" autoComplete="off" minLength={32} maxLength={256} required /></label>
          </> : null}
          {error ? <div className={styles.error} role="alert">{error}</div> : null}
          <button type="submit">{pending ? 'در حال بررسی…' : setup ? 'ایجاد حساب و ورود' : 'ورود به پنل'}</button>
        </fieldset>
      </form>
      <Link className={styles.back} href="/">بازگشت به فروشگاه</Link>
    </div>
  </main>;
}
