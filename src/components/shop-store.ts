"use client";

import { useSyncExternalStore } from "react";
import { getCatalogSnapshot, refreshCatalog, subscribeCatalog } from "@/lib/catalog-store";
import type { CartSelection } from "@/lib/cart";
import { getProductPrice, getProductStockLimit, isProductAvailable } from "@/lib/products";
import { getShippingMethods, type ShippingMethodId } from "@/lib/shipping";

export type CartItem = CartSelection;
type ShopSnapshot = { cart: CartItem[]; favorites: string[]; cartCount: number; shippingMethod: ShippingMethodId | null };

export function cartItemKey(id: string, variantId?: string): string {
  return variantId ? `${id}::${variantId}` : id;
}

const STORAGE_KEY = "seven-sparkles-shop-v1";
const EMPTY: ShopSnapshot = { cart: [], favorites: [], cartCount: 0, shippingMethod: null };
const listeners = new Set<() => void>();
let snapshot = EMPTY;
let initialized = false;
let storedValue: string | null | undefined;
let unsubscribeCatalog: (() => void) | null = null;

function isValidId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 160;
}
function makeSnapshot(cart: CartItem[], favorites: string[], shippingMethod: ShippingMethodId | null): ShopSnapshot {
  return { cart, favorites, cartCount: cart.reduce((total, item) => total + item.quantity, 0), shippingMethod };
}
function parseSnapshot(value: string | null): ShopSnapshot {
  if (!value) return EMPTY;
  try {
    const data: unknown = JSON.parse(value);
    if (!data || typeof data !== "object") return EMPTY;
    const source = data as Record<string, unknown>;
    const cart = new Map<string, CartItem>();
    if (Array.isArray(source.cart)) {
      for (const item of source.cart) {
        if (item && typeof item === "object" && isValidId(item.id)
          && (item.variantId === undefined || isValidId(item.variantId))
          && typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity > 0) {
          const entry: CartItem = { id: item.id, quantity: Math.max(1, Math.min(99, Math.floor(item.quantity))) };
          if (item.variantId) entry.variantId = item.variantId;
          cart.set(cartItemKey(item.id, item.variantId), entry);
        }
      }
    }
    const favorites = Array.isArray(source.favorites) ? [...new Set(source.favorites.filter(isValidId))] : [];
    const shippingMethod = isValidId(source.shippingMethod) ? source.shippingMethod : null;
    return makeSnapshot([...cart.values()], favorites, shippingMethod);
  } catch { return EMPTY; }
}
function readStorage() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value !== storedValue) { storedValue = value; snapshot = parseSnapshot(value); }
  } catch { /* The basket remains usable in memory when storage is blocked. */ }
}
function getSnapshot() {
  if (!initialized && typeof window !== "undefined") { initialized = true; readStorage(); }
  return snapshot;
}
function emitChange() { listeners.forEach(listener => listener()); }
function save(cart: CartItem[], favorites: string[], shippingMethod = getSnapshot().shippingMethod) {
  snapshot = makeSnapshot(cart, favorites, shippingMethod);
  const value = JSON.stringify({ cart, favorites, shippingMethod });
  try { window.localStorage.setItem(STORAGE_KEY, value); storedValue = value; } catch { /* Keep this visit's basket. */ }
  emitChange();
}
function reconcileCatalog() {
  const catalog = getCatalogSnapshot();
  if (!catalog.loaded || catalog.loading || catalog.error) return;
  const byId = new Map(catalog.products.map(product => [product.id, product]));
  const current = getSnapshot();
  const cart = current.cart.flatMap(item => {
    const product = byId.get(item.id);
    if (!product) return [];
    const variant = product.hasVariants ? product.variants.find(variant => variant.id === item.variantId) : undefined;
    if ((product.hasVariants && !variant) || (!product.hasVariants && item.variantId)
      || !isProductAvailable(product, variant) || getProductPrice(product, variant) === null) return [];
    const quantity = Math.min(item.quantity, getProductStockLimit(product, variant));
    return quantity > 0 ? [{ ...item, quantity }] : [];
  });
  const favorites = current.favorites.filter(id => byId.has(id));
  // Keep the customer's delivery preference. Enabled fallbacks are derived
  // from the current catalog, so a stale tab cannot overwrite a newer choice.
  if (JSON.stringify(cart) !== JSON.stringify(current.cart) || JSON.stringify(favorites) !== JSON.stringify(current.favorites)) save(cart, favorites);
}
function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  readStorage();
  emitChange();
  void refreshCatalog();
}
function subscribe(listener: () => void) {
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first) {
    readStorage();
    window.addEventListener("storage", onStorage);
    unsubscribeCatalog = subscribeCatalog(reconcileCatalog);
    queueMicrotask(reconcileCatalog);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("storage", onStorage);
      unsubscribeCatalog?.();
      unsubscribeCatalog = null;
    }
  };
}
function setQuantity(id: string, quantity: number, variantId?: string): boolean {
  if (!isValidId(id) || (variantId !== undefined && !isValidId(variantId)) || !Number.isFinite(quantity)) return false;
  const current = getSnapshot();
  const key = cartItemKey(id, variantId);
  const existing = current.cart.find(item => cartItemKey(item.id, item.variantId) === key)?.quantity ?? 0;
  const requested = Math.max(0, Math.floor(quantity));
  const catalog = getCatalogSnapshot();
  const product = catalog.products.find(item => item.id === id);
  const variant = product?.hasVariants ? product.variants.find(item => item.id === variantId) : undefined;
  if (requested > 0 && (!catalog.loaded || !product || (product.hasVariants && !variant)
    || (!product.hasVariants && variantId) || getProductPrice(product, variant) === null || !isProductAvailable(product, variant))) return false;
  if (requested > existing && (catalog.error || !catalog.settings?.acceptOrders)) return false;
  const amount = requested === 0 ? 0 : Math.min(requested, product ? getProductStockLimit(product, variant) : 0);
  if (requested > existing && amount <= existing) return false;
  const cart = current.cart.filter(item => cartItemKey(item.id, item.variantId) !== key);
  if (amount > 0) {
    const previousIndex = current.cart.findIndex(item => cartItemKey(item.id, item.variantId) === key);
    cart.splice(previousIndex < 0 ? cart.length : previousIndex, 0, { id, ...(variantId ? { variantId } : {}), quantity: amount });
  }
  save(cart, current.favorites);
  return amount === requested;
}
function addToCart(id: string, variantId?: string, amount = 1): boolean {
  if (!Number.isInteger(amount) || amount < 1) return false;
  const catalog = getCatalogSnapshot();
  const product = catalog.products.find(item => item.id === id);
  const variant = product?.hasVariants ? product.variants.find(item => item.id === variantId) : undefined;
  if (!catalog.loaded || catalog.loading || catalog.error || !catalog.settings?.acceptOrders || !product
    || (product.hasVariants && !variant) || (!product.hasVariants && variantId)
    || getProductPrice(product, variant) === null || !isProductAvailable(product, variant)) return false;
  const key = cartItemKey(id, variantId);
  const quantity = getSnapshot().cart.find(item => cartItemKey(item.id, item.variantId) === key)?.quantity ?? 0;
  if (quantity + amount > getProductStockLimit(product, variant)) return false;
  return setQuantity(id, quantity + amount, variantId);
}
function toggleFavorite(id: string) {
  if (!getCatalogSnapshot().products.some(product => product.id === id)) return;
  const current = getSnapshot();
  save(current.cart, current.favorites.includes(id) ? current.favorites.filter(favorite => favorite !== id) : [...current.favorites, id]);
}
function moveToFavorites(id: string, variantId?: string): boolean {
  if (!isValidId(id) || (variantId !== undefined && !isValidId(variantId))) return false;
  const catalog = getCatalogSnapshot();
  if (!catalog.loaded || !catalog.products.some(product => product.id === id)) return false;
  const current = getSnapshot();
  const key = cartItemKey(id, variantId);
  if (!current.cart.some(item => cartItemKey(item.id, item.variantId) === key)) return false;
  save(
    current.cart.filter(item => cartItemKey(item.id, item.variantId) !== key),
    current.favorites.includes(id) ? current.favorites : [...current.favorites, id],
  );
  return true;
}
function clearCart() { save([], getSnapshot().favorites); }

function removeSubmittedItems(items: readonly CartItem[]) {
  readStorage();
  const submitted = new Map<string, number>();
  for (const item of items) {
    if (!isValidId(item.id) || (item.variantId !== undefined && !isValidId(item.variantId))
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) continue;
    const key = cartItemKey(item.id, item.variantId);
    submitted.set(key, (submitted.get(key) ?? 0) + item.quantity);
  }
  const current = getSnapshot();
  const cart = current.cart.flatMap(item => {
    const quantity = item.quantity - (submitted.get(cartItemKey(item.id, item.variantId)) ?? 0);
    return quantity > 0 ? [{ ...item, quantity }] : [];
  });
  save(cart, current.favorites);
}

function setShippingMethod(id: ShippingMethodId): boolean {
  const catalog = getCatalogSnapshot();
  if (!catalog.loaded || catalog.loading || catalog.error || !getShippingMethods(catalog.settings).some(method => method.id === id)) return false;
  const current = getSnapshot();
  if (current.shippingMethod !== id) save(current.cart, current.favorites, id);
  return true;
}

export function useShop() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  return { ...state, addToCart, setQuantity, toggleFavorite, moveToFavorites, clearCart, removeSubmittedItems, setShippingMethod };
}
