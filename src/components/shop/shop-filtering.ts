import { getProductPrice, isProductAvailable, type Product, type ProductVariant } from "@/lib/products";

export type ShopSort = "recommended" | "price-asc" | "price-desc" | "name";
export type ShopView = "grid" | "list";

export type ShopFilters = {
  query: string;
  categories: string[];
  brands: string[];
  minPrice: number | null;
  maxPrice: number | null;
  availableOnly: boolean;
  discountedOnly: boolean;
};

export const DEFAULT_SHOP_FILTERS: ShopFilters = {
  query: "",
  categories: [],
  brands: [],
  minPrice: null,
  maxPrice: null,
  availableOnly: false,
  discountedOnly: false,
};

type SearchParams = Pick<URLSearchParams, "get" | "getAll">;

const nameCollator = new Intl.Collator("fa", { numeric: true, sensitivity: "base" });

function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)));
}

function normalizeSearch(value: string): string {
  return normalizeDigits(value.normalize("NFKC"))
    .toLocaleLowerCase("fa")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ـ\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/[\s\u200c\u200d]+/g, " ")
    .trim();
}

function validPrice(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function readPriceBound(value: string | null): number | null {
  if (value === null) return null;
  const normalized = normalizeDigits(value).trim().replace(/[,٬،\s]/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  return validPrice(Number(normalized));
}

function normalizedBounds(minValue: number | null, maxValue: number | null) {
  const min = validPrice(minValue);
  const max = validPrice(maxValue);
  return min !== null && max !== null && min > max ? { min: max, max: min } : { min, max };
}

function readSelected(params: SearchParams, name: string): string[] {
  return [...new Set(params.getAll(name).map(value => value.trim()).filter(Boolean))];
}

export function readShopFilters(params: SearchParams): ShopFilters {
  const { min, max } = normalizedBounds(readPriceBound(params.get("min")), readPriceBound(params.get("max")));
  return {
    query: params.get("q")?.trim() ?? "",
    categories: readSelected(params, "category"),
    brands: readSelected(params, "brand"),
    minPrice: min,
    maxPrice: max,
    availableOnly: params.get("available") === "1",
    discountedOnly: params.get("sale") === "1",
  };
}

export function readShopSort(params: SearchParams): ShopSort {
  const value = params.get("sort");
  return value === "price-asc" || value === "price-desc" || value === "name" ? value : "recommended";
}

export function readShopView(params: SearchParams): ShopView {
  return params.get("view") === "list" ? "list" : "grid";
}

function selectionPrice(product: Product, variant?: ProductVariant): number | null {
  return validPrice(getProductPrice(product, variant));
}

function listingPrice(product: Product): number | null {
  if (!product.hasVariants) return selectionPrice(product);
  let minimum: number | null = null;
  for (const variant of product.variants) {
    const price = selectionPrice(product, variant);
    if (price !== null && (minimum === null || price < minimum)) minimum = price;
  }
  return minimum;
}

export function getShopPriceBounds(products: Product[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  const include = (price: number | null) => {
    if (price !== null) {
      min = Math.min(min, price);
      max = Math.max(max, price);
    }
  };
  for (const product of products) {
    if (product.hasVariants) {
      for (const variant of product.variants) include(selectionPrice(product, variant));
    } else {
      include(selectionPrice(product));
    }
  }
  return min === Infinity ? null : { min, max };
}

export function filterShopProducts(products: Product[], filters: ShopFilters, sort: ShopSort = "recommended"): Product[] {
  const categoryIds = new Set(filters.categories);
  const brandNames = new Set(filters.brands);
  const queryWords = normalizeSearch(filters.query).split(" ").filter(Boolean);
  const { min, max } = normalizedBounds(filters.minPrice, filters.maxPrice);
  const hasPriceRange = min !== null || max !== null;

  const matchesSelection = (product: Product, variant?: ProductVariant): boolean => {
    if (filters.availableOnly && !isProductAvailable(product, variant)) return false;
    if (!hasPriceRange) return true;
    const price = selectionPrice(product, variant);
    return price !== null && (min === null || price >= min) && (max === null || price <= max);
  };

  const matches = products.filter(product => {
    if (categoryIds.size && !categoryIds.has(product.category)) return false;
    if (brandNames.size && !brandNames.has(product.brand)) return false;
    if (filters.discountedOnly && (product.hasVariants || product.price === null || product.salePrice === null
      || validPrice(product.price) === null || validPrice(product.salePrice) === null || product.salePrice >= product.price)) return false;

    if (queryWords.length) {
      const searchable = normalizeSearch([
        product.name, product.englishName, product.brand, product.categoryName ?? "", product.sku,
        product.shortDescription, ...product.tags,
      ].join(" ")).replace(/ /g, "");
      if (!queryWords.every(word => searchable.includes(word))) return false;
    }

    if (!hasPriceRange && !filters.availableOnly) return true;
    return product.hasVariants
      ? product.variants.some(variant => matchesSelection(product, variant))
      : matchesSelection(product);
  });

  if (sort === "name") return matches.sort((a, b) => nameCollator.compare(a.name, b.name));
  if (sort === "price-asc" || sort === "price-desc") {
    const prices = new Map(matches.map(product => [product.id, listingPrice(product)]));
    return matches.sort((a, b) => {
      const left = prices.get(a.id) ?? null;
      const right = prices.get(b.id) ?? null;
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      return sort === "price-asc" ? left - right : right - left;
    });
  }
  return matches;
}
