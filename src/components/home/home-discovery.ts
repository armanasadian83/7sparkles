import type { Product } from "@/lib/products";
import { DEFAULT_SHOP_FILTERS, filterShopProducts } from "@/components/shop/shop-filtering";

export const HOME_CONCERN_QUERIES = {
  hydration: ["آبرسان", "رطوبت", "hydrating"],
  gentle: ["حساس", "ترمیم", "sensitive"],
  glow: ["روشن", "لک", "brightening"],
  hair: ["اسکالپ", "مراقبت مو", "hair", "scalp"],
} as const;

export const HOME_INGREDIENT_QUERIES = {
  hyaluronic: ["هیالورونیک", "hyaluronic"],
  niacinamide: ["نیاسینامید", "niacinamide"],
  ceramide: ["سرامید", "ceramide"],
} as const;

export type CatalogSelection = {
  query: string;
  href: string;
  products: Product[];
  count: number;
};

/** Keep homepage counts and destination products identical to the shop's search. */
export function findCatalogSelection(products: Product[], queries: readonly string[]): CatalogSelection {
  let query = queries[0]?.trim() ?? "";
  let matches = filterShopProducts(products, { ...DEFAULT_SHOP_FILTERS, query });

  for (const candidate of queries.slice(1)) {
    if (matches.length === products.length) break;
    const nextQuery = candidate.trim();
    const nextMatches = filterShopProducts(products, { ...DEFAULT_SHOP_FILTERS, query: nextQuery });
    if (nextMatches.length > matches.length) {
      query = nextQuery;
      matches = nextMatches;
    }
  }

  return {
    query,
    href: query ? `/shop?q=${encodeURIComponent(query)}` : "/shop",
    products: matches,
    count: matches.length,
  };
}
