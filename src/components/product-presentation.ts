import { getProductPrice, isProductAvailable, type Product, type ProductVariant } from "@/lib/products";

export function getListingPrice(product: Product): number | null {
  if (!product.hasVariants) return getProductPrice(product);
  const prices = product.variants.map(variant => getProductPrice(product, variant)).filter((price): price is number => price !== null);
  return prices.length ? Math.min(...prices) : null;
}

export function hasAvailableSelection(product: Product): boolean {
  return product.hasVariants ? product.variants.some(variant => isProductAvailable(product, variant)) : isProductAvailable(product);
}

export function variantLabel(product: Product, variant: ProductVariant): string {
  return variant.values.map((value, index) => `${product.variantOptions[index]?.name ?? ""}: ${value}`).join(" / ");
}
