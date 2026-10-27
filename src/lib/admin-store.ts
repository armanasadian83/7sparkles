"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { emptyAdminSnapshot, type AdminSnapshot, type AdminProduct, type AdminSettings, type ShippingSettings, type ProductStatus, type OrderStatus } from "./admin-types";
import type { TrashKind } from "./admin-trash";
export * from "./admin-types";

type StoreState = AdminSnapshot & { loading: boolean; loaded: boolean; error: string };
const initialState: StoreState = { ...emptyAdminSnapshot, loading: true, loaded: false, error: "" };
let state = initialState;
const listeners = new Set<() => void>();
let pendingRefresh: Promise<void> | null = null;
let version = 0;

function publish(next: StoreState) { state = next; listeners.forEach(listener => listener()); }
export async function adminRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin" }); }
  catch { throw new Error("ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید."); }
  const result = await response.json().catch(() => null);
  if (response.status === 401) {
    clearAdminStore();
    window.dispatchEvent(new Event("seven-sparkles-admin-expired"));
    throw new Error("نشست مدیریت پایان یافته است. دوباره وارد شوید.");
  }
  if (!response.ok) throw new Error(result?.error || "ذخیره تغییرات انجام نشد. دوباره تلاش کنید.");
  return result as T;
}
function refresh() {
  if (pendingRefresh) return pendingRefresh;
  const requestVersion = ++version;
  publish({ ...state, loading: !state.loaded, error: "" });
  pendingRefresh = adminRequest<{ snapshot: AdminSnapshot }>("/api/admin")
    .then(({ snapshot }) => { if (requestVersion === version) publish({ ...snapshot, loading: false, loaded: true, error: "" }); })
    .catch((error: unknown) => { if (requestVersion === version) publish({ ...state, loading: false, error: error instanceof Error ? error.message : "دریافت اطلاعات انجام نشد." }); })
    .finally(() => { pendingRefresh = null; });
  return pendingRefresh;
}
async function mutate(url: string, method: string, body: unknown) {
  const { snapshot } = await adminRequest<{ snapshot: AdminSnapshot }>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  ++version;
  publish({ ...snapshot, loading: false, loaded: true, error: "" });
  window.dispatchEvent(new Event("seven-sparkles-catalog-changed"));
}
export function clearAdminStore() { ++version; publish({ ...initialState, loading: false }); }
function saveProduct(product: AdminProduct, options?: { existing?: boolean }) {
  const exists = options?.existing ?? state.products.some(item => item.id === product.id);
  return mutate(exists ? `/api/admin/products/${encodeURIComponent(product.id)}` : "/api/admin/products", exists ? "PUT" : "POST", product);
}
function setProductStatus(id: string, status: ProductStatus) { return mutate(`/api/admin/products/${encodeURIComponent(id)}`, "PATCH", { status }); }
function setOrderStatus(id: string, status: OrderStatus) { return mutate(`/api/admin/orders/${encodeURIComponent(id)}`, "PATCH", { status }); }
function setUserActive(id: string, active: boolean) { return mutate(`/api/admin/users/${encodeURIComponent(id)}`, "PATCH", { active }); }
function saveSettings(settings: AdminSettings) { return mutate("/api/admin/settings", "PUT", settings); }
function saveShipping(settings: ShippingSettings) { return mutate("/api/admin/shipping", "PUT", settings); }
type CatalogTermInput = { id?: string; name: string; description: string };
function saveTerm(collection: "categories" | "brands", term: CatalogTermInput) {
  return mutate(`/api/admin/${collection}${term.id ? `/${encodeURIComponent(term.id)}` : ""}`, term.id ? "PUT" : "POST", term);
}
function saveCategory(term: CatalogTermInput) { return saveTerm("categories", term); }
function deleteCategory(id: string) { return mutate(`/api/admin/categories/${encodeURIComponent(id)}`, "DELETE", {}); }
function saveBrand(term: CatalogTermInput) { return saveTerm("brands", term); }
function deleteBrand(id: string) { return mutate(`/api/admin/brands/${encodeURIComponent(id)}`, "DELETE", {}); }
function restoreTrashItem(kind: TrashKind, id: string) { return mutate(`/api/admin/trash/${kind}/${encodeURIComponent(id)}`, "POST", {}); }
function permanentlyDeleteTrashItem(kind: TrashKind, id: string) { return mutate(`/api/admin/trash/${kind}/${encodeURIComponent(id)}`, "DELETE", {}); }
function subscribe(listener: () => void) {
  if (!listeners.size) { void refresh(); window.addEventListener("focus", refresh); }
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener("focus", refresh); };
}
export function useAdminStore() {
  const router = useRouter();
  useEffect(() => {
    const expire = () => { router.replace("/admin/login"); router.refresh(); };
    window.addEventListener("seven-sparkles-admin-expired", expire);
    return () => window.removeEventListener("seven-sparkles-admin-expired", expire);
  }, [router]);
  const snapshot = useSyncExternalStore(subscribe, () => state, () => initialState);
  return { ...snapshot, refresh, saveProduct, setProductStatus, setOrderStatus, setUserActive, saveSettings, saveShipping, saveCategory, deleteCategory, saveBrand, deleteBrand, restoreTrashItem, permanentlyDeleteTrashItem };
}
