export type ProductAvailability = "in_stock" | "out_of_stock" | "preorder";
export type ProductImage = { id: string; url: string; alt: string; caption: string };
export type ProductAttribute = { name: string; value: string };
export type ProductVariantOption = { id: string; name: string; values: string[] };
export type ProductVariant = { id: string; values: string[]; sku: string; price: number | null; stock: number; availability: ProductAvailability };
export type ProductReview = { id: string; author: string; body: string; rating: number; createdAt: string };
export type ProductReviewSummary = { count: number; average: number; distribution: number[] };

export type Product = {
  id: string;
  slug: string;
  name: string;
  englishName: string;
  brand: string;
  category: string;
  categoryName?: string;
  image: string;
  price: number | null;
  stock: number;
  size: string;
  description: string;
  shortDescription: string;
  shortDescriptionHtml: string;
  descriptionHtml: string;
  usageInstructions: string;
  suitableFor: string;
  shippingReturns: string;
  salePrice: number | null;
  availability: ProductAvailability;
  trackStock: boolean;
  sku: string;
  images: ProductImage[];
  attributes: ProductAttribute[];
  tags: string[];
  hasVariants: boolean;
  variantOptions: ProductVariantOption[];
  variants: ProductVariant[];
};

const priceFormatter = new Intl.NumberFormat("fa-IR");

export function formatPrice(value: number): string {
  return priceFormatter.format(value);
}

export function getProductPrice(product: Product, variant?: ProductVariant): number | null {
  if (product.hasVariants && !variant) return null;
  return variant ? variant.price : product.salePrice ?? product.price;
}

export function isProductAvailable(product: Product, variant?: ProductVariant): boolean {
  if (product.availability === "out_of_stock") return false;
  if (product.hasVariants && !variant) return false;
  const availability = variant?.availability ?? product.availability;
  return availability !== "out_of_stock" && (availability === "preorder" || !product.trackStock || (variant?.stock ?? product.stock) > 0);
}

export function getProductStockLimit(product: Product, variant?: ProductVariant): number {
  if (!isProductAvailable(product, variant)) return 0;
  if (product.hasVariants && !variant) return 0;
  return (variant?.availability ?? product.availability) === "preorder" || !product.trackStock ? 99 : Math.min(99, variant?.stock ?? product.stock);
}
