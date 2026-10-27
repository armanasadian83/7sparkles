import type { Metadata } from "next";
import { CheckoutPage } from "@/components/checkout/checkout-page";

export const metadata: Metadata = {
  title: "تکمیل سفارش | سون اسپارکلز",
  description: "اطلاعات گیرنده و روش ارسال سفارش خود را در سون اسپارکلز ثبت کنید.",
  robots: { index: false, follow: false },
};

export default function Page() { return <CheckoutPage />; }
