"use client";

import { useId } from "react";
import { formatPrice } from "@/lib/products";
import type { ShippingMethod, ShippingMethodId } from "@/lib/shipping";
import styles from "./shipping-method-picker.module.css";

export function ShippingMethodPicker({ methods, selected, onChange, disabled = false }: {
  methods: ShippingMethod[];
  selected: ShippingMethodId | null;
  onChange: (method: ShippingMethodId) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return <fieldset className={styles.fieldset} disabled={disabled}>
    <legend>روش ارسال</legend>
    {methods.length ? methods.map(method => <label key={method.id} className={styles.method} data-selected={selected === method.id}>
      <input type="radio" name={name} value={method.id} checked={selected === method.id} onChange={() => onChange(method.id)} />
      <span className={styles.label}><strong>{method.name}</strong>{method.postpaid ? <small>پرداخت هزینه ارسال هنگام تحویل</small> : null}</span>
      <span className={styles.price}>{method.postpaid ? "پس‌کرایه" : method.fee ? <><bdi>{formatPrice(method.fee)}</bdi><small>تومان</small></> : "رایگان"}</span>
    </label>) : <p className={styles.unavailable} role="status">در حال حاضر روش ارسالی فعال نیست. لطفاً با پشتیبانی فروشگاه تماس بگیرید.</p>}
  </fieldset>;
}
