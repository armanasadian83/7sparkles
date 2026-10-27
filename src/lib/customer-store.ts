"use client";

import { useSyncExternalStore } from "react";
import type { CustomerSession } from "./customer-types";
import { DEMO_SESSION_KEY } from "./demo-auth";

export const CUSTOMER_SESSION_EVENT = "seven-sparkles-customer-session";
const SYNC_KEY = "seven-sparkles-customer-auth-changed";
type State = { customer: CustomerSession | null; loaded: boolean; loading: boolean; error: string; version: number };
const INITIAL: State = { customer: null, loaded: false, loading: true, error: "", version: 0 };
let state = INITIAL;
let generation = 0;
let pending: { controller: AbortController; promise: Promise<void> } | null = null;
let channel: BroadcastChannel | null = null;
let lastMessage = "";
let loggingOut = false;
const listeners = new Set<() => void>();

function publish(next: State) { state = next; listeners.forEach(listener => listener()); }
function clearPreview() { try { localStorage.removeItem(DEMO_SESSION_KEY); } catch { /* No browser storage is required for authentication. */ } }
function invalidate() {
  ++generation;
  pending?.controller.abort();
  pending = null;
  publish({ customer: null, loaded: false, loading: true, error: "", version: state.version + 1 });
  window.dispatchEvent(new Event(CUSTOMER_SESSION_EVENT));
}
function announce() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  lastMessage = id;
  // This is only an invalidation signal. Never store a phone, session token or order.
  try { localStorage.setItem(SYNC_KEY, id); } catch { /* BroadcastChannel still works when available. */ }
  channel?.postMessage(id);
  window.dispatchEvent(new Event(CUSTOMER_SESSION_EVENT));
}
function externalChange(id: string) {
  if (id && id === lastMessage) return;
  lastMessage = id;
  invalidate();
  void refreshCustomerSession();
}

export function refreshCustomerSession(): Promise<void> {
  if (loggingOut) return Promise.resolve();
  if (pending) return pending.promise;
  const current = ++generation;
  const controller = new AbortController();
  publish({ ...state, loading: true, error: "" });
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  const promise = (async () => {
    try {
      const response = await fetch("/api/customer/auth/session", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result || typeof result !== "object" || !("customer" in result)) throw new Error(result?.error || "دریافت اطلاعات حساب انجام نشد.");
      const customer = result.customer as CustomerSession | null;
      if (customer && (typeof customer.id !== "string" || typeof customer.phone !== "string" || typeof customer.signedInAt !== "string")) throw new Error("پاسخ حساب معتبر نیست.");
      if (current !== generation) return;
      const changed = state.customer?.id !== customer?.id || state.customer?.signedInAt !== customer?.signedInAt;
      publish({ customer, loaded: true, loading: false, error: "", version: state.version + (changed ? 1 : 0) });
    } catch (error) {
      if (current !== generation) return;
      publish({ customer: null, loaded: true, loading: false, error: error instanceof Error && error.name !== "AbortError" ? error.message : "ارتباط با حساب برقرار نشد. دوباره تلاش کنید.", version: state.version + 1 });
    } finally {
      window.clearTimeout(timeout);
      if (current === generation) pending = null;
    }
  })();
  pending = { controller, promise };
  return promise;
}

export class CustomerRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function customerRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store" });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && state.customer) { invalidate(); void refreshCustomerSession(); }
    throw new CustomerRequestError(response.status, typeof result?.error === "string" ? result.error : "درخواست انجام نشد. دوباره تلاش کنید.");
  }
  return result as T;
}

export function acceptCustomerSession(customer: CustomerSession) {
  ++generation;
  pending?.controller.abort();
  pending = null;
  clearPreview();
  publish({ customer, loaded: true, loading: false, error: "", version: state.version + 1 });
  announce();
}
export async function logoutCustomer() {
  // Hide private details immediately, even while the logout request is pending.
  loggingOut = true;
  invalidate();
  clearPreview();
  try {
    await customerRequest("/api/customer/auth/logout", { method: "POST" });
    publish({ customer: null, loaded: true, loading: false, error: "", version: state.version + 1 });
    announce();
  } catch (error) {
    publish({ customer: null, loaded: true, loading: false, error: "خروج کامل نشد. دوباره تلاش کنید.", version: state.version + 1 });
    throw error;
  } finally { loggingOut = false; }
}

function focus() { if (document.visibilityState === "visible") void refreshCustomerSession(); }
function storage(event: StorageEvent) { if (event.key === SYNC_KEY || event.key === null) externalChange(event.newValue ?? ""); }
function subscribe(listener: () => void) {
  const first = !listeners.size;
  listeners.add(listener);
  if (first) {
    clearPreview();
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("storage", storage);
    try { channel = new BroadcastChannel(CUSTOMER_SESSION_EVENT); channel.onmessage = event => { if (typeof event.data === "string") externalChange(event.data); }; } catch { channel = null; }
    queueMicrotask(() => { void refreshCustomerSession(); });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("storage", storage);
      channel?.close(); channel = null;
    }
  };
}
export function useCustomerSession() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => INITIAL);
  return { ...snapshot, refresh: refreshCustomerSession };
}
