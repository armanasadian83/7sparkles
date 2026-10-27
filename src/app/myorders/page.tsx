import type { Metadata } from "next";
import { MyOrdersPage } from "@/components/myorders/myorders-page";

export const metadata: Metadata = {
  title: "سفارشات من | سون اسپارکلز",
  description: "سفارش‌های ثبت‌شده و جزئیات خریدهای خود را در سون اسپارکلز مشاهده کنید.",
  robots: { index: false, follow: false },
};

export default function Page() { return <MyOrdersPage />; }
