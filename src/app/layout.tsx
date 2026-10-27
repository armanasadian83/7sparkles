import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeRuntime } from "@/components/theme-switcher";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import "./tailwind.css";
import "./globals.css";
import "./theme.css";

const vazirmatn = localFont({ src: "./fonts/Vazirmatn-Variable.woff2", weight: "100 900", display: "swap", variable: "--font-vazirmatn" });

export const metadata: Metadata = {
  title: "سون اسپارکلز | جهانی از مراقبت، درخششی از تو",
  description: "دنیای مراقبت از پوست و مو در سون اسپارکلز. محصولات منتخب دکتر ژنو، نووسلیکس و ژنوسیس برای انتخابی آگاهانه و روتینی به سبک خودت.",
  applicationName: "Seven Sparkles",
  openGraph: { title: "Seven Sparkles | سون اسپارکلز", description: "جهانی از مراقبت، درخششی از تو", locale: "fa_IR", type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable} data-theme="light" suppressHydrationWarning>
      <head><script id="seven-sparkles-theme" dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} /></head>
      <body><ThemeRuntime />{children}</body>
    </html>
  );
}
