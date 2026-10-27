"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { logoutCustomer, useCustomerSession } from "@/lib/customer-store";
import { Icon } from "./icons";
import type { Panel } from "./store-header";
import styles from "./account-menu.module.css";

type AccountMenuProps = {
  openPanel: (panel: Panel) => void;
  onOpen?: () => void;
};

type MenuIconName = "orders" | "tracking" | "help" | "logout";

const menuPaths: Record<MenuIconName, ReactNode> = {
  orders: <><path d="M7 4H5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M8 11h8M8 16h5" /></>,
  tracking: <><path d="M2 5h12v12H2zM14 9h4l4 5v3h-8M2 10h7" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.8 8.4a2.4 2.4 0 0 1 4.6 1c0 1.8-2.4 2-2.4 3.8M12 17h.01" /></>,
  logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h11" /></>,
};

function MenuIcon({ name }: { name: MenuIconName }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{menuPaths[name]}</svg>;
}

export function AccountMenu({ openPanel, onOpen }: AccountMenuProps) {
  const router = useRouter();
  const auth = useCustomerSession();
  const session = auth.customer;
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const loginRef = useRef<HTMLAnchorElement>(null);
  const initialItem = useRef(0);
  const menuId = useId();
  const triggerId = useId();
  const sessionId = session ? `${session.id}:${session.signedInAt}:${auth.version}` : null;
  const isOpen = !auth.loading && sessionId !== null && openSession === sessionId;

  useLayoutEffect(() => {
    if (!isOpen) return;

    const positionMenu = () => {
      const menu = menuRef.current;
      if (!menu) return;
      menu.style.setProperty("--account-menu-shift", "0px");
      const rect = menu.getBoundingClientRect();
      const shift = rect.left < 12 ? 12 - rect.left : rect.right > window.innerWidth - 12 ? window.innerWidth - 12 - rect.right : 0;
      menu.style.setProperty("--account-menu-shift", `${shift}px`);
      menu.style.maxHeight = `${Math.max(120, window.innerHeight - rect.top - 12)}px`;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpenSession(null);
    };

    positionMenu();
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[initialItem.current < 0 ? items.length - 1 : initialItem.current]?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [isOpen]);

  function openMenu(item = 0) {
    initialItem.current = item;
    onOpen?.();
    setOpenSession(sessionId);
  }

  function closeMenu(returnFocus = false) {
    setOpenSession(null);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  }

  function triggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!isOpen) {
      openMenu(event.key === "ArrowUp" ? -1 : 0);
      return;
    }
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[event.key === "ArrowUp" ? items.length - 1 : 0]?.focus();
  }

  function menuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === "Tab") {
      // Allow the browser to move focus out of the menu before unmounting it.
      window.setTimeout(() => setOpenSession(null), 0);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if (!items?.length) return;
    const current = Array.from(items).findIndex((item) => item === document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  }

  function choosePanel(panel: Panel) {
    closeMenu(true);
    if (panel === "cart" || panel === "orders" || panel === "tracking") {
      router.push(panel === "cart" ? "/cart" : "/myorders");
      return;
    }
    openPanel(panel);
  }

  async function logout() {
    if (loggingOut) return;
    closeMenu();
    setLoggingOut(true);
    setLogoutError("");
    try { await logoutCustomer(); requestAnimationFrame(() => loginRef.current?.focus({ preventScroll: true })); }
    catch (error) { setLogoutError(error instanceof Error ? error.message : "خروج انجام نشد. دوباره تلاش کنید."); }
    finally { setLoggingOut(false); }
  }

  if (!auth.loaded || auth.loading) return <button type="button" className={styles.trigger} aria-label="در حال بررسی حساب کاربری" aria-busy="true" disabled><Icon name="user" size={19} /></button>;
  if (!session) {
    return <div className={styles.root}><Link ref={loginRef} className="nav-login" href="/login">ورود <Icon name="user" size={18} /></Link>{logoutError ? <span className={styles.sessionError} role="alert">{logoutError}</span> : null}</div>;
  }

  return <div
    className={styles.root}
    ref={rootRef}
    dir="rtl"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
    }}
    onKeyDown={(event) => {
      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
      }
    }}
  >
    <button
      ref={triggerRef}
      id={triggerId}
      className={`${styles.trigger}${isOpen ? ` ${styles.triggerOpen}` : ""}`}
      type="button"
      aria-label="منوی حساب کاربری"
      aria-haspopup="menu"
      aria-expanded={isOpen}
      aria-controls={isOpen ? menuId : undefined}
      onClick={() => isOpen ? closeMenu() : openMenu()}
      onKeyDown={triggerKeyDown}
    >
      <span className={styles.avatar}><Icon name="user" size={21} /><span className={styles.onlineDot} /></span>
      <svg className={styles.chevron} width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {isOpen ? <div className={styles.dropdown} ref={menuRef}>
      <div className={styles.welcome}>
        <span className={styles.welcomeAvatar}><Icon name="user" size={21} /></span>
        <div><strong>خوش آمدید</strong><span dir="ltr">{session.phone.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)])}</span></div>
        <span className={styles.status}>حساب شما</span>
      </div>
      <div id={menuId} role="menu" aria-labelledby={triggerId} onKeyDown={menuKeyDown} className={styles.items}>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => choosePanel("account")}><Icon name="user" size={19} /><span>حساب من</span><span className={styles.rowArrow} aria-hidden="true">‹</span></button>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => choosePanel("orders")}><MenuIcon name="orders" /><span>سفارش‌های من</span></button>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => choosePanel("tracking")}><MenuIcon name="tracking" /><span>پیگیری سفارش</span></button>
        <span className={styles.separator} role="separator" />
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => choosePanel("favorites")}><Icon name="heart" size={19} /><span>علاقه‌مندی‌ها</span></button>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => choosePanel("cart")}><Icon name="bag" size={19} /><span>سبد خرید</span></button>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => choosePanel("faq")}><MenuIcon name="help" /><span>سوال‌های متداول</span></button>
        <span className={styles.separator} role="separator" />
        <button type="button" role="menuitem" tabIndex={-1} className={styles.logout} disabled={loggingOut} onClick={() => void logout()}><MenuIcon name="logout" /><span>خروج از حساب</span></button>
      </div>
    </div> : null}
  </div>;
}
