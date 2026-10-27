"use client";
import { useState } from "react";
import Link from "next/link";
import { AccountMenu } from "./account-menu";
import { ThemeToggle } from "./theme-switcher";
import { Icon, Logo, Star } from "./icons";
export type Panel = "search" | "favorites" | "cart" | "guide" | "faq" | "account" | "orders" | "tracking" | null;
export function StoreHeader({ cartCount, favoriteCount, openPanel, announcement, storeName, activePage = "home" }: { cartCount: number; favoriteCount: number; openPanel: (panel: Panel) => void; announcement: string; storeName?: string; activePage?: "home" | "shop" | "cart" | "checkout" | "myorders" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <>
    <div className="announcement" id="home">{announcement && <><span className="announcement-line" /><Star /><span>{announcement}</span><Star /><span className="announcement-line" /></>}</div>
    <header className="site-header"><div className="nav-inner container">
      <Link href={activePage === "home" ? "#home" : "/"} className="logo-link" aria-label={`${storeName || "سون اسپارکلز"}، صفحه اصلی`}><Logo /></Link>
      <nav className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="ناوبری اصلی">
        <Link className={activePage === "home" ? "active" : undefined} aria-current={activePage === "home" ? "page" : undefined} href={activePage === "home" ? "#home" : "/"} onClick={() => setMenuOpen(false)}>خانه</Link>
        <Link className={activePage === "shop" || activePage === "cart" || activePage === "checkout" ? "active" : undefined} aria-current={activePage === "shop" ? "page" : undefined} href="/shop" onClick={() => setMenuOpen(false)}>فروشگاه</Link>
        <Link href={activePage === "home" ? "#brands" : "/#brands"} onClick={() => setMenuOpen(false)}>برندها</Link>
        <Link href={activePage === "home" ? "#about" : "/#about"} onClick={() => setMenuOpen(false)}>درباره ما</Link>
        <button onClick={() => { openPanel("guide"); setMenuOpen(false); }}>راهنمای خرید</button>
        <button className="mobile-nav-action" onClick={() => { openPanel("search"); setMenuOpen(false); }}>جستجوی محصولات</button>
        <button className="mobile-nav-action" onClick={() => { openPanel("favorites"); setMenuOpen(false); }}>علاقه‌مندی‌ها</button>
      </nav>
      <div className="nav-actions">
        <AccountMenu openPanel={openPanel} onOpen={() => setMenuOpen(false)} />
        <ThemeToggle />
        <Link className="icon-button cart-trigger" href="/cart" aria-current={activePage === "cart" ? "page" : undefined} aria-label={`سبد خرید، ${cartCount.toLocaleString("fa-IR")} محصول`} onClick={() => setMenuOpen(false)}><Icon name="bag" />{cartCount > 0 && <span className="count-badge">{cartCount.toLocaleString("fa-IR")}</span>}</Link>
        <button className="icon-button favorites-trigger" aria-label={`علاقه‌مندی‌ها، ${favoriteCount.toLocaleString("fa-IR")} محصول`} onClick={() => openPanel("favorites")}><Icon name="heart" />{favoriteCount > 0 && <span className="count-dot" />}</button>
        <span className="nav-divider" />
        <button className="icon-button search-trigger" aria-label="جستجوی محصولات" onClick={() => openPanel("search")}><Icon name="search" /></button>
        <button className="icon-button menu-toggle" aria-expanded={menuOpen} aria-label={menuOpen ? "بستن منو" : "باز کردن منو"} onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? "close" : "menu"} /></button>
      </div>
    </div></header>
  </>;
}
