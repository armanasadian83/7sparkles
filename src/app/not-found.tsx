import Link from "next/link";
import { Logo } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-switcher";
import styles from "@/components/not-found.module.css";

export default function NotFound() {
  return <main className={styles.page}>
    <header><Link href="/" aria-label="سون اسپارکلز، صفحه اصلی"><Logo /></Link><ThemeToggle /></header>
    <section><span className={styles.code} dir="ltr">404</span><h1>این صفحه پیدا نشد</h1><p>نشانی صفحه تغییر کرده یا دیگر در دسترس نیست.</p><Link className={styles.back} href="/">بازگشت به فروشگاه</Link></section>
  </main>;
}
