"use client";

import { useSyncExternalStore } from "react";
import type { Product } from "./products";
import type { AdminSettings } from "./admin-types";
import type { CatalogTerm } from "./catalog-terms";

type CatalogSnapshot = {
  products: Product[];
  categories: CatalogTerm[];
  brands: CatalogTerm[];
  settings: AdminSettings | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
};

const INITIAL: CatalogSnapshot = { products: [], categories: [], brands: [], settings: null, loading: true, loaded: false, error: null };
const listeners = new Set<() => void>();
let snapshot = INITIAL;
let request: Promise<void> | null = null;

function publish(next: CatalogSnapshot) {
  snapshot = next;
  listeners.forEach(listener => listener());
}

export function getCatalogSnapshot() { return snapshot; }

export function refreshCatalog(): Promise<void> {
  if (request) return request;
  publish({ ...snapshot, loading: true, error: null });
  request = (async () => {
    try {
      const response = await fetch("/api/catalog", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("دریافت محصولات ممکن نشد. دوباره تلاش کن.");
      const data: { products: Product[]; categories: CatalogTerm[]; brands: CatalogTerm[]; settings: AdminSettings } = await response.json();
      if (!Array.isArray(data.products) || !Array.isArray(data.categories) || !Array.isArray(data.brands) || !data.settings) throw new Error("پاسخ فروشگاه معتبر نیست.");
      publish({ products: data.products, categories: data.categories, brands: data.brands, settings: data.settings, loading: false, loaded: true, error: null });
    } catch (error) {
      publish({ ...snapshot, loading: false, error: error instanceof Error ? error.message : "ارتباط با فروشگاه برقرار نشد." });
    } finally {
      request = null;
    }
  })();
  return request;
}

function onFocus() {
  if (document.visibilityState === "visible") void refreshCatalog();
}

export function subscribeCatalog(listener: () => void) {
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first) {
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("seven-sparkles-catalog-changed", onFocus);
    queueMicrotask(() => { void refreshCatalog(); });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("seven-sparkles-catalog-changed", onFocus);
    }
  };
}

export function useCatalog() {
  const state = useSyncExternalStore(subscribeCatalog, getCatalogSnapshot, () => INITIAL);
  return { ...state, refresh: refreshCatalog };
}
