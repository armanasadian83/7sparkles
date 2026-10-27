"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { adminRequest, useAdminStore, type AdminProduct } from "@/lib/admin-store";
import { isValidProductSlug, normalizeProductSlug } from "@/lib/product-slug";
import { RichTextEditor } from "./rich-text-editor";
import styles from "./product-editor.module.css";

type Availability = AdminProduct["availability"];
type Variant = AdminProduct["variants"][number];
type VariantDraft = Omit<Variant, "price" | "stock"> & { price: string; stock: string };
type Draft = Omit<AdminProduct, "price" | "salePrice" | "stock" | "variants"> & { price: string; salePrice: string; stock: string; variants: VariantDraft[] };
const availabilityLabels: Record<Availability, string> = { in_stock: "موجود", out_of_stock: "ناموجود", preorder: "پیش‌فروش" };
const MAX_IMAGES = 10;
const MAX_VARIANTS = 50;

function numberValue(value: string) {
  const normalized = value.replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)).replace(/[,٬\s]/g, "");
  return normalized === "" ? null : /^\d+$/.test(normalized) ? Number(normalized) : NaN;
}
function plainHtml(value: string) { return value ? `<p>${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>")}</p>` : ""; }
function shortDescriptionText(html: string) {
  const separated = html.replace(/<\/(?:p|h2|h3|li|blockquote|pre)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  return (new DOMParser().parseFromString(separated, "text/html").body.textContent ?? "").trim();
}
function initialDraft(product: AdminProduct | null): Draft {
  return {
    slug: product?.slug ?? "", usageInstructions: product?.usageInstructions ?? "", suitableFor: product?.suitableFor ?? "", shippingReturns: product?.shippingReturns ?? "",
    id: product?.id ?? "", name: product?.name ?? "", englishName: product?.englishName ?? "", brand: product?.brand ?? "", category: product?.category ?? "", image: product?.image ?? "", price: product?.price?.toString() ?? "", salePrice: product?.salePrice?.toString() ?? "", stock: product?.stock?.toString() ?? "0", size: product?.size ?? "", description: product?.description ?? "", shortDescription: product?.shortDescription ?? "", shortDescriptionHtml: product?.shortDescriptionHtml || plainHtml(product?.shortDescription ?? ""), descriptionHtml: product?.descriptionHtml || plainHtml(product?.description ?? ""), status: product?.status ?? "active", availability: product?.availability ?? "in_stock", trackStock: product?.trackStock ?? false, sku: product?.sku ?? "", images: product?.images?.length ? product.images.map(image => ({ ...image })) : product?.image ? [{ id: "main-image", url: product.image, alt: product.name, caption: "" }] : [], attributes: product?.attributes?.map(attribute => ({ ...attribute })) ?? [], tags: [...(product?.tags ?? [])], hasVariants: product?.hasVariants ?? false, variantOptions: product?.variantOptions?.map(option => ({ ...option, values: [...option.values] })) ?? [], variants: product?.variants?.map(variant => ({ ...variant, values: [...variant.values], price: variant.price?.toString() ?? "", stock: variant.stock.toString() })) ?? [],
  };
}
function Card({ title, hint, children, className = "" }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return <section className={`${styles.card} ${className}`}><div className={styles.cardHeading}><h2>{title}</h2>{hint ? <p>{hint}</p> : null}</div>{children}</section>;
}
function Toggle({ label, checked, onChange, id }: { label: string; checked: boolean; onChange: (checked: boolean) => void; id: string }) {
  return <div className={styles.toggleRow}><span id={`${id}-label`}>{label}</span><button id={id} type="button" role="switch" aria-checked={checked} aria-labelledby={`${id}-label`} className={styles.switch} onClick={() => onChange(!checked)}><span /></button></div>;
}
function ChipInput({ values, onChange, label, placeholder, limit = 20 }: { values: string[]; onChange: (values: string[]) => void; label: string; placeholder: string; limit?: number }) {
  const [input, setInput] = useState("");
  function add() {
    const additions = input.split(/[,،\n]/).map(value => value.trim()).filter(value => value && value.length <= 50);
    if (additions.length) onChange([...new Set([...values, ...additions])].slice(0, limit));
    setInput("");
  }
  return <div className={styles.chipsInput}>{values.map((value, index) => <span key={value} className={styles.chip}>{value}<button type="button" aria-label={`حذف ${value}`} onClick={() => onChange(values.filter((_, item) => item !== index))}><Icon name="close" size={13} /></button></span>)}<input aria-label={label} placeholder={values.length >= limit ? `حداکثر ${limit.toLocaleString("fa-IR")} مورد` : placeholder} maxLength={200} value={input} disabled={values.length >= limit} onChange={event => setInput(event.target.value)} onBlur={add} onKeyDown={event => { if (["Enter", ",", "،"].includes(event.key)) { event.preventDefault(); add(); } if (event.key === "Backspace" && !input && values.length) onChange(values.slice(0, -1)); }} /></div>;
}
function AmountInput({ label, value, onChange, placeholder = "مثلاً ۱٬۲۰۰٬۰۰۰", id }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; id: string }) {
  return <label className={styles.field} htmlFor={id}>{label}<span className={styles.currencyInput}><input id={id} type="text" inputMode="numeric" maxLength={18} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /><span>تومان</span></span></label>;
}
function combinations(options: Draft["variantOptions"]): string[][] {
  return options.reduce<string[][]>((result, option) => result.flatMap(previous => option.values.map(value => [...previous, value])), [[]]);
}

export function ProductEditor({ product }: { product: AdminProduct | null }) {
  const router = useRouter();
  const store = useAdminStore();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(product));
  const [saleEnabled, setSaleEnabled] = useState(product?.salePrice != null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [notice, setNotice] = useState("");
  const [variantNotice, setVariantNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const savedId = useRef(product?.id ?? "");
  const pending = saving || uploading;
  const publication = draft.status !== "active" ? "draft" : draft.availability === "preorder" ? "preorder" : "active";
  const variantCount = draft.variantOptions.length && draft.variantOptions.every(option => option.name.trim() && option.values.length) ? draft.variantOptions.reduce((count, option) => count * option.values.length, 1) : 0;
  const variantsMatch = !draft.hasVariants || (variantCount > 0 && variantCount <= MAX_VARIANTS && draft.variants.length === variantCount && combinations(draft.variantOptions).every(values => draft.variants.some(variant => JSON.stringify(variant.values) === JSON.stringify(values))));
  const categoryExists = store.categories.some(category => category.id === draft.category);
  const brandExists = store.brands.some(brand => brand.name === draft.brand);

  function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(current => ({ ...current, [key]: value })); setNotice(""); }
  function changeShortDescription(html: string) {
    const text = shortDescriptionText(html);
    setDraft(current => ({ ...current, shortDescriptionHtml: html, shortDescription: text }));
    setNotice("");
  }
  function changePublication(value: "active" | "preorder" | "draft") {
    setDraft(current => ({ ...current, status: value === "draft" ? "draft" : "active", availability: value === "preorder" ? "preorder" : current.availability === "preorder" ? "in_stock" : current.availability }));
    setNotice("");
  }
  function changeImage(index: number, key: "alt" | "caption", value: string) { setDraft(current => ({ ...current, images: current.images.map((image, item) => item === index ? { ...image, [key]: value } : image) })); setNotice(""); }
  function moveImage(index: number, target: number) {
    if (target < 0 || target >= draft.images.length) return;
    const images = [...draft.images];
    const [image] = images.splice(index, 1);
    images.splice(target, 0, image);
    change("images", images);
  }
  async function upload(files: File[]) {
    if (uploadLock.current || pending || !files.length) return;
    setError(""); setNotice("");
    if (draft.images.length + files.length > MAX_IMAGES) { setError("برای هر محصول حداکثر ۱۰ تصویر می‌توانید بارگذاری کنید."); return; }
    const invalid = files.find(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size);
    if (invalid) { setError(`تصویر «${invalid.name}» معتبر نیست. فایل PNG، JPG یا WebP با حجم حداکثر ۵ مگابایت انتخاب کنید.`); return; }
    uploadLock.current = true;
    setUploading(true);
    try {
      for (let index = 0; index < files.length; index++) {
        setUploadProgress(`بارگذاری تصویر ${(index + 1).toLocaleString("fa-IR")} از ${files.length.toLocaleString("fa-IR")}...`);
        const body = new FormData(); body.append("file", files[index]);
        const { image } = await adminRequest<{ image: string }>("/api/admin/uploads", { method: "POST", body });
        setDraft(current => ({ ...current, images: [...current.images, { id: crypto.randomUUID(), url: image, alt: "", caption: "" }] }));
      }
      setNotice("تصاویر بارگذاری شدند. برای ثبت آن‌ها محصول را ذخیره کنید.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "بارگذاری تصاویر انجام نشد."); }
    finally { uploadLock.current = false; setUploading(false); setUploadProgress(""); }
  }
  function selectFiles(event: ChangeEvent<HTMLInputElement>) { void upload(Array.from(event.target.files ?? [])); event.target.value = ""; }
  function dropFiles(event: DragEvent<HTMLButtonElement>) { event.preventDefault(); setDragging(false); if (!pending) void upload(Array.from(event.dataTransfer.files)); }
  function addOption() {
    if (draft.variantOptions.length >= 3) return;
    change("variantOptions", [...draft.variantOptions, { id: crypto.randomUUID(), name: "", values: [] }]);
    setVariantNotice("");
  }
  function generateVariants() {
    setVariantNotice(""); setError("");
    if (!draft.variantOptions.length || draft.variantOptions.some(option => !option.name.trim() || !option.values.length)) { setVariantNotice("برای هر گزینه یک عنوان و دست‌کم یک مقدار وارد کنید."); return; }
    if (new Set(draft.variantOptions.map(option => option.name.trim())).size !== draft.variantOptions.length) { setVariantNotice("عنوان گزینه‌ها باید با هم متفاوت باشند."); return; }
    if (variantCount > MAX_VARIANTS) { setVariantNotice("حداکثر ۵۰ ترکیب قابل ساخت است. تعداد گزینه‌ها یا مقدارها را کم کنید."); return; }
    const usedSkus = new Set(draft.variants.map(variant => variant.sku.toLocaleLowerCase()).filter(Boolean));
    let skuNumber = 1;
    const variants = combinations(draft.variantOptions).map(values => {
      const existing = draft.variants.find(variant => JSON.stringify(variant.values) === JSON.stringify(values));
      if (existing) return existing;
      let sku = "";
      if (draft.sku) { do { sku = `${draft.sku}-${String(skuNumber++).padStart(2, "0")}`; } while (usedSkus.has(sku.toLocaleLowerCase())); usedSkus.add(sku.toLocaleLowerCase()); }
      return { id: crypto.randomUUID(), values, sku, price: draft.price, stock: "0", availability: draft.availability };
    });
    change("variants", variants);
    setVariantNotice(`${variants.length.toLocaleString("fa-IR")} تنوع آماده شد. قیمت و موجودی هر کدام را بررسی کنید.`);
  }
  function changeVariant<K extends keyof VariantDraft>(index: number, key: K, value: VariantDraft[K]) { change("variants", draft.variants.map((variant, item) => index === item ? { ...variant, [key]: value } : variant)); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const saveDraft = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "draft";
    setError(""); setNotice("");
    try {
      if (!draft.name.trim()) throw new Error("نام محصول را وارد کنید.");
      const shortDescription = shortDescriptionText(draft.shortDescriptionHtml);
      if (shortDescription.length > 1000) throw new Error("متن توضیح کوتاه باید حداکثر ۱۰۰۰ نویسه باشد؛ قالب‌بندی در این تعداد محاسبه نمی‌شود.");
      if (draft.shortDescriptionHtml.length > 10000) throw new Error("حجم کد HTML توضیح کوتاه بیش از حد مجاز است. بخشی از قالب‌بندی را پاک کنید.");
      if (!store.loaded) throw new Error("ابتدا منتظر دریافت دسته‌بندی‌ها و برندها بمانید. در صورت خطا، دریافت اطلاعات را دوباره امتحان کنید.");
      if (!categoryExists) throw new Error("یک دسته‌بندی ثبت‌شده انتخاب کنید. دسته‌بندی قبلی ممکن است حذف شده باشد.");
      if (!brandExists) throw new Error("یک برند ثبت‌شده انتخاب کنید. برند قبلی ممکن است تغییر نام داده یا حذف شده باشد.");
      const slug = normalizeProductSlug(draft.slug);
      if (!isValidProductSlug(slug)) {
        setSlugTouched(true);
        throw new Error("نامک محصول الزامی است. از حروف فارسی یا انگلیسی، عدد و خط تیره استفاده کنید؛ فاصله و نشانی کامل مجاز نیست.");
      }
      const status = saveDraft ? "draft" : draft.status;
      if (status === "active" && !draft.images.length) throw new Error("برای انتشار محصول دست‌کم یک تصویر بارگذاری کنید.");
      const price = numberValue(draft.price);
      const salePrice = saleEnabled && !draft.hasVariants ? numberValue(draft.salePrice) : null;
      const stock = numberValue(draft.stock) ?? 0;
      if ((price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 1e12)) || (salePrice !== null && (!Number.isSafeInteger(salePrice) || salePrice < 0))) throw new Error("قیمت را به تومان و به صورت عدد صحیح وارد کنید.");
      if (saleEnabled && !draft.hasVariants && (salePrice === null || price === null || salePrice >= price)) throw new Error("قیمت تخفیف باید وارد شود و از قیمت اصلی کمتر باشد.");
      if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) throw new Error("موجودی باید عددی بین صفر تا یک میلیون باشد.");
      const attributes = draft.attributes.filter(attribute => attribute.name.trim() || attribute.value.trim());
      if (attributes.some(attribute => !attribute.name.trim() || !attribute.value.trim())) throw new Error("عنوان و مقدار هر ویژگی را کامل کنید یا ردیف خالی را حذف کنید.");
      if (draft.hasVariants && status === "active" && !variantsMatch) throw new Error("گزینه‌های محصول را کامل کنید و دکمه «ساخت تنوع‌ها» را بزنید.");
      const variantOptions = draft.variantOptions.filter(option => option.name.trim() || option.values.length);
      const variants = draft.hasVariants ? draft.variants.filter(variant => variant.values.length === variantOptions.length && variant.values.every((value, index) => variantOptions[index].values.includes(value))).map(variant => {
        const variantPrice = numberValue(variant.price);
        const variantStock = numberValue(variant.stock) ?? 0;
        if (variantPrice !== null && (!Number.isSafeInteger(variantPrice) || variantPrice < 0 || variantPrice > 1e12)) throw new Error("قیمت یکی از تنوع‌ها معتبر نیست.");
        if (!Number.isSafeInteger(variantStock) || variantStock < 0 || variantStock > 1000000) throw new Error("موجودی یکی از تنوع‌ها معتبر نیست.");
        return { ...variant, price: variantPrice, stock: variantStock };
      }) : [];
      const document = new DOMParser().parseFromString(draft.descriptionHtml, "text/html");
      const payload: AdminProduct = { ...draft, id: savedId.current || crypto.randomUUID(), name: draft.name.trim(), slug, englishName: draft.englishName.trim(), shortDescription, usageInstructions: draft.usageInstructions.trim(), suitableFor: draft.suitableFor.trim(), shippingReturns: draft.shippingReturns.trim(), description: (document.body.textContent ?? "").trim(), image: draft.images[0]?.url ?? "", images: draft.images.map(image => ({ ...image, alt: image.alt.trim(), caption: image.caption.trim() })), attributes: attributes.map(attribute => ({ name: attribute.name.trim(), value: attribute.value.trim() })), sku: draft.sku.trim(), size: draft.size.trim(), price, salePrice, stock, status, variants, variantOptions: draft.hasVariants ? variantOptions.map(option => ({ ...option, name: option.name.trim() })) : [] };
      setSaving(true);
      await store.saveProduct(payload, { existing: !!product || !!savedId.current });
      savedId.current = payload.id;
      setDraft(current => ({ ...current, id: payload.id, slug, status }));
      setNotice(status === "draft" ? "پیش‌نویس محصول ذخیره شد." : "محصول با موفقیت ذخیره شد.");
      if (!product) router.replace(`/admin/products/${encodeURIComponent(payload.id)}/edit`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ذخیره محصول انجام نشد. دوباره تلاش کنید."); }
    finally { setSaving(false); }
  }

  return <div className={styles.page}>
    <nav className={styles.breadcrumb} aria-label="مسیر صفحه"><Link href="/admin">مدیریت فروشگاه</Link><span>‹</span><Link href="/admin/products">محصولات</Link><span>‹</span><span>{product ? "ویرایش محصول" : "افزودن محصول"}</span></nav>
    <form onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending} className={styles.formFields}>
        <header className={styles.header}><div><h1>{product ? "ویرایش محصول" : "افزودن محصول"}</h1><p>اطلاعات محصول را کامل کنید و منتشر کنید.</p></div><div className={styles.actions}><button type="submit" className={styles.primary} value="save">{saving ? "در حال ذخیره..." : "ذخیره محصول"}</button><button type="submit" className={styles.secondary} value="draft">ذخیره پیش‌نویس</button></div></header>
        {error ? <div className={styles.error} role="alert"><Icon name="close" size={18} /><p>{error}</p></div> : null}
        {notice ? <div className={styles.success} role="status"><Icon name="check" size={18} /><p>{notice}</p></div> : null}
        <div className={styles.layout}>
          <div className={styles.mainColumn}>
            <section className={`${styles.card} ${styles.basics}`} aria-label="اطلاعات اصلی محصول">
              <label className={styles.field}>نام محصول<input required maxLength={200} value={draft.name} onChange={event => change("name", event.target.value)} placeholder="مثلاً: سرم آبرسان نووسلیکس" autoComplete="off" /></label>
              <div className={styles.slugField}>
                <label className={styles.field} htmlFor="product-slug">نامک محصول (Slug) <span className={styles.required}>الزامی</span><input id="product-slug" name="slug" required minLength={1} maxLength={160} dir="auto" value={draft.slug} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="مثلاً: novoselix-hydrating-serum" aria-describedby="product-slug-hint product-slug-preview" aria-invalid={slugTouched && !isValidProductSlug(normalizeProductSlug(draft.slug))} onChange={event => change("slug", event.target.value)} onBlur={() => { setSlugTouched(true); change("slug", normalizeProductSlug(draft.slug)); }} /></label>
                <p id="product-slug-hint" className={styles.hint}>نشانی اختصاصی و یکتای محصول را وارد کنید. فقط حروف فارسی یا انگلیسی، عدد و خط تیره؛ بدون فاصله.</p>
                <div id="product-slug-preview" className={styles.slugPreview}><span>نشانی صفحه محصول</span><code dir="ltr">/product/{normalizeProductSlug(draft.slug) || "product-slug"}</code></div>
                {slugTouched && !isValidProductSlug(normalizeProductSlug(draft.slug)) ? <p className={styles.fieldError}>نامک معتبر وارد کنید؛ بین کلمات از یک خط تیره استفاده کنید.</p> : null}
              </div>
              <div className={styles.field}><span>توضیح کوتاه</span><RichTextEditor id="product-short-description" value={draft.shortDescriptionHtml} onChange={changeShortDescription} disabled={pending} compact ariaLabel="توضیح کوتاه محصول" codeLabel="کد HTML توضیح کوتاه" codeToggleLabel="ویرایش کد HTML توضیح کوتاه" toolbarLabel="قالب‌بندی توضیح کوتاه" placeholder="یک یا دو جمله برای نمایش در کارت محصول" statusHint={`${draft.shortDescription.length.toLocaleString("fa-IR")} از ۱۰۰۰ نویسهٔ متن`} maxCodeLength={null} />{draft.shortDescription.length > 1000 ? <p className={styles.fieldError}>متن توضیح کوتاه از حد مجاز ۱۰۰۰ نویسه بیشتر است.</p> : null}</div>
              <div className={styles.field}><span>توضیحات کامل</span><RichTextEditor value={draft.descriptionHtml} onChange={value => change("descriptionHtml", value)} disabled={pending} /></div>
            </section>
            <Card title="تصاویر محصول" hint="چند تصویر هم‌زمان بارگذاری کنید. اولین تصویر، تصویر اصلی است.">
              <input className={styles.hiddenInput} type="file" ref={fileInput} accept="image/jpeg,image/png,image/webp" multiple onChange={selectFiles} aria-label="انتخاب تصاویر محصول" tabIndex={-1} />
              <button type="button" className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`} onClick={() => fileInput.current?.click()} onDragOver={event => { event.preventDefault(); if (!pending) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={dropFiles} disabled={pending || draft.images.length >= MAX_IMAGES}>
                <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 27V6m-7 7 7-7 7 7M7 28v7h26v-7" /></svg>
                <strong>{uploading ? uploadProgress : draft.images.length >= MAX_IMAGES ? "۱۰ تصویر بارگذاری شده است" : "تصاویر را اینجا رها کنید یا کلیک کنید"}</strong><span dir="rtl">PNG، JPG یا WebP — حداکثر ۵ مگابایت</span>
              </button>
              {draft.images.length ? <div className={styles.gallery}>{draft.images.map((image, index) => <div key={image.id} className={styles.imageCard}><div className={styles.imagePreview}><Image src={image.url} width={105} height={110} alt={image.alt || draft.name || "تصویر محصول"} /></div><div className={styles.imageFields}><input aria-label={`متن جایگزین تصویر ${(index + 1).toLocaleString("fa-IR")}`} maxLength={200} value={image.alt} onChange={event => changeImage(index, "alt", event.target.value)} placeholder="متن جایگزین (Alt)" /><input aria-label={`توضیح تصویر ${(index + 1).toLocaleString("fa-IR")}`} maxLength={300} value={image.caption} onChange={event => changeImage(index, "caption", event.target.value)} placeholder="توضیح تصویر" /><div className={styles.imageTools}>{index === 0 ? <span className={styles.coverBadge}>تصویر اصلی</span> : <button type="button" onClick={() => moveImage(index, 0)}>انتخاب به‌عنوان تصویر اصلی</button>}<div className={styles.reorder}><button type="button" aria-label={`جابجایی تصویر ${(index + 1).toLocaleString("fa-IR")} به بالا`} disabled={index === 0} onClick={() => moveImage(index, index - 1)}>↑</button><button type="button" aria-label={`جابجایی تصویر ${(index + 1).toLocaleString("fa-IR")} به پایین`} disabled={index === draft.images.length - 1} onClick={() => moveImage(index, index + 1)}>↓</button></div></div></div><button type="button" className={styles.remove} aria-label={`حذف تصویر ${(index + 1).toLocaleString("fa-IR")}`} onClick={() => change("images", draft.images.filter((_, item) => item !== index))}><Icon name="close" size={21} /></button></div>)}</div> : null}
            </Card>
            <Card title="اطلاعات صفحه محصول" hint="این اطلاعات در بخش‌های بازشونده صفحه محصول نمایش داده می‌شوند.">
              <div className={styles.detailFields}>
                <label className={styles.field}>روش استفاده<textarea rows={3} maxLength={5000} value={draft.usageInstructions} onChange={event => change("usageInstructions", event.target.value)} placeholder="نحوه و دفعات استفاده از محصول" /></label>
                <label className={styles.field}>مناسب برای<textarea rows={3} maxLength={5000} value={draft.suitableFor} onChange={event => change("suitableFor", event.target.value)} placeholder="نوع پوست یا موی مناسب و موارد مصرف محصول" /></label>
                <label className={styles.field}>ارسال و بازگشت<textarea rows={3} maxLength={5000} value={draft.shippingReturns} onChange={event => change("shippingReturns", event.target.value)} placeholder="شرایط ارسال و بازگشت این محصول" /></label>
              </div>
            </Card>
            <Card title="ویژگی‌ها" hint="مشخصات فنی به‌صورت «عنوان: مقدار»، مثل حجم: ۳۰ میلی‌لیتر.">
              <div className={styles.attributeRows}>{draft.attributes.map((attribute, index) => <div key={index} className={styles.attributeRow}><input aria-label={`عنوان ویژگی ${(index + 1).toLocaleString("fa-IR")}`} maxLength={100} value={attribute.name} onChange={event => change("attributes", draft.attributes.map((item, position) => position === index ? { ...item, name: event.target.value } : item))} placeholder="عنوان (مثلاً حجم)" /><input aria-label={`مقدار ویژگی ${(index + 1).toLocaleString("fa-IR")}`} maxLength={300} value={attribute.value} onChange={event => change("attributes", draft.attributes.map((item, position) => position === index ? { ...item, value: event.target.value } : item))} placeholder="مقدار (مثلاً ۳۰ میلی‌لیتر)" /><button type="button" className={styles.remove} aria-label={`حذف ویژگی ${(index + 1).toLocaleString("fa-IR")}`} onClick={() => change("attributes", draft.attributes.filter((_, position) => index !== position))}><Icon name="close" size={21} /></button></div>)}</div>
              <button type="button" className={`${styles.secondary} ${styles.small}`} disabled={draft.attributes.length >= 30} onClick={() => change("attributes", [...draft.attributes, { name: "", value: "" }])}><Icon name="plus" size={15} />افزودن ویژگی</button>
            </Card>
            <section className={styles.card} aria-label="تنوع‌های محصول">
              <Toggle label="محصول متغیر دارد (مثلاً رنگ یا حجم)" id="has-variants" checked={draft.hasVariants} onChange={checked => { change("hasVariants", checked); if (checked && !draft.variantOptions.length) addOption(); }} />
              {draft.hasVariants ? <div className={styles.variantEditor}><p className={styles.hint}>گزینه‌ها را تعریف کنید؛ با Enter یا ویرگول مقدار اضافه می‌شود. وضعیت و قیمت هر تنوع در جدول تنوع‌ها تعیین می‌شود.</p><div className={styles.optionRows}>{draft.variantOptions.map((option, index) => <div className={styles.optionRow} key={option.id}><input aria-label={`عنوان گزینه ${(index + 1).toLocaleString("fa-IR")}`} maxLength={100} value={option.name} placeholder="مثلاً حجم" onChange={event => change("variantOptions", draft.variantOptions.map((item, position) => index === position ? { ...item, name: event.target.value } : item))} /><ChipInput label={`مقدارهای گزینه ${(index + 1).toLocaleString("fa-IR")}`} values={option.values} placeholder="مقدارها..." limit={20} onChange={values => change("variantOptions", draft.variantOptions.map((item, position) => index === position ? { ...item, values } : item))} /><button type="button" className={styles.remove} aria-label={`حذف گزینه ${(index + 1).toLocaleString("fa-IR")}`} onClick={() => change("variantOptions", draft.variantOptions.filter((_, position) => index !== position))}><Icon name="close" size={21} /></button></div>)}</div><div className={styles.variantActions}><button className={`${styles.secondary} ${styles.small}`} type="button" disabled={draft.variantOptions.length >= 3} onClick={addOption}><Icon name="plus" size={15} />گزینه جدید</button><button type="button" className={`${styles.primary} ${styles.small}`} onClick={generateVariants}>ساخت تنوع‌ها{variantCount > 0 && variantCount <= MAX_VARIANTS ? <span className={styles.count}>{variantCount.toLocaleString("fa-IR")}</span> : null}</button></div>{variantNotice ? <p className={styles.variantNotice} role="status">{variantNotice}</p> : null}{draft.variants.length && !variantsMatch ? <p className={styles.warning}>گزینه‌ها تغییر کرده‌اند. برای به‌روزرسانی جدول، دوباره «ساخت تنوع‌ها» را بزنید.</p> : null}{draft.variants.length ? <div className={styles.variantTableScroll}><table className={styles.variantTable}><thead><tr><th>تنوع</th><th>کد SKU</th><th>قیمت (تومان)</th><th>موجودی</th>{draft.trackStock ? <th>تعداد</th> : null}</tr></thead><tbody>{draft.variants.map((variant, index) => <tr key={variant.id}><td>{variant.values.join(" / ")}</td><td><input aria-label={`کد SKU تنوع ${variant.values.join(" / ")}`} dir="ltr" maxLength={80} value={variant.sku} placeholder="SKU" onChange={event => changeVariant(index, "sku", event.target.value)} /></td><td><input aria-label={`قیمت تنوع ${variant.values.join(" / ")}`} inputMode="numeric" maxLength={18} value={variant.price} placeholder="استعلام قیمت" onChange={event => changeVariant(index, "price", event.target.value)} /></td><td><select aria-label={`موجودی تنوع ${variant.values.join(" / ")}`} value={variant.availability} onChange={event => changeVariant(index, "availability", event.target.value as Availability)}>{Object.entries(availabilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>{draft.trackStock ? <td><input aria-label={`تعداد تنوع ${variant.values.join(" / ")}`} inputMode="numeric" maxLength={9} value={variant.stock} onChange={event => changeVariant(index, "stock", event.target.value)} /></td> : null}</tr>)}</tbody></table></div> : null}</div> : null}
            </section>
          </div>
          <aside className={styles.rail} aria-label="تنظیمات محصول">
            <Card title="وضعیت انتشار"><div className={styles.publication}>{([{ value: "active", title: "منتشر شده", description: "نمایش در فروشگاه" }, { value: "preorder", title: "پیش‌فروش", description: "ثبت سفارش قبل از موجود شدن" }, { value: "draft", title: "در انتظار", description: "نمایش داده نمی‌شود" }] as const).map(option => <label className={`${styles.radioOption} ${publication === option.value ? styles.selected : ""}`} key={option.value}><input type="radio" name="publication" value={option.value} checked={publication === option.value} onChange={() => changePublication(option.value)} /><span>{option.title}</span><small>{option.description}</small></label>)}</div></Card>
            <Card title="قیمت"><div className={styles.railFields}><AmountInput id="product-price" label="قیمت اصلی" value={draft.price} onChange={value => change("price", value)} />{draft.hasVariants ? <p className={styles.hint}>قیمت و وضعیت هر تنوع در جدول تنوع‌ها تعیین می‌شود. قیمت اصلی فقط هنگام ساخت تنوع‌های جدید کپی می‌شود.</p> : <Toggle label="قیمت با تخفیف" id="sale-enabled" checked={saleEnabled} onChange={checked => { setSaleEnabled(checked); setNotice(""); }} />}{saleEnabled && !draft.hasVariants ? <AmountInput id="product-sale-price" label="قیمت پس از تخفیف" value={draft.salePrice} onChange={value => change("salePrice", value)} /> : null}<p className={styles.hint}>قیمت خالی به‌صورت «نیاز به استعلام» نمایش داده می‌شود.</p></div></Card>
            <Card title="موجودی و شناسه"><div className={styles.railFields}><label className={styles.field}>وضعیت موجودی<select value={draft.availability} onChange={event => change("availability", event.target.value as Availability)}>{Object.entries(availabilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Toggle label="تعیین تعداد موجودی" id="track-stock" checked={draft.trackStock} onChange={checked => change("trackStock", checked)} />{draft.trackStock ? draft.hasVariants ? <p className={styles.hint}>تعداد موجودی هر تنوع را در جدول تنوع‌ها وارد کنید.</p> : <label className={styles.field}>تعداد موجودی<input inputMode="numeric" maxLength={9} value={draft.stock} onChange={event => change("stock", event.target.value)} placeholder="۰" /></label> : null}<label className={styles.field}>کد محصول (SKU)<span className={styles.skuInput}><input dir="ltr" maxLength={80} value={draft.sku} onChange={event => change("sku", event.target.value)} placeholder="SS-0001" /><button type="button" onClick={() => change("sku", `SS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`)}>ساخت</button></span></label></div></Card>
            <Card title="دسته‌بندی و برند"><div className={styles.railFields}>
              {store.error ? <div className={styles.fieldError} role="alert"><p>{store.error}</p><button type="button" className={styles.managementLink} onClick={() => void store.refresh()}>دریافت دوباره اطلاعات</button></div> : null}
              <div className={styles.taxonomyField}>
                <label className={styles.field} htmlFor="product-category">دسته‌بندی<select id="product-category" required disabled={!store.loaded} aria-describedby="product-category-hint" aria-invalid={store.loaded && !!draft.category && !categoryExists} value={categoryExists ? draft.category : ""} onChange={event => change("category", event.target.value)}><option value="">انتخاب دسته‌بندی...</option>{store.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                <p id="product-category-hint" className={styles.hint}>{!store.loaded ? "در حال دریافت دسته‌بندی‌ها... " : draft.category && !categoryExists ? "دسته‌بندی قبلی حذف شده است؛ دوباره انتخاب کنید. " : !store.categories.length ? "هنوز دسته‌بندی‌ای ثبت نشده است. " : ""}<Link className={styles.managementLink} href="/admin?section=categories" target="_blank" rel="noopener noreferrer">مدیریت دسته‌بندی‌ها</Link></p>
              </div>
              <div className={styles.taxonomyField}>
                <label className={styles.field} htmlFor="product-brand">برند<select id="product-brand" required disabled={!store.loaded} aria-describedby="product-brand-hint" aria-invalid={store.loaded && !!draft.brand && !brandExists} value={brandExists ? draft.brand : ""} onChange={event => change("brand", event.target.value)}><option value="">انتخاب برند...</option>{store.brands.map(brand => <option key={brand.id} value={brand.name}>{brand.name}</option>)}</select></label>
                <p id="product-brand-hint" className={styles.hint}>{!store.loaded ? "در حال دریافت برندها... " : draft.brand && !brandExists ? "برند قبلی تغییر نام داده یا حذف شده است؛ دوباره انتخاب کنید. " : !store.brands.length ? "هنوز برندی ثبت نشده است. " : ""}<Link className={styles.managementLink} href="/admin?section=brands" target="_blank" rel="noopener noreferrer">مدیریت برندها</Link></p>
              </div>
              <div className={styles.field}><span>برچسب‌ها</span><ChipInput label="افزودن برچسب" values={draft.tags} onChange={values => change("tags", values)} placeholder="بنویسید و Enter بزنید" /></div>
            </div></Card>
            <Card title="اطلاعات تکمیلی"><div className={styles.railFields}><label className={styles.field}>نام انگلیسی<input dir="ltr" maxLength={200} value={draft.englishName} onChange={event => change("englishName", event.target.value)} placeholder="English product name" /></label><label className={styles.field}>حجم / اندازه<input maxLength={100} value={draft.size} onChange={event => change("size", event.target.value)} placeholder="مثلاً ۳۰ میلی‌لیتر" /></label></div></Card>
          </aside>
        </div>
        <footer className={styles.footerActions}><Link href="/admin/products"><Icon name="arrow" size={17} />بازگشت به محصولات</Link><div className={styles.actions}><button type="submit" value="save" className={styles.primary}>{saving ? "در حال ذخیره..." : "ذخیره محصول"}</button><button type="submit" value="draft" className={styles.secondary}>ذخیره پیش‌نویس</button></div></footer>
      </fieldset>
    </form>
  </div>;
}
