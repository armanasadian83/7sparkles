"use client";

import { useState } from "react";
import { Dialog } from "@/components/dialog";
import { Icon } from "@/components/icons";
import { normalizeAdminSearch } from "@/lib/admin-store";
import type { TrashItem, TrashKind } from "@/lib/admin-trash";
import { formatPrice } from "@/lib/products";
import { EmptyState } from "./admin-ui";

type TrashProps = {
  items: TrashItem[];
  onRestore: (kind: TrashKind, id: string) => Promise<void>;
  onPermanentlyDelete: (kind: TrashKind, id: string) => Promise<void>;
  notify: (message: string) => void;
  initialSearch?: string;
};

const kindLabels: Record<TrashKind, string> = { product: "محصول", category: "دسته‌بندی", brand: "برند" };
const dateFormatter = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" });

function deletedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

function TrashIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>;
}

export function AdminTrash({ items, onRestore, onPermanentlyDelete, notify, initialSearch = "" }: TrashProps) {
  const [search, setSearch] = useState(initialSearch);
  const [kind, setKind] = useState<TrashKind | "all">("all");
  const [pending, setPending] = useState<{ id: string; kind: TrashKind; action: "restore" | "delete" } | null>(null);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TrashItem | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const query = normalizeAdminSearch(search);
  const filtered = items.filter(item => (kind === "all" || item.kind === kind) && normalizeAdminSearch(`${item.name} ${kindLabels[item.kind]}`).includes(query));

  async function restore(item: TrashItem) {
    if (pending) return;
    setPending({ id: item.id, kind: item.kind, action: "restore" });
    setError("");
    try {
      await onRestore(item.kind, item.id);
      notify(`${kindLabels[item.kind]} «${item.name}» بازیابی شد.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "بازیابی انجام نشد. دوباره تلاش کنید."); }
    finally { setPending(null); }
  }

  async function permanentlyDelete() {
    if (pending || !deleteTarget) return;
    const item = deleteTarget;
    setPending({ id: item.id, kind: item.kind, action: "delete" });
    setDeleteError("");
    try {
      await onPermanentlyDelete(item.kind, item.id);
      setDeleteTarget(null);
      setError("");
      notify(`${kindLabels[item.kind]} «${item.name}» برای همیشه حذف شد.`);
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "حذف دائمی انجام نشد. دوباره تلاش کنید."); }
    finally { setPending(null); }
  }

  function closeDelete() { if (!pending) { setDeleteTarget(null); setDeleteError(""); } }

  return <>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><h2>سطل زباله <span className="admin-count">{formatPrice(items.length)}</span></h2><p>محصولات بایگانی‌شده و موارد حذف‌شده را بازیابی یا برای همیشه حذف کنید.</p></div></div>
      <div className="admin-toolbar">
        <label className="admin-search-field"><Icon name="search" size={19} /><input aria-label="جستجو در سطل زباله" placeholder="جستجو در نام موارد حذف‌شده..." value={search} onChange={event => setSearch(event.target.value)} /></label>
        <select aria-label="فیلتر نوع موارد سطل زباله" value={kind} onChange={event => setKind(event.target.value as TrashKind | "all")}><option value="all">همه موارد</option><option value="product">محصولات</option><option value="category">دسته‌بندی‌ها</option><option value="brand">برندها</option></select>
      </div>
      {error ? <p className="admin-error admin-inline-error" role="alert">{error}</p> : null}
      {filtered.length ? <div className="admin-table-scroll"><table className="admin-table admin-trash-table">
        <thead><tr><th scope="col">نام</th><th scope="col">نوع</th><th scope="col">تاریخ انتقال</th><th scope="col">عملیات</th></tr></thead>
        <tbody>{filtered.map(item => {
          const restoring = pending?.kind === item.kind && pending.id === item.id && pending.action === "restore";
          return <tr key={`${item.kind}:${item.id}`}>
            <th scope="row" className="admin-trash-name">{item.name}</th>
            <td><span className={`admin-trash-kind trash-${item.kind}`}>{kindLabels[item.kind]}</span></td>
            <td className="admin-muted"><time dateTime={item.deletedAt}>{deletedDate(item.deletedAt)}</time></td>
            <td><div className="admin-row-actions admin-trash-actions"><button type="button" className="admin-button secondary small" disabled={pending !== null} aria-label={`بازیابی ${item.name}`} onClick={() => void restore(item)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4v6h6M3.5 10a9 9 0 1 1 .7 7" /></svg>{restoring ? "در حال بازیابی..." : "بازیابی"}</button><button type="button" className="admin-button small admin-trash-delete" disabled={pending !== null} aria-label={`حذف دائمی ${item.name}`} onClick={() => { setDeleteError(""); setDeleteTarget(item); }}><TrashIcon />حذف دائمی</button></div></td>
          </tr>;
        })}</tbody>
      </table></div> : items.length ? <EmptyState /> : <EmptyState title="سطل زباله خالی است" description="موارد حذف‌شده یا بایگانی‌شده ابتدا به اینجا منتقل می‌شوند و تا زمان حذف دائمی، قابل بازیابی هستند." />}
      <div className="admin-panel-foot">{formatPrice(filtered.length)} مورد از {formatPrice(items.length)} مورد</div>
    </section>
    {deleteTarget ? <Dialog open title={`حذف دائمی ${kindLabels[deleteTarget.kind]}`} onClose={closeDelete} className="admin-dialog admin-taxonomy-dialog">
      <p>آیا {kindLabels[deleteTarget.kind]} «{deleteTarget.name}» برای همیشه حذف شود؟</p>
      <p className="admin-trash-warning">این کار قابل بازگشت نیست و دیگر امکان بازیابی این مورد وجود ندارد.</p>
      {deleteError ? <p className="admin-error" role="alert">{deleteError}</p> : null}
      <div className="admin-dialog-actions"><button type="button" className="admin-button admin-button-danger" disabled={pending !== null} onClick={() => void permanentlyDelete()}><TrashIcon />{pending ? "در حال حذف..." : "حذف برای همیشه"}</button><button type="button" className="admin-button secondary" disabled={pending !== null} onClick={closeDelete}>انصراف</button></div>
    </Dialog> : null}
  </>;
}
