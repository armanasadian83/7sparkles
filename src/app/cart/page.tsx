import type { Metadata } from "next";
import { CartPage } from "@/components/cart/cart-page";

export const metadata: Metadata = {
  title: "سبد خرید | سون اسپارکلز",
  description: "محصولات انتخابی، تعداد و خلاصه سبد خریدت را در سون اسپارکلز بررسی کن.",
  robots: { index: false, follow: true },
};

export default function Page() { return <CartPage />; }
