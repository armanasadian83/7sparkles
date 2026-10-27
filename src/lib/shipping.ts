import type { AdminSettings } from "./admin-types";

export type ShippingMethodId = string;
export type ShippingMethod = { id: ShippingMethodId; name: string; fee: number; postpaid: boolean };

/** Only methods explicitly saved by the shop are available for delivery. */
export function getShippingMethods(settings: AdminSettings | null): ShippingMethod[] {
  if (!Array.isArray(settings?.shippingMethods)) return [];
  return settings.shippingMethods.filter(method => method.enabled)
    .map(method => ({ id: method.id, name: method.name, fee: method.free || method.postpaid ? 0 : method.fee, postpaid: method.postpaid ?? false }));
}

export function resolveShippingMethod(settings: AdminSettings | null, preferred: ShippingMethodId | null): ShippingMethod | null {
  const methods = getShippingMethods(settings);
  return methods.find(method => method.id === preferred) ?? methods[0] ?? null;
}
