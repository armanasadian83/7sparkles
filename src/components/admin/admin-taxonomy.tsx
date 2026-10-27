"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/dialog";
import { Icon } from "@/components/icons";
import { normalizeAdminSearch } from "@/lib/admin-store";
import type { CatalogTerm } from "@/lib/catalog-terms";
import { formatPrice } from "@/lib/products";
import { AdminIcon, EmptyState } from "./admin-ui";

type TermInput = { id?: string; name: string; description: string };
type TermKind = "category" | "brand";
type TaxonomyProps = {
  kind: TermKind;
  terms: CatalogTerm[];
  onSave: (term: TermInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  notify: (message: string) => void;
  initialSearch?: string;
};

function TermEditor({ kind, term, onSave, onClose }: { kind: TermKind; term: CatalogTerm | null; onSave: (term: TermInput) => Promise<void>; onClose: () => void }) {
  const label = kind === "category" ? "دسته‌بندی" : "برند";
  const [name, setName] = useState(term?.name ?? "");
  const [description, setDescription] = useState(term?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) { setError(`نام ${label} را وارد کنید.`); return; }
    setSaving(true);
    setError("");
    try { await onSave({ ...(term ? { id: term.id } : {}), name: name.trim(), description: description.trim() }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `ذخیره ${label} انجام نشد.`); setSaving(false); }
  }
  return <Dialog open onClose={() => { if (!saving) onClose(); }} title={`${term ? "ویرایش" : "افزودن"} ${label}`} className="admin-dialog admin-taxonomy-dialog">
    <form onSubmit={event => void submit(event)}>
      <fieldset className="admin-form-fields" disabled={saving}>
        <div className="admin-form-grid">
          <label className="admin-field span-two">نام {label}<input autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder={kind === "category" ? "نام دسته‌بندی را وارد کنید" : "نام برند را وارد کنید"} /></label>
          <label className="admin-field span-two">توضیحات <span className="admin-muted">(اختیاری)</span><textarea rows={4} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder={`توضیح کوتاه درباره ${label}`} /></label>
        </div>
      </fieldset>
      <p className="admin-form-hint">{term ? `تغییر نام ${label} در محصولات مرتبط نیز اعمال می‌شود.` : `پس از ذخیره، این ${label} در فرم افزودن و ویرایش محصول قابل انتخاب است.`}</p>
      {error ? <p className="admin-error" role="alert">{error}</p> : null}
      <div className="admin-dialog-actions"><button type="submit" className="admin-button" disabled={saving}>{saving ? "در حال ذخیره..." : `ذخیره ${label}`}</button><button type="button" className="admin-button secondary" disabled={saving} onClick={onClose}>انصراف</button></div>
    </form>
  </Dialog>;
}

function DeleteTerm({ kind, term, onDelete, onClose }: { kind: TermKind; term: CatalogTerm; onDelete: (id: string) => Promise<void>; onClose: () => void }) {
  const label = kind === "category" ? "دسته‌بندی" : "برند";
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try { await onDelete(term.id); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `حذف ${label} انجام نشد.`); setDeleting(false); }
  }
  return <Dialog open onClose={() => { if (!deleting) onClose(); }} title={`حذف ${label}`} className="admin-dialog admin-taxonomy-dialog">
    <p>آیا {label} «{term.name}» به سطل زباله منتقل شود؟</p>
    <p className="admin-form-hint">{term.productCount ? `${formatPrice(term.productCount)} محصول به این ${label} متصل است. برای انتقال، ابتدا ${label} این محصولات را تغییر دهید. محصولات حذف نمی‌شوند.` : `این ${label} از گزینه‌های فرم محصول کنار گذاشته می‌شود و از سطل زباله قابل بازیابی است.`}</p>
    {error ? <p className="admin-error" role="alert">{error}</p> : null}
    <div className="admin-dialog-actions"><button type="button" className="admin-button admin-button-danger" disabled={deleting} onClick={() => void remove()}>{deleting ? "در حال انتقال..." : "انتقال به سطل زباله"}</button><button type="button" className="admin-button secondary" disabled={deleting} onClick={onClose}>انصراف</button></div>
  </Dialog>;
}

export function AdminTaxonomy({ kind, terms, onSave, onDelete, notify, initialSearch = "" }: TaxonomyProps) {
  const label = kind === "category" ? "دسته‌بندی" : "برند";
  const plural = kind === "category" ? "دسته‌بندی‌ها" : "برندها";
  const [search, setSearch] = useState(initialSearch);
  const [editor, setEditor] = useState<{ term: CatalogTerm | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogTerm | null>(null);
  const query = normalizeAdminSearch(search);
  const filtered = terms.filter(term => normalizeAdminSearch(`${term.name} ${term.description}`).includes(query));
  async function save(term: TermInput) { await onSave(term); notify(`${label} ${term.id ? "ویرایش" : "ایجاد"} شد.`); }
  async function remove(id: string) { await onDelete(id); notify(`${label} به سطل زباله منتقل شد و قابل بازیابی است.`); }
  return <>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><h2>مدیریت {plural} <span className="admin-count">{formatPrice(terms.length)}</span></h2><p>{kind === "category" ? "دسته‌بندی محصولات فروشگاه را ایجاد و مدیریت کنید." : "برندهای محصولات فروشگاه را ایجاد و مدیریت کنید."}</p></div><button type="button" className="admin-button" onClick={() => setEditor({ term: null })}><Icon name="plus" size={19} />افزودن {label}</button></div>
      <div className="admin-toolbar"><label className="admin-search-field"><Icon name="search" size={19} /><input aria-label={`جستجوی ${label}`} placeholder={`جستجو در نام یا توضیحات ${label}...`} value={search} onChange={event => setSearch(event.target.value)} /></label></div>
      {filtered.length ? <div className="admin-table-scroll"><table className="admin-table admin-taxonomy-table">
        <thead><tr><th scope="col">نام {label}</th><th scope="col">توضیحات</th><th scope="col">تعداد محصولات</th><th scope="col">عملیات</th></tr></thead>
        <tbody>{filtered.map(term => <tr key={term.id}>
          <th scope="row"><button type="button" className="admin-taxonomy-name" onClick={() => setEditor({ term })}>{term.name}</button></th>
          <td className="admin-taxonomy-description admin-muted">{term.description || "—"}</td>
          <td><span className="admin-count">{formatPrice(term.productCount)}</span></td>
          <td><div className="admin-row-actions"><button type="button" className="admin-icon-button" aria-label={`ویرایش ${term.name}`} onClick={() => setEditor({ term })}><AdminIcon name="edit" /></button><button type="button" className="admin-icon-button admin-delete-term" aria-label={`حذف ${term.name}`} onClick={() => setDeleteTarget(term)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg></button></div></td>
        </tr>)}</tbody>
      </table></div> : terms.length ? <EmptyState /> : <EmptyState title={`هنوز ${label} ثبت نشده است`} description={`با دکمه افزودن ${label}، اولین مورد را ایجاد کنید.`} />}
      <div className="admin-panel-foot">{formatPrice(filtered.length)} {label} از {formatPrice(terms.length)} {label}</div>
    </section>
    {editor ? <TermEditor key={editor.term?.id ?? "new"} kind={kind} term={editor.term} onSave={save} onClose={() => setEditor(null)} /> : null}
    {deleteTarget ? <DeleteTerm key={deleteTarget.id} kind={kind} term={deleteTarget} onDelete={remove} onClose={() => setDeleteTarget(null)} /> : null}
  </>;
}
