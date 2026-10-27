import type { Metadata } from "next";
import "../admin.css";

export const metadata: Metadata = {
  title: "مدیریت محصولات | سون اسپارکلز",
  robots: { index: false, follow: false },
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) { return children; }
