import type { Metadata } from "next";
import { ShopPage } from "@/components/shop/shop-page";

export const metadata: Metadata = {
  title: "فروشگاه | سون اسپارکلز",
  description: "محصولات مراقبت پوست و مو را در سون اسپارکلز کشف کن؛ جستجو و انتخاب بر اساس برند، دسته‌بندی و قیمت.",
};

export default function Page() {
  return <ShopPage />;
}
