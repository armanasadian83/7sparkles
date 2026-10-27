"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import styles from "./rich-text-editor.module.css";

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  codeLabel?: string;
  codeToggleLabel?: string;
  toolbarLabel?: string;
  placeholder?: string;
  statusHint?: string;
  compact?: boolean;
  maxCodeLength?: number | null;
};

function Alignment({ align }: { align: "right" | "center" | "left" }) {
  return <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" aria-hidden="true"><path d="M3 4h14M3 10h14M3 16h14" /><path d={align === "right" ? "M8 7h9M8 13h9" : align === "left" ? "M3 7h9M3 13h9" : "M6 7h8M6 13h8"} /></svg>;
}

export function RichTextEditor({ value, onChange, disabled = false, id = "product-description", ariaLabel = "توضیحات کامل محصول", codeLabel = "کد HTML توضیحات", codeToggleLabel = "ویرایش کد HTML", toolbarLabel = "قالب‌بندی توضیحات", placeholder = "توضیحات کامل محصول را اینجا بنویسید...", statusHint = "توضیحات و روش استفاده از محصول", compact = false, maxCodeLength = 50000 }: Props) {
  const [codeMode, setCodeMode] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer" } } }), TextAlign.configure({ types: ["heading", "paragraph"], defaultAlignment: "right" })],
    content: value,
    immediatelyRender: false,
    editable: !disabled,
    editorProps: { attributes: { id, class: styles.content, dir: "rtl", role: "textbox", "aria-label": ariaLabel, "aria-multiline": "true", "aria-describedby": `${id}-status` } },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? "" : current.getHTML()),
  });
  const state = useEditorState({ editor, selector: ({ editor: current }) => current ? {
    bold: current.isActive("bold"), italic: current.isActive("italic"), underline: current.isActive("underline"), strike: current.isActive("strike"), heading: current.isActive("heading", { level: 2 }), quote: current.isActive("blockquote"), bullet: current.isActive("bulletList"), ordered: current.isActive("orderedList"), link: current.isActive("link"), right: current.isActive({ textAlign: "right" }), center: current.isActive({ textAlign: "center" }), left: current.isActive({ textAlign: "left" }), empty: current.isEmpty,
  } : null });
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  useEffect(() => {
    if (editor && !codeMode && value !== (editor.isEmpty ? "" : editor.getHTML())) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value, codeMode]);

  function applyLink() {
    const trimmed = link.trim();
    if (!trimmed) { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkOpen(false); return; }
    const href = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    if (!/^(https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/i.test(href)) { setLinkError("یک نشانی معتبر با https، http یا mailto وارد کنید."); return; }
    editor?.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
    setLinkError("");
  }
  function toggleCode() {
    if (codeMode && editor) { editor.commands.setContent(value, { emitUpdate: false }); onChange(editor.isEmpty ? "" : editor.getHTML()); }
    setCodeMode(current => !current);
    setLinkOpen(false);
  }
  const inactive = disabled || !editor || codeMode;
  return <div className={`${styles.editor} ${compact ? styles.compact : ""} ${disabled ? styles.disabled : ""}`}>
    <div className={styles.toolbar} role="toolbar" aria-label={toolbarLabel}>
      <div className={styles.group}>
        <button type="button" title="پررنگ" aria-label="پررنگ" aria-pressed={!!state?.bold} disabled={inactive} onClick={() => editor?.chain().focus().toggleBold().run()}><b>B</b></button>
        <button type="button" title="مورب" aria-label="مورب" aria-pressed={!!state?.italic} disabled={inactive} onClick={() => editor?.chain().focus().toggleItalic().run()}><i>I</i></button>
        <button type="button" title="زیرخط" aria-label="زیرخط" aria-pressed={!!state?.underline} disabled={inactive} onClick={() => editor?.chain().focus().toggleUnderline().run()}><u>U</u></button>
        <button type="button" title="خط‌خورده" aria-label="خط‌خورده" aria-pressed={!!state?.strike} disabled={inactive} onClick={() => editor?.chain().focus().toggleStrike().run()}><s>S</s></button>
      </div>
      <div className={styles.group}>
        <button type="button" title="عنوان" aria-label="عنوان سطح دو" aria-pressed={!!state?.heading} disabled={inactive} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" title="پاراگراف" aria-label="پاراگراف" disabled={inactive} onClick={() => editor?.chain().focus().setParagraph().run()}>P</button>
        <button type="button" title="نقل‌قول" aria-label="نقل‌قول" aria-pressed={!!state?.quote} disabled={inactive} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>❞</button>
      </div>
      <div className={styles.group}>
        <button className={styles.textButton} type="button" aria-label="لیست نقطه‌ای" aria-pressed={!!state?.bullet} disabled={inactive} onClick={() => editor?.chain().focus().toggleBulletList().run()}>• لیست</button>
        <button className={styles.textButton} type="button" aria-label="لیست شماره‌دار" aria-pressed={!!state?.ordered} disabled={inactive} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>۱. لیست</button>
      </div>
      <div className={styles.group}>
        {(["right", "center", "left"] as const).map(align => <button key={align} type="button" title={align === "right" ? "راست‌چین" : align === "center" ? "وسط‌چین" : "چپ‌چین"} aria-label={align === "right" ? "راست‌چین" : align === "center" ? "وسط‌چین" : "چپ‌چین"} aria-pressed={!!state?.[align]} disabled={inactive} onClick={() => editor?.chain().focus().setTextAlign(align).run()}><Alignment align={align} /></button>)}
      </div>
      <div className={styles.group}>
        <button type="button" className={styles.textButton} aria-label="افزودن یا ویرایش پیوند" aria-pressed={!!state?.link} disabled={inactive} onClick={() => { setLink(editor?.getAttributes("link").href || ""); setLinkOpen(current => !current); setLinkError(""); }}>پیوند</button>
        <button type="button" className={styles.textButton} title="پاک‌کردن قالب‌بندی" aria-label="پاک‌کردن قالب‌بندی" disabled={inactive} onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}>پاک‌کردن</button>
      </div>
      <button type="button" className={`${styles.textButton} ${styles.codeButton}`} aria-label={codeToggleLabel} aria-pressed={codeMode} disabled={disabled || !editor} onClick={toggleCode}><span dir="ltr">&lt;/&gt;</span> کد</button>
    </div>
    {linkOpen ? <div className={styles.linkPanel}>
      <label htmlFor={`${id}-link`}>نشانی پیوند<input id={`${id}-link`} autoFocus dir="ltr" value={link} disabled={disabled} placeholder="https://example.com" onChange={event => { setLink(event.target.value); setLinkError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); applyLink(); } if (event.key === "Escape") { event.preventDefault(); setLinkOpen(false); } }} /></label>
      <button type="button" disabled={disabled} onClick={applyLink}>ثبت پیوند</button><button type="button" disabled={disabled} onClick={() => { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkOpen(false); }}>حذف پیوند</button>
      {linkError ? <p role="alert">{linkError}</p> : null}
    </div> : null}
    {codeMode ? <textarea id={`${id}-code`} className={styles.code} aria-label={codeLabel} aria-describedby={`${id}-status`} dir="ltr" spellCheck={false} maxLength={maxCodeLength ?? undefined} rows={compact ? 5 : 12} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} /> : <div className={styles.canvas}>{!editor || state?.empty ? <span className={styles.placeholder}>{placeholder}</span> : null}<EditorContent editor={editor} /></div>}
    <div id={`${id}-status`} className={styles.status}><span>{codeMode ? "ویرایش HTML" : "ویرایشگر متن"}</span><span>{statusHint}</span></div>
  </div>;
}
