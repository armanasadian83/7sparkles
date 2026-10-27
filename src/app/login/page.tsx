import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Icon, Logo, Star } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-switcher";
import styles from "@/components/auth/login.module.css";

export const metadata: Metadata = {
  title: "ورود به سون اسپارکلز",
  description: "ورود به سون اسپارکلز با شماره موبایل و کد یک‌بارمصرف.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.formSide} aria-label="ورود به سون اسپارکلز">
        <header className={styles.header}>
          <Link href="/" aria-label="سون اسپارکلز، صفحه اصلی"><Logo /></Link>
          <div className={styles.headerActions}><ThemeToggle /><Link href="/" className={styles.backLink}>بازگشت به فروشگاه<Icon name="arrow" size={18} /></Link></div>
        </header>
        <div className={styles.formWrap}><Suspense fallback={<p role="status">در حال آماده‌سازی ورود…</p>}><LoginForm /></Suspense></div>
        <div className={styles.bottomMark} aria-hidden="true"><span /><Star /><span /></div>
      </section>
      <aside className={styles.artSide} aria-label="درخشش تو، از اینجا شروع می‌شود">
        <Image src="/images/login-celestial.png" alt="" fill priority sizes="(max-width: 760px) 100vw, 48vw" className={styles.artImage} />
        <div className={styles.artQuote}>
          <p>درخشش تو،<br />از اینجا شروع می‌شود</p>
          <div aria-hidden="true"><span /><Star /><span /></div>
        </div>
      </aside>
    </main>
  );
}
