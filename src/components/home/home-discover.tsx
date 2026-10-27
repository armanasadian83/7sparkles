"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState, type KeyboardEvent } from "react";
import { formatPrice, type Product } from "@/lib/products";
import { Icon } from "../icons";
import { findCatalogSelection, HOME_CONCERN_QUERIES } from "./home-discovery";
import { HomeSectionHeading } from "./home-ui";
import shared from "./home-shared.module.css";
import styles from "./home-discover.module.css";

type CareSymbol = "water" | "leaf" | "sparkle" | "hair" | "sun" | "moon" | "shield";
function CareIcon({ name }: { name: CareSymbol }) {
  return <svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "water" ? <><path d="M14 3C12 8 6 14 6 20a8 8 0 0 0 16 0c0-6-6-12-8-17Z" /><path d="M25 12c-1 3-4 6-4 9a4 4 0 0 0 8 0c0-3-3-6-4-9ZM10 20a4 4 0 0 0 4 4" /></> : name === "leaf" ? <><path d="M26 5C12 4 5 12 7 21s18 8 19-16Z" /><path d="M4 29 23 9M12 22l-1-8M17 17l7-1" /></> : name === "sparkle" ? <><path d="M13 3c1 7 3 9 10 10-7 1-9 3-10 10-1-7-3-9-10-10 7-1 9-3 10-10ZM25 21c.5 3 1.5 4 5 5-3.5 1-4.5 2-5 5-.5-3-1.5-4-5-5 3.5-1 4.5-2 5-5Z" /></> : name === "hair" ? <><path d="M22 3c-7 7-10 13-10 20a5 5 0 1 0 10 0c0-6-6-5 0-20ZM17 11c-4 6-7 9-7 16M4 23h5M24 23h4" /></> : name === "sun" ? <><circle cx="16" cy="16" r="6" /><path d="M16 2v4M16 26v4M2 16h4M26 16h4M6 6l3 3M23 23l3 3M26 6l-3 3M9 23l-3 3" /></> : name === "moon" ? <path d="M27 21A12 12 0 0 1 11 5a12 12 0 1 0 16 16Z" /> : <><path d="m16 3 11 5v8c0 7-5 11-11 14C10 27 5 23 5 16V8l11-5Z" /><path d="m11 16 3 3 7-7" /></>}
  </svg>;
}

const concerns: { id: keyof typeof HOME_CONCERN_QUERIES; title: string; description: string; image: string; symbol: CareSymbol; caption: string }[] = [
  { id: "hydration", title: "آبرسانی و رطوبت", description: "برای وقتی که رطوبت، اولویت روتین توست.", image: "/images/home-hydration.webp", symbol: "water", caption: "با نیاز امروز پوستت، آگاهانه‌تر انتخاب کن." },
  { id: "gentle", title: "آرامش و مراقبت ملایم", description: "انتخاب‌هایی با توجه به پوست حساس و مراقبت ملایم.", image: "/images/home-reading-routine.webp", symbol: "leaf", caption: "از بافت محصول تا توضیحات فرمول، با دقت بخوان." },
  { id: "glow", title: "شفافیت و درخشندگی", description: "محصولات مرتبط با روشن‌کنندگی و مراقبت از لک.", image: "/images/home-ingredients.webp", symbol: "sparkle", caption: "انتخاب خوب، از شناخت محصول شروع می‌شود." },
  { id: "hair", title: "مراقبت از مو و اسکالپ", description: "از مراقبت روزانه تا انتخاب‌های تخصصی مو.", image: "/images/home-reading-first-use.webp", symbol: "hair", caption: "برای موهایت هم، یک مسیر مراقبت پیدا کن." },
];

export function NeedDiscovery({ products, loaded }: { products: Product[]; loaded: boolean }) {
  const [selected, setSelected] = useState(0);
  const active = concerns[selected];
  const selection = findCatalogSelection(products, HOME_CONCERN_QUERIES[active.id]);
  const id = useId();
  return <section className={`container ${shared.section}`} aria-labelledby="home-needs-title" data-home-section="needs">
    <HomeSectionHeading id="home-needs-title" title="مراقبت را از نیازت شروع کن" description="هر پوست، داستان خودش را دارد. مسیر انتخابت را از اینجا پیدا کن."><Link className={shared.textLink} href="/shop">دیدن همه محصولات <Icon name="arrow" size={20} /></Link></HomeSectionHeading>
    <div className={styles.discovery}>
      <div className={styles.concerns} role="group" aria-label="انتخاب نیاز مراقبتی">{concerns.map((concern, index) => <button type="button" key={concern.id} className={styles.concern} aria-pressed={selected === index} aria-controls={`${id}-selection`} onClick={() => setSelected(index)} data-concern={concern.id}>
        <span className={styles.concernIcon}><CareIcon name={concern.symbol} /></span><span className={styles.concernCopy}><strong>{concern.title}</strong><span>{concern.description}</span></span><Icon className={styles.concernArrow} name="arrow" size={24} />
      </button>)}</div>
      <div className={`${shared.photo} ${styles.discoveryPhoto}`} id={`${id}-selection`}>
        <Image key={active.image} src={active.image} alt="چیدمان الهام‌گرفته از بافت‌ها و محصولات مراقبتی" fill sizes="(max-width: 760px) 100vw, 55vw" />
        <div className={styles.photoCaption}><div><h3>{active.title}</h3><p>{active.caption}</p>{loaded && selection.count > 0 ? <span className={styles.matchCount}>{formatPrice(selection.count)} محصول مرتبط در فروشگاه</span> : null}</div><Link href={selection.href}>کشف محصولات این نیاز <Icon name="arrow" size={20} /></Link></div>
      </div>
    </div>
  </section>;
}

const daySteps: { title: string; description: string; queries: readonly string[]; symbol: CareSymbol }[] = [
  { title: "پاک‌سازی", description: "از شوینده‌ای شروع کن که نوع پوست و روش مصرفش را می‌شناسی.", queries: ["شوینده", "پاک‌کننده", "cleanser", "cleansing"], symbol: "water" },
  { title: "آبرسانی", description: "بافت و ترکیبات آبرسانت را با نیاز روزانه پوستت هماهنگ کن.", queries: HOME_CONCERN_QUERIES.hydration, symbol: "leaf" },
  { title: "محافظت", description: "محصولات محافظت روزانه را ببین و دستور مصرف هر کدام را بخوان.", queries: ["ضدآفتاب", "spf", "sunscreen"], symbol: "shield" },
];
const nightSteps: typeof daySteps = [
  { title: "پاک‌سازی", description: "در پایان روز، برای پاک‌سازی هم انتخابی متناسب با پوستت داشته باش.", queries: daySteps[0].queries, symbol: "water" },
  { title: "مراقبت متمرکز", description: "سرم‌ها را با توجه به توضیحات و روش استفاده همان محصول مقایسه کن.", queries: ["سرم", "serum"], symbol: "sparkle" },
  { title: "رطوبت‌رسانی", description: "با انتخاب یک بافت دلخواه، روتین شبانه‌ات را ساده و منظم نگه دار.", queries: ["مرطوب", "آبرسان", "moisturizer", "hydrating"], symbol: "leaf" },
];

export function RoutineRitual({ products, onGuide }: { products: Product[]; onGuide: () => void }) {
  const [mode, setMode] = useState<"day" | "night">("day");
  const id = useId();
  const steps = mode === "day" ? daySteps : nightSteps;
  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "day" : event.key === "End" ? "night" : mode === "day" ? "night" : "day";
    setMode(next);
    document.getElementById(`${id}-${next}`)?.focus();
  }
  return <section className={`container ${shared.section} ${styles.ritual}`} aria-labelledby="routine-title" data-home-section="routine">
    <div className={`${shared.photo} ${styles.ritualPhoto}`}><Image src="/images/home-ritual.webp" alt="چیدمان تزئینی سرم، بافت کرم و پارچه لطیف در کنار سنگ روشن" fill sizes="(max-width: 760px) 100vw, 48vw" /><p className={styles.ritualCaption}><span />کمتر، اما آگاهانه‌تر</p></div>
    <div className={styles.ritualContent}>
      <HomeSectionHeading id="routine-title" title="روتین تو، به سبک خودت" description="یک انتخاب آگاهانه، شروع یک درخشش تازه." />
      <div className={styles.routineTabs} role="tablist" aria-label="زمان روتین" onKeyDown={navigateTabs}>{(["day", "night"] as const).map(value => <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-controls={`${id}-steps`} aria-selected={mode === value} tabIndex={mode === value ? 0 : -1} onClick={() => setMode(value)}><CareIcon name={value === "day" ? "sun" : "moon"} />{value === "day" ? "روتین روز" : "روتین شب"}</button>)}</div>
      <div role="tabpanel" id={`${id}-steps`} aria-labelledby={`${id}-${mode}`} tabIndex={0} className={styles.steps}>
        <ol>{steps.map((step, index) => <li key={`${mode}-${step.title}`}><span className={styles.stepNumber}>{formatPrice(index + 1).padStart(2, "۰")}</span><div className={styles.stepCopy}><h3>{step.title}</h3><p>{step.description}</p></div><Link className={styles.stepLink} href={findCatalogSelection(products, step.queries).href}>مشاهده محصولات <Icon name="arrow" size={18} /></Link></li>)}</ol>
      </div>
      <button className={shared.primary} type="button" onClick={onGuide}>انتخاب محصولات روتین <Icon name="arrow" size={20} /></button>
      <p className={styles.routineNote}>این مسیر، راهنمای انتخاب است؛ ترتیب و روش مصرف هر محصول را از توضیحات سازنده بررسی کن.</p>
    </div>
  </section>;
}
