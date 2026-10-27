import 'server-only';
import { defaultSettings, type AdminProduct, type AdminSettings, type ShippingSettings, type OrderStatus, type ProductStatus } from '@/lib/admin-types';
import { HttpError } from './http';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { getDataDirectory, getDatabase } from '../../server/database.mjs';
import sanitizeHtml from 'sanitize-html';
import type { ProductAvailability, ProductImage, ProductVariantOption } from '@/lib/products';
import { isValidProductSlug, normalizeProductSlug } from '@/lib/product-slug';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(422, 'اطلاعات واردشده معتبر نیست.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new HttpError(422, `${label} معتبر نیست.`);
  return value.trim();
}
function amount(value: unknown, label: string, max = 1_000_000_000_000) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw new HttpError(422, `${label} معتبر نیست.`);
  return value;
}
export function productStatus(value: unknown): ProductStatus {
  if (value !== 'active' && value !== 'draft' && value !== 'archived') throw new HttpError(422, 'وضعیت محصول معتبر نیست.');
  return value;
}
export function orderStatus(value: unknown): OrderStatus {
  if (value !== 'processing' && value !== 'shipped' && value !== 'delivered' && value !== 'cancelled') throw new HttpError(422, 'وضعیت سفارش معتبر نیست.');
  return value;
}
export function boolean(value: unknown) {
  if (typeof value !== 'boolean') throw new HttpError(422, 'مقدار انتخاب‌شده معتبر نیست.');
  return value;
}
export function identifier(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new HttpError(422, 'شناسه معتبر نیست.');
  return value;
}
function optionalText(value: unknown, label: string, max: number) { return text(value === undefined ? '' : value, label, max); }
export function catalogTermKey(name: string) {
  return name.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c]+/g, ' ').trim().toLocaleLowerCase('en');
}
export function validateCatalogTerm(value: unknown) {
  const data = record(value);
  const name = text(data.name, 'نام', 120, true).normalize('NFC').replace(/\s+/g, ' ');
  if (!catalogTermKey(name) || /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(name)) throw new HttpError(422, 'نام معتبر نیست.');
  return { name, description: optionalText(data.description, 'توضیحات', 2000) };
}
function productCatalogAssignment(value: unknown, table: 'brands' | 'categories') {
  const label = table === 'brands' ? 'برند' : 'دسته‌بندی';
  if (typeof value !== 'string' || !value.trim() || value.length > 120) throw new HttpError(400, `${label} محصول را از گزینه‌های ثبت‌شده انتخاب کنید.`);
  const column = table === 'brands' ? 'name' : 'id';
  if (!getDatabase().prepare(`SELECT id FROM ${table} WHERE ${column} = ? AND deleted_at IS NULL`).get(value)) throw new HttpError(400, `${label} انتخاب‌شده وجود ندارد یا در سطل زباله است. گزینه‌های محصول را به‌روز کنید.`);
  return value;
}
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new HttpError(422, `${label} معتبر نیست.`);
  return value;
}
function availability(value: unknown): ProductAvailability {
  if (value !== 'in_stock' && value !== 'out_of_stock' && value !== 'preorder') throw new HttpError(422, 'وضعیت موجودی معتبر نیست.');
  return value;
}
function imageUrl(value: unknown): string {
  const url = text(value, 'تصویر', 200, true);
  if (!/^\/images\/products\/[a-zA-Z0-9_-]+\.(?:png|webp|jpg|jpeg)$/.test(url) && !/^\/api\/media\/[a-f0-9-]{36}\.webp$/.test(url)) throw new HttpError(422, 'تصویر محصول معتبر نیست.');
  const imagePath = url.startsWith('/api/media/') ? join(getDataDirectory(), 'uploads', basename(url)) : join(process.cwd(), 'public', url.slice(1));
  if (!existsSync(imagePath)) throw new HttpError(422, 'تصویر محصول پیدا نشد. دوباره بارگذاری کنید.');
  return url;
}
function unique(values: string[], label: string) {
  if (new Set(values.map(value => value.toLocaleLowerCase())).size !== values.length) throw new HttpError(422, `${label} تکراری است.`);
}
export function sanitizeProductHtml(value: unknown, label = 'توضیحات کامل', max = 60_000) {
  const html = optionalText(value, label, max);
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'a', 'pre', 'code', 'hr'],
    allowedAttributes: { a: ['href', 'target', 'rel'], p: ['style'], h2: ['style'], h3: ['style'], blockquote: ['style'], ol: ['start'] },
    allowedStyles: { '*': { 'text-align': [/^(?:left|right|center|justify)$/] } },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
  });
}
function plainDescription(html: string) {
  const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ', '&#39;': "'" };
  return sanitizeHtml(html.replace(/<\/(?:p|h2|h3|li|blockquote|pre)>|<br\s*\/?\s*>/gi, '\n'), { allowedTags: [], allowedAttributes: {} })
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (entity: string) => entities[entity] || entity).trim();
}
export function validateProduct(value: unknown): AdminProduct {
  const data = record(value);
  const status = productStatus(data.status);
  const brand = productCatalogAssignment(data.brand, 'brands');
  const category = productCatalogAssignment(data.category, 'categories');
  const name = text(data.name, 'نام محصول', 200, true);
  const slug = normalizeProductSlug(text(data.slug, 'نامک محصول', 160, true));
  if (!isValidProductSlug(slug)) throw new HttpError(422, 'نامک محصول باید شامل حروف فارسی یا انگلیسی، عدد و خط تیره بین کلمات باشد.');
  const images: ProductImage[] = data.images === undefined
    ? (data.image ? [{ id: 'main', url: imageUrl(data.image), alt: name, caption: '' }] : [])
    : array(data.images, 'تصاویر', 10).map(value => {
      const image = record(value);
      return { id: identifier(image.id), url: imageUrl(image.url), alt: optionalText(image.alt, 'متن جایگزین تصویر', 200), caption: optionalText(image.caption, 'توضیح تصویر', 500) };
    });
  unique(images.map(image => image.id), 'شناسه تصویر');
  if (status === 'active' && !images.length) throw new HttpError(422, 'برای انتشار محصول، تصویر اصلی را بارگذاری کنید.');
  const price = data.price == null ? null : amount(data.price, 'قیمت');
  const salePrice = data.salePrice == null ? null : amount(data.salePrice, 'قیمت با تخفیف');
  if (salePrice !== null && (price === null || salePrice >= price)) throw new HttpError(422, 'قیمت با تخفیف باید کمتر از قیمت اصلی باشد.');
  const stock = amount(data.stock === undefined ? 0 : data.stock, 'موجودی', 1_000_000);
  const productAvailability = availability(data.availability === undefined ? (stock > 0 ? 'in_stock' : 'out_of_stock') : data.availability);
  const attributes = array(data.attributes === undefined ? [] : data.attributes, 'ویژگی‌ها', 30).map(value => {
    const item = record(value);
    return { name: text(item.name, 'عنوان ویژگی', 100, true), value: text(item.value, 'مقدار ویژگی', 500, true) };
  });
  const tags = array(data.tags === undefined ? [] : data.tags, 'برچسب‌ها', 30).map(value => text(value, 'برچسب', 60, true));
  unique(tags, 'برچسب');
  const hasVariants = data.hasVariants === undefined ? false : boolean(data.hasVariants);
  const variantOptions: ProductVariantOption[] = array(data.variantOptions === undefined ? [] : data.variantOptions, 'گزینه‌های تنوع', 3).map(value => {
    const option = record(value);
    const values = array(option.values, 'مقادیر گزینه', 50).map(value => text(value, 'مقدار گزینه', 100, true));
    unique(values, 'مقدار گزینه');
    if (!values.length) throw new HttpError(422, 'هر گزینه تنوع باید حداقل یک مقدار داشته باشد.');
    return { id: identifier(option.id), name: text(option.name, 'نام گزینه', 100, true), values };
  });
  unique(variantOptions.map(option => option.id), 'شناسه گزینه');
  unique(variantOptions.map(option => option.name), 'نام گزینه');
  const combinationCount = variantOptions.reduce((count, option) => count * option.values.length, 1);
  if (hasVariants && combinationCount > 50) throw new HttpError(422, 'حداکثر ۵۰ تنوع برای هر محصول مجاز است.');
  const variants = array(data.variants === undefined ? [] : data.variants, 'تنوع‌ها', 50).map(value => {
    const item = record(value);
    const values = array(item.values, 'مقادیر تنوع', 3).map(value => text(value, 'مقدار تنوع', 100, true));
    if (values.length !== variantOptions.length || values.some((value, index) => !variantOptions[index].values.includes(value))) throw new HttpError(422, 'مقادیر تنوع با گزینه‌های محصول مطابقت ندارد.');
    return { id: identifier(item.id), values, sku: optionalText(item.sku, 'کد تنوع', 100), price: item.price === null ? null : amount(item.price, 'قیمت تنوع'), stock: amount(item.stock, 'موجودی تنوع', 1_000_000), availability: availability(item.availability) };
  });
  unique(variants.map(variant => variant.id), 'شناسه تنوع');
  unique(variants.map(variant => JSON.stringify(variant.values)), 'ترکیب تنوع');
  unique(variants.map(variant => variant.sku).filter(Boolean), 'کد تنوع');
  if (hasVariants && status === 'active' && (!variantOptions.length || variants.length !== combinationCount)) throw new HttpError(422, 'پیش از انتشار، همه تنوع‌های محصول را بسازید.');
  const descriptionHtml = sanitizeProductHtml(data.descriptionHtml);
  // Keep a plain-text summary for search and metadata while storing only
  // allowlisted markup for the editor and product page. Explicit empty HTML
  // clears the summary instead of resurrecting an older plain-text value.
  let shortDescriptionHtml = data.shortDescriptionHtml === undefined ? '' : sanitizeProductHtml(data.shortDescriptionHtml, 'توضیح کوتاه', 10_000);
  const shortDescription = data.shortDescriptionHtml === undefined
    ? optionalText(data.shortDescription, 'توضیح کوتاه', 1000)
    : text(plainDescription(shortDescriptionHtml), 'توضیح کوتاه', 1000);
  if (!shortDescription) shortDescriptionHtml = '';
  return {
    id: identifier(data.id), slug, name,
    englishName: optionalText(data.englishName, 'نام انگلیسی', 200), brand, category, image: images[0]?.url || '', images,
    price, salePrice, stock, availability: productAvailability, trackStock: data.trackStock === undefined ? true : boolean(data.trackStock),
    size: optionalText(data.size, 'حجم', 100), description: descriptionHtml ? plainDescription(descriptionHtml) : optionalText(data.description, 'توضیحات', 60_000),
    shortDescription, shortDescriptionHtml, descriptionHtml, status,
    usageInstructions: optionalText(data.usageInstructions, 'روش استفاده', 5000), suitableFor: optionalText(data.suitableFor, 'مناسب برای', 5000), shippingReturns: optionalText(data.shippingReturns, 'ارسال و بازگشت', 5000),
    sku: optionalText(data.sku, 'کد محصول', 100), attributes, tags, hasVariants, variantOptions: hasVariants ? variantOptions : [], variants: hasVariants ? variants : [],
  };
}
export function validateSettings(value: unknown, previous: AdminSettings = defaultSettings): AdminSettings {
  const data = record(value);
  return {
    storeName: text(data.storeName, 'نام فروشگاه', 120, true), description: text(data.description, 'معرفی فروشگاه', 500),
    announcement: text(data.announcement, 'اطلاع‌رسانی', 500), supportPhone: text(data.supportPhone, 'شماره پشتیبانی', 30),
    shippingFee: amount(data.shippingFee, 'هزینه ارسال'), freeShippingThreshold: amount(data.freeShippingThreshold, 'آستانه ارسال رایگان'),
    postShippingEnabled: data.postShippingEnabled === undefined ? previous.postShippingEnabled : boolean(data.postShippingEnabled),
    tipaxShippingEnabled: data.tipaxShippingEnabled === undefined ? previous.tipaxShippingEnabled : boolean(data.tipaxShippingEnabled),
    // Shipping has its own editor and endpoint. A stale general-settings form
    // must never replace methods that were created or changed more recently.
    shippingMethods: previous.shippingMethods,
    acceptOrders: boolean(data.acceptOrders), showStock: boolean(data.showStock),
  };
}
export function validateShippingSettings(value: unknown): ShippingSettings {
  const data = record(value);
  const shippingMethods = array(data.shippingMethods, 'روش‌های ارسال', 30).map(value => {
    const item = record(value);
    const name = text(item.name, 'نام روش ارسال', 100, true);
    if (/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(String(item.name))) throw new HttpError(422, 'نام روش ارسال معتبر نیست.');
    const free = boolean(item.free);
    const postpaid = item.postpaid === undefined ? false : boolean(item.postpaid);
    if (free && postpaid) throw new HttpError(422, 'روش ارسال نمی‌تواند هم رایگان و هم پس‌کرایه باشد.');
    const fee = amount(item.fee, 'هزینه ارسال');
    // Free and postpaid methods have no upfront charge. Postpaid retains a
    // separate flag because the carrier collects its fee at delivery.
    return { id: identifier(item.id), name, fee: free || postpaid ? 0 : fee, free, postpaid, enabled: boolean(item.enabled) };
  });
  unique(shippingMethods.map(method => method.id), 'شناسه روش ارسال');
  return { shippingMethods };
}
