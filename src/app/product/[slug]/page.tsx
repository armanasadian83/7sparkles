import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { connection } from "next/server";
import { notFound, permanentRedirect } from "next/navigation";
import { readPublicProductBySlug } from "@/server/store";
import { ProductPageLoading, ProductPageShell } from "@/components/product-page/product-page-shell";

type Props = { params: Promise<{ slug: string }> };
const loadProduct = cache((slug: string) => readPublicProductBySlug(slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const data = loadProduct(slug);
  if (!data) return { title: "محصول پیدا نشد | سون اسپارکلز", robots: { index: false, follow: false } };
  const { product, settings } = data;
  const title = `${product.name} | ${settings.storeName}`;
  const description = (product.shortDescription || product.description).slice(0, 180);
  const url = `/product/${encodeURIComponent(product.slug)}`;
  return {
    metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, locale: "fa_IR", type: "website", images: product.image ? [{ url: product.image, alt: product.images[0]?.alt || product.name }] : [] },
  };
}

async function LiveProduct({ params }: Props) {
  await connection();
  const { slug } = await params;
  const data = loadProduct(slug);
  if (!data) notFound();
  if (slug !== data.product.slug) permanentRedirect(`/product/${encodeURIComponent(data.product.slug)}`);
  return <ProductPageShell {...data} />;
}

export default function ProductPage({ params }: Props) {
  return <Suspense fallback={<ProductPageLoading />}><LiveProduct params={params} /></Suspense>;
}
