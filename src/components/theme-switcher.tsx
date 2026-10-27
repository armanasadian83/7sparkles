"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";
import styles from "./theme-switcher.module.css";

const listeners = new Set<() => void>();
let snapshot: ThemePreference = "light";
let stop: (() => void) | undefined;

function isPreference(value: unknown): value is ThemePreference { return value === "light" || value === "dark"; }
function apply(theme: ThemePreference) {
  document.documentElement.dataset.theme = theme;
  if (snapshot !== theme) { snapshot = theme; listeners.forEach(listener => listener()); }
}
function start() {
  let preference: ThemePreference = isPreference(document.documentElement.dataset.theme) ? document.documentElement.dataset.theme : "light";
  try { const saved = localStorage.getItem(THEME_STORAGE_KEY); if (isPreference(saved)) preference = saved; } catch { /* The control still works when storage is unavailable. */ }
  apply(preference);
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    apply(isPreference(event.newValue) ? event.newValue : "light");
  };
  window.addEventListener("storage", storageChanged);
  return () => window.removeEventListener("storage", storageChanged);
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) stop = start();
  return () => { listeners.delete(listener); if (!listeners.size) { stop?.(); stop = undefined; } };
}
function getSnapshot() { return snapshot; }
function getServerSnapshot(): ThemePreference { return "light"; }
function setPreference(preference: ThemePreference) {
  apply(preference);
  try { localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* Keep this tab's choice without persistence. */ }
}

export function ThemeRuntime() {
  // Reapply before paint after Strict Mode remounts, and share one storage
  // listener across all storefront and admin routes.
  useLayoutEffect(() => subscribe(() => {}), []);
  return null;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return <div className={styles.control}>
    <button className={styles.trigger} type="button" aria-label="حالت تیره" aria-pressed={theme === "dark"} title={theme === "dark" ? "تغییر به حالت روشن" : "تغییر به حالت تیره"} data-theme-toggle onClick={() => setPreference(document.documentElement.dataset.theme === "dark" ? "light" : "dark")}>
      <svg className={styles.moonIcon} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 14A8.7 8.7 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" /></svg>
      <svg className={styles.sunIcon} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
    </button>
  </div>;
}
