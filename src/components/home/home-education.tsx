"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Dialog } from "@/components/dialog";
import { Icon, Star } from "@/components/icons";
import type { Product } from "@/lib/products";
import { findCatalogSelection, HOME_INGREDIENT_QUERIES } from "./home-discovery";
import { HomeSectionHeading } from "./home-ui";
import shared from "./home-shared.module.css";
import styles from "./home-education.module.css";

const ingredients = [
  { id: "hyaluronic", title: "هیالورونیک اسید", queries: HOME_INGREDIENT_QUERIES.hyaluronic, body: "این نام را ممکن است روی برچسب محصولات آبرسان ببینی. برای انتخاب، فهرست کامل ترکیبات، بافت و توضیحات سازنده را کنار هم بخوان." },
  { id: "niacinamide", title: "نیاسینامید", queries: HOME_INGREDIENT_QUERIES.niacinamide, body: "در فهرست ترکیبات، نام انگلیسی Niacinamide را هم جستجو کن. کاربرد و روش مصرف هر فرمول را از توضیحات همان محصول بررسی کن." },
  { id: "ceramide", title: "سرامید", queries: HOME_INGREDIENT_QUERIES.ceramide, body: "روی برچسب بعضی محصولات مراقبتی با نام Ceramide دیده می‌شود. تنها یک نام کافی نیست؛ ترکیب کامل محصول و نیاز پوستت را هم در نظر بگیر." },
] as const;

function Chevron({ open }: { open: boolean }) {
  return <svg className={styles.chevron} data-open={open} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
}

export function IngredientExplorer({ products }: { products: Product[] }) {
  const [selected, setSelected] = useState<string | null>(ingredients[0].id);
  const prefix = useId();
  return <section className={`container ${shared.section} ${styles.ingredients}`} id="ingredients" aria-labelledby="home-ingredients-title" data-home-ingredients>
    <div className={styles.ingredientContent}>
      <HomeSectionHeading id="home-ingredients-title" title="زیبایی، از شناخت شروع می‌شود" description="پشت هر انتخاب خوب، کمی آگاهی است. نام ترکیبات را بشناس؛ فرمول هر محصول را جداگانه بررسی کن." />
      <div className={styles.ingredientList}>
        {ingredients.map((ingredient, index) => {
          const open = selected === ingredient.id;
          const match = findCatalogSelection(products, ingredient.queries);
          const id = `${prefix}-${ingredient.id}`;
          return <article className={styles.ingredient} key={ingredient.id} data-ingredient={ingredient.id}>
            <h3><button className={styles.ingredientToggle} id={`${id}-button`} type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setSelected(open ? null : ingredient.id)} data-ingredient-toggle>
              <span className={styles.ingredientNumber} aria-hidden="true">0{index + 1}</span><span className={styles.ingredientTitle}>{ingredient.title}</span><Chevron open={open} />
            </button></h3>
            <div className={styles.ingredientBody} id={`${id}-body`} role="region" aria-labelledby={`${id}-button`} hidden={!open}>
              <p>{ingredient.body}</p><Link href={match.href} className={shared.textLink}>جستجو در ترکیبات محصولات <Icon name="arrow" size={20} /></Link>
            </div>
          </article>;
        })}
      </div>
    </div>
    <div className={`${shared.photo} ${styles.ingredientPhoto}`}><Image src="/images/home-ingredients.webp" alt="قطره‌های شفاف سرم روی شیشه با انعکاس سبز ملایم" fill sizes="(max-width: 800px) 100vw, 46vw" /></div>
    <div className={styles.signature} aria-hidden="true"><span /><Star /><span /><p>انتخاب دقیق، مراقبت آگاهانه</p></div>
  </section>;
}

const guides = [
  {
    id: "label", title: "برچسب محصول را چطور بخوانیم؟", image: "/images/home-reading-label.webp", alt: "دستی که بطری شیشه‌ای مراقبتی را کنار سنگ روشن نگه داشته است",
    description: "نام، ترکیبات و روش مصرف؛ چند نشانه برای انتخابی روشن‌تر.",
    introduction: "یک نگاه دقیق به اطلاعات محصول، انتخاب را ساده‌تر می‌کند. پیش از خرید، از نام و کاربرد محصول شروع کن و بعد جزئیات را بخوان.",
    parts: [
      { title: "نام و کاربرد را کنار هم ببین", body: "توضیح کوتاه می‌تواند شروع خوبی باشد؛ برای تصمیم نهایی، توضیحات کامل، ویژگی‌ها و روش مصرف درج‌شده برای همان محصول را هم بررسی کن." },
      { title: "فقط به یک ترکیب اکتفا نکن", body: "فهرست کامل ترکیبات و توضیحات سازنده را بخوان. وجود یک نام آشنا، به‌تنهایی تصویر کاملی از یک فرمول به تو نمی‌دهد." },
      { title: "جزئیات خرید را مرور کن", body: "حجم، تنوع انتخابی، قیمت و موجودی را با نیازت تطبیق بده. اگر درباره اطلاعات محصول سوالی باقی مانده، پیش از ثبت سفارش از فروشگاه بپرس." },
    ],
  },
  {
    id: "routine", title: "یک روتین ساده، از کجا شروع می‌شود؟", image: "/images/home-reading-routine.webp", alt: "بافت کرم سفید در ظرف شیشه‌ای روی سطح روشن",
    description: "قدم‌های روشن، انتخاب‌های کمتر و توجه بیشتر به نیاز خودت.",
    introduction: "قرار نیست یک روتین خوب، فهرست بلندی از محصولات باشد. از قدم‌های قابل اجرا شروع کن و برای هر محصول، دلیل انتخاب روشنی داشته باش.",
    parts: [
      { title: "از نیازت شروع کن", body: "به دنبال چه نوع محصولی هستی و در حال حاضر چه چیزهایی در روتینت داری؟ پاسخ به این دو سوال کمک می‌کند انتخاب‌هایت را مرتب کنی." },
      { title: "روتین روز و شب را جدا ببین", body: "در بخش راهنمای روتین، میان روز و شب جابه‌جا شو و محصولات هر مرحله را بررسی کن. ترتیب و دفعات استفاده از هر محصول را از دستور سازنده بخوان." },
      { title: "سبد خریدت را یک بار مرور کن", body: "توضیحات محصول، اندازه و تنوع‌ها را با هم مقایسه کن. لازم نیست همه انتخاب‌ها را یک‌باره انجام بدهی؛ می‌توانی محصولات مورد علاقه‌ات را برای بررسی بعدی ذخیره کنی." },
    ],
  },
  {
    id: "first-use", title: "قبل از اولین استفاده، این‌ها را ببین", image: "/images/home-reading-first-use.webp", alt: "حوله روشن، بطری شیشه‌ای مات و برگ سبز روی میز مراقبت",
    description: "از باز کردن بسته تا خواندن دستور مصرف، با حوصله پیش برو.",
    introduction: "وقتی سفارشت رسید، چند دقیقه برای بررسی اطلاعات محصول کنار بگذار. همان توجهی که در انتخاب داشتی، در شروع استفاده هم همراهت باشد.",
    parts: [
      { title: "محصول را با سفارشت تطبیق بده", body: "نام، حجم و تنوع محصول را با جزئیات سفارش مقایسه کن. اگر سوالی درباره بسته یا سفارش داری، اطلاعات آن را برای پیگیری نزد خودت نگه دار." },
      { title: "دستور سازنده را بخوان", body: "روش مصرف، شرایط نگهداری و نکات درج‌شده روی بسته‌بندی را بررسی کن. توضیحات یک محصول دیگر، جایگزین راهنمای همان محصول نیست." },
      { title: "مسیر پیگیری را بشناس", body: "در «سفارشات من» می‌توانی جزئیات خرید و وضعیت سفارشت را ببینی. برای سوال درباره سفارش یا شرایط بازگشت، با فروشگاه در ارتباط باش." },
    ],
  },
] as const;

export function ReadingRoom({ onGuide }: { onGuide: () => void }) {
  const [selected, setSelected] = useState<(typeof guides)[number] | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  function openGuide(guide: (typeof guides)[number], button: HTMLButtonElement) {
    trigger.current = button;
    setSelected(guide);
  }
  function closeGuide() {
    setSelected(null);
    requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus({ preventScroll: true }));
  }
  return <section className={`container ${shared.section} ${styles.reading}`} id="reading-room" aria-labelledby="home-reading-title" data-home-reading>
    <HomeSectionHeading id="home-reading-title" title="کمی بخوان، بهتر انتخاب کن" description="راهنماهای کوتاه برای خریدی آگاهانه‌تر"><button className={shared.textLink} type="button" onClick={onGuide}>راهنمای خرید <Icon name="arrow" size={20} /></button></HomeSectionHeading>
    <div className={styles.readingGrid}>{guides.map(guide => <article className={styles.readingArticle} key={guide.id}>
      <button className={styles.articleImage} type="button" aria-label={`بخوان: ${guide.title}`} onClick={event => openGuide(guide, event.currentTarget)}><Image src={guide.image} alt={guide.alt} fill sizes="(max-width: 640px) 100vw, (max-width: 1000px) 45vw, 30vw" /></button>
      <span className={styles.articleLabel}>راهنمای انتخاب</span><h3>{guide.title}</h3><p>{guide.description}</p><button className={shared.primary} type="button" onClick={event => openGuide(guide, event.currentTarget)} data-read-guide={guide.id}>بیشتر بخوان <Icon name="arrow" size={20} /></button>
    </article>)}</div>
    {selected ? <Dialog open onClose={closeGuide} title={selected.title} className={styles.readingDialog}>
      <p className={styles.guideIntroduction}>{selected.introduction}</p><div className={styles.guideParts}>{selected.parts.map((part, index) => <section key={part.title}><span aria-hidden="true">{(index + 1).toLocaleString("fa-IR")}</span><div><h3>{part.title}</h3><p>{part.body}</p></div></section>)}</div>
      <div className={styles.guideActions}><Link href="/shop" className={shared.primary} onClick={() => setSelected(null)}>دیدن محصولات <Icon name="arrow" size={18} /></Link><button type="button" className={shared.textLink} onClick={() => { setSelected(null); onGuide(); }}>راهنمای انتخاب</button></div>
    </Dialog> : null}
  </section>;
}

const questions = [
  { title: "چطور محصول مناسبم را پیدا کنم؟", body: <>از دسته‌بندی محصولات یا بخش انتخاب بر اساس نیاز شروع کن. توضیحات، ترکیبات، ویژگی‌ها و روش مصرف هر محصول را بخوان تا انتخابت روشن‌تر شود. <Link href="/shop">دیدن فروشگاه</Link></> },
  { title: "هزینه و روش ارسال چطور مشخص می‌شود؟", body: <>روش‌های فعال و هزینه ارسال هنگام تکمیل سفارش نمایش داده می‌شوند. محصولات دلخواهت را به سبد اضافه کن تا گزینه‌های فعلی فروشگاه را بررسی کنی. <Link href="/cart">رفتن به سبد خرید</Link></> },
  { title: "رسید پرداخت را کجا بفرستم؟", body: <>پس از ثبت سفارش، تصویر رسید را در بخش «بارگذاری رسید پرداخت» ارسال کن. تا اعلام نتیجه بررسی، امکان ارسال رسید دیگری وجود ندارد؛ در صورت عدم تایید می‌توانی رسید جایگزین بفرستی. رسیدهای سفارش‌های قبلی از <Link href="/myorders">سفارشات من</Link> در دسترس‌اند.</> },
  { title: "سفارشم را چطور پیگیری کنم؟", body: <>با شماره همراه حساب ثبت‌کننده سفارش وارد شو و به <Link href="/myorders">سفارشات من</Link> برو. با باز کردن هر سفارش، جزئیات کالاها، اطلاعات ارسال و وضعیت آن را می‌بینی.</> },
  { title: "شرایط بازگشت محصول را کجا ببینم؟", body: <>اگر شرایط ارسال و بازگشت برای محصول ثبت شده باشد، در صفحه همان محصول نمایش داده می‌شود. برای هماهنگی و روشن شدن شرایط سفارش خودت، پیش از باز کردن بسته با فروشگاه تماس بگیر.</> },
];

export function HomeQuestions({ onContact, supportPhone }: { onContact: () => void; supportPhone?: string }) {
  const [selected, setSelected] = useState<number | null>(0);
  const prefix = useId();
  const phone = (supportPhone ?? "").replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)).replace(/[\s().-]/g, "");
  const canCall = /^\+?\d{7,15}$/.test(phone);
  return <section className={`container ${shared.section} ${styles.questions}`} id="home-questions" aria-labelledby="home-questions-title" data-home-questions>
    <div className={styles.questionMain}><HomeSectionHeading id="home-questions-title" title="پرسش‌های تو، پاسخ‌های روشن" description="" /><div className={styles.questionList}>{questions.map((question, index) => {
      const open = selected === index, id = `${prefix}-question-${index}`;
      return <article className={styles.question} key={question.title} data-question={index} data-open={open}><h3><button id={`${id}-toggle`} type="button" aria-expanded={open} aria-controls={`${id}-answer`} onClick={() => setSelected(open ? null : index)} data-question-toggle><span>{question.title}</span><Chevron open={open} /></button></h3><div id={`${id}-answer`} role="region" aria-labelledby={`${id}-toggle`} hidden={!open}>{question.body}</div></article>;
    })}</div></div>
    <aside className={styles.questionSupport}><Star className={styles.supportStar} /><h3>هنوز سوالی داری؟</h3><p>{canCall ? "برای سوال درباره محصولات و ثبت سفارش، با فروشگاه در ارتباط باش." : "با راهنمای انتخاب شروع کن و دسته‌بندی‌های فروشگاه را با حوصله ببین."}</p>{canCall ? <a className={styles.contactButton} href={`tel:${phone}`}>تماس با فروشگاه <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 3 3 5-2.5 2a16 16 0 0 0 6.5 6.5l2-2.5 5 3-1 3c-.3 1-1.3 1.4-2.3 1.2C10.4 19.9 4.1 13.6 2.8 6.3 2.6 5.3 3 4.3 4 4l3-1Z" /></svg></a> : <button type="button" className={styles.contactButton} onClick={onContact}>راهنمای انتخاب <Icon name="arrow" size={20} /></button>}<div className={styles.questionOrbit} aria-hidden="true"><Star /><i /><i /></div></aside>
  </section>;
}

export function HomeFinale({ onGuide }: { onGuide: () => void }) {
  return <section className={`container ${styles.finale}`} aria-labelledby="home-finale-title" data-home-finale>
    <div className={styles.finaleArt}><Image src="/images/home-cosmic-portrait.webp" alt="" fill sizes="100vw" /></div>
    <div className={styles.finaleCopy}><h2 id="home-finale-title">درخشش بعدی تو،<br />از یک انتخاب شروع می‌شود</h2><p>محصولات مراقبت پوست و مو را آگاهانه کشف کن.</p><div className={styles.finaleLinks}><Link href="/shop" className={styles.finalePrimary}>کشف فروشگاه <Icon name="arrow" size={21} /></Link><button className={styles.finaleSecondary} type="button" onClick={onGuide}>راهنمای انتخاب <Icon name="arrow" size={19} /></button></div></div>
  </section>;
}
