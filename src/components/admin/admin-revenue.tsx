"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { buildAdminAnalytics, analyticsToCsv, type AdminAnalytics } from "@/lib/admin-analytics";
import { formatPrice } from "@/lib/products";
import type { AdminSnapshot } from "@/lib/admin-types";
import { AdminIcon, type AdminIconName } from "./admin-ui";
import { adminSectionHref } from "./admin-sidebar";
import styles from "./admin-revenue.module.css";

type Range = "7d" | "30d" | "90d" | "365d" | "all" | "custom";
type Metric = { value: number; previous: number | null; change: number | null };
const colors = ["var(--analytics-processing, #ad9569)", "var(--analytics-shipped, #94a98a)", "var(--analytics-delivered, #5e7756)", "var(--analytics-cancelled, #c58c7e)"];
const compact = new Intl.NumberFormat("fa-IR", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const number = (value: number) => formatPrice(value);
const currency = (value: number) => `${number(value)} تومان`;

function Panel({ title, description, children, control, link }: { title: string; description?: string; children: ReactNode; control?: ReactNode; link?: { href: string; label: string } }) {
  return <section className={styles.panel}><div className={styles.panelHead}><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{control}{link ? <Link href={link.href}>{link.label} ←</Link> : null}</div>{children}</section>;
}

function EmptyChart({ title = "داده‌ای در این بازه وجود ندارد", description = "بازه زمانی یا مبنای فروش را تغییر دهید." }: { title?: string; description?: string }) {
  return <div className={styles.empty}><AdminIcon name="sales" /><strong>{title}</strong><p>{description}</p></div>;
}

function DataTable({ label, headers, rows }: { label: string; headers: string[]; rows: (string | number)[][] }) {
  return <details className={styles.dataDetails}><summary>{label}</summary><div className={styles.tableScroll}><table className={styles.table}><caption className="sr-only">{label}</caption><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}>{typeof value === "number" ? number(value) : value}</td>)}</tr>) : <tr><td colSpan={headers.length}>داده‌ای وجود ندارد.</td></tr>}</tbody></table></div></details>;
}

function Toggle({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div className={styles.toggle} role="group" aria-label={label}>{options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

function Delta({ metric, comparison }: { metric: Metric; comparison: boolean }) {
  if (!comparison) return <span className={styles.delta}>بدون مقایسه در این بازه</span>;
  if (metric.change === null) return <span className={styles.delta}>{metric.value ? "دوره قبل صفر؛ درصد تغییر قابل محاسبه نیست" : "دوره قبل: صفر"}</span>;
  return <span className={styles.delta} data-direction={metric.change < 0 ? "down" : "up"}>{metric.change > 0 ? "↑ " : metric.change < 0 ? "↓ " : ""}{percent.format(Math.abs(metric.change))}٪ {metric.change < 0 ? "کاهش" : metric.change > 0 ? "افزایش" : "بدون تغییر"} نسبت به دوره قبل</span>;
}

function Kpi({ id, title, metric, icon, money, lead, comparison, hint }: { id: string; title: string; metric: Metric; icon: AdminIconName; money?: boolean; lead?: boolean; comparison: boolean; hint: string }) {
  return <article className={`${styles.kpi} ${lead ? styles.kpiLead : ""}`}><div className={styles.kpiTitle}><span>{title}</span><AdminIcon name={icon} /></div><strong className={styles.kpiValue} data-analytics-kpi={id} data-value={metric.value}><bdi>{number(Math.round(metric.value))}</bdi>{money ? <small>تومان</small> : null}</strong><Delta metric={metric} comparison={comparison} /><span className={styles.kpiHint}>{hint}</span></article>;
}

type PlotPoint = { label: string; value: number };
function Plot({ points, label, money = false, mode = "area" }: { points: PlotPoint[]; label: string; money?: boolean; mode?: "area" | "bar" | "line" }) {
  const gradientId = useId().replaceAll(":", "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(690);
  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    const resize = () => {
      const measured = Math.round(element.getBoundingClientRect().width);
      if (measured > 0) setWidth(Math.max(200, measured));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = width < 400 ? 240 : 275, left = 72, right = 18, top = 24, bottom = 47;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const rawMaximum = Math.max(1, ...points.map(point => point.value));
  const maximum = money ? rawMaximum : Math.ceil(rawMaximum / 4) * 4;
  const y = (value: number) => top + plotHeight - value / maximum * plotHeight;
  const x = (index: number) => left + (points.length > 1 ? index / (points.length - 1) * plotWidth : plotWidth / 2);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`).join(" ");
  const area = points.length ? `${path} L${x(points.length - 1)} ${top + plotHeight} L${x(0)} ${top + plotHeight} Z` : "";
  const tickIndexes = Array.from(new Set(width < 480
    ? [0, points.length - 1]
    : [0, Math.floor((points.length - 1) / 3), Math.floor((points.length - 1) * 2 / 3), points.length - 1])).filter(index => index >= 0);
  const barWidth = Math.max(2, Math.min(29, plotWidth / Math.max(1, points.length) * .6));
  return <svg ref={svgRef} className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}${money ? "؛ تومان" : ""}`}>
    <title>{label}</title><desc>مقادیر دقیق تمام نقاط در جدول زیر نمودار قابل مشاهده است. {money ? "مبالغ به تومان هستند." : ""}</desc>
    <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--analytics-area, #9daf8d)" stopOpacity=".3" /><stop offset="100%" stopColor="var(--analytics-area, #9daf8d)" stopOpacity=".02" /></linearGradient></defs>
    {[0, .25, .5, .75, 1].map(fraction => <g key={fraction}><line className={styles.gridLine} x1={left} x2={width - right} y1={y(maximum * fraction)} y2={y(maximum * fraction)} /><text className={styles.axisText} x={left - 9} y={y(maximum * fraction) + 4} textAnchor="end">{compact.format(maximum * fraction)}</text></g>)}
    {mode === "area" && points.length > 1 ? <path d={area} fill={`url(#${gradientId})`} /> : null}
    {mode === "bar" ? points.map((point, index) => <rect key={index} className={styles.bar} x={x(index) - barWidth / 2} y={y(point.value)} width={barWidth} height={Math.max(0, top + plotHeight - y(point.value))}><title>{point.label}: {money ? currency(point.value) : number(point.value)}</title></rect>) : <><path className={styles.plotLine} d={path} />{points.map((point, index) => <circle className={styles.point} key={index} cx={x(index)} cy={y(point.value)} r={points.length <= 35 ? 3 : 1.8}><title>{point.label}: {money ? currency(point.value) : number(point.value)}</title></circle>)}</>}
    {tickIndexes.map(index => {
      const lines = points[index].label.split("–");
      return <text className={styles.axisText} key={index} x={x(index)} y={height - (lines.length > 1 ? 29 : 12)} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>{lines.map((line, lineIndex) => <tspan key={lineIndex} x={x(index)} dy={lineIndex ? 18 : 0}>{line}</tspan>)}</text>;
    })}
  </svg>;
}

function StatusChart({ rows, total }: { rows: AdminAnalytics["statuses"]; total: number }) {
  return <><div className={styles.donutWrap}><div className={styles.donut}><svg viewBox="0 0 180 180" role="img" aria-label="توزیع وضعیت سفارشات"><title>تعداد سفارشات در هر وضعیت</title><circle cx="90" cy="90" r="69" fill="none" stroke="var(--analytics-track, #f0f2eb)" strokeWidth="18" />{rows.map((row, index) => {
    const share = total ? row.count / total : 0, circumference = 2 * Math.PI * 69;
    const dashOffset = total ? -rows.slice(0, index).reduce((sum, previous) => sum + previous.count, 0) / total * circumference : 0;
    return <circle key={row.id} cx="90" cy="90" r="69" fill="none" stroke={colors[index]} strokeWidth="18" strokeDasharray={`${share * circumference} ${circumference}`} strokeDashoffset={dashOffset}><title>{row.label}: {number(row.count)}</title></circle>;
  })}</svg><div className={styles.donutCenter}><strong>{number(total)}</strong><span>کل سفارشات</span></div></div><div className={styles.statuses}>{rows.map((row, index) => <div className={styles.statusRow} key={row.id}><span><i className={styles.swatch} style={{ background: colors[index] }} />{row.label}</span><strong>{number(row.count)} <small>{total ? percent.format(row.count / total * 100) : "۰"}٪</small></strong></div>)}</div></div><DataTable label="جدول وضعیت سفارشات" headers={["وضعیت", "تعداد", "ارزش سفارش (تومان)"]} rows={rows.map(row => [row.label, row.count, row.value])} /></>;
}

function Ranking({ rows, money, limit = 6 }: { rows: { id: string; name: string; value: number; secondary?: string }[]; money: boolean; limit?: number }) {
  const shown = rows.slice(0, limit), maximum = Math.max(1, ...shown.map(row => row.value));
  if (!shown.length) return <EmptyChart />;
  return <div className={styles.ranking}>{shown.map((row, index) => <div key={row.id} className={styles.rankingRow}><div className={styles.rankingLabel}><span className={styles.rankingName}><em>{number(index + 1).padStart(2, "۰")}</em><span title={row.name}>{row.name}</span></span><strong>{money ? currency(row.value) : `${number(row.value)} عدد`}</strong></div><span className={styles.rankingTrack} aria-hidden="true"><span style={{ width: `${row.value / maximum * 100}%` }} /></span>{row.secondary ? <div className={styles.rankingMeta}><span>{row.secondary}</span></div> : null}</div>)}</div>;
}

function downloadCsv(analytics: AdminAnalytics) {
  const url = URL.createObjectURL(new Blob([analyticsToCsv(analytics)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `seven-sparkles-${analytics.period.from}-${analytics.period.to}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminRevenue({ snapshot }: { snapshot: AdminSnapshot }) {
  const [range, setRange] = useState<Range>("30d");
  const [basis, setBasis] = useState<"orders" | "delivered">("orders");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ranking, setRanking] = useState("sales");
  const [growth, setGrowth] = useState("new");
  const analytics = useMemo(() => buildAdminAnalytics(snapshot, { range, basis, from, to }), [snapshot, range, basis, from, to]);
  const { period, kpis, summary, trend, customers, catalog } = analytics;
  const comparison = period.previousFrom !== null;
  const topProducts = useMemo(() => [...analytics.topProducts].sort((a, b) => (ranking === "sales" ? b.sales - a.sales : b.quantity - a.quantity) || a.name.localeCompare(b.name, "fa")), [analytics.topProducts, ranking]);
  const bucketLabel = period.bucket === "month" ? "ماهانه" : period.bucket === "week" ? "هفتگی" : "روزانه";
  function changeRange(value: Range) {
    if (value === "custom") { setFrom(period.from); setTo(period.to); }
    setRange(value);
  }
  const productStateRows = [{ name: "فعال", count: catalog.active, color: "var(--analytics-active, #829970)" }, { name: "پیش‌نویس", count: catalog.draft, color: "var(--analytics-draft, #c5b48f)" }, { name: "بایگانی‌شده", count: catalog.archived, color: "var(--analytics-neutral, #c8cdbd)" }];
  return <section className={styles.dashboard} aria-label="تحلیل درآمد و وضعیت فروشگاه" data-analytics-dashboard data-analytics-ready>
    <div className={styles.toolbar}><div className={styles.filters}><label className={styles.field}>بازه گزارش<select aria-label="بازه گزارش" value={range} onChange={event => changeRange(event.target.value as Range)}><option value="7d">۷ روز اخیر</option><option value="30d">۳۰ روز اخیر</option><option value="90d">۹۰ روز اخیر</option><option value="365d">یک سال اخیر</option><option value="all">تمام بازه‌ها</option><option value="custom">بازه دلخواه</option></select></label><label className={styles.field}>مبنای فروش<select aria-label="مبنای فروش" value={basis} onChange={event => setBasis(event.target.value as "orders" | "delivered")}><option value="orders">تمام سفارش‌های غیرلغوشده</option><option value="delivered">فقط سفارش‌های تحویل‌شده</option></select></label>{range === "custom" ? <><label className={styles.field}>از تاریخ (میلادی)<input type="date" aria-label="از تاریخ" value={from} min="1900-01-01" max={to || undefined} onChange={event => setFrom(event.target.value)} /></label><label className={styles.field}>تا تاریخ (میلادی)<input type="date" aria-label="تا تاریخ" value={to} min={from || "1900-01-01"} onChange={event => setTo(event.target.value)} /></label></> : null}</div><button type="button" className={styles.export} disabled={Boolean(period.error)} onClick={() => downloadCsv(analytics)}><AdminIcon name="external" width={17} height={17} />دریافت CSV</button></div>
    <div className={styles.scope}><strong data-analytics-period>{period.error ? "بازه زمانی نامعتبر" : period.label}</strong><span>زمان تهران · نمودارهای {bucketLabel}{comparison ? ` · مقایسه با ${period.previousLabel}` : ""}</span></div>
    {!period.error && comparison && analytics.notices.some(notice => notice.includes("روز جاری")) ? <p className={styles.smallNote}>روز جاری هنوز کامل نشده است؛ مقایسه با دوره قبل بر اساس روزهای تقویمی هم‌طول است.</p> : null}
    {period.error ? <p className={styles.error} role="alert">{period.error}</p> : null}
    <div className={styles.notice}><AdminIcon name="info" /><p><strong>تایید پرداخت بر اساس بررسی رسیدهاست.</strong> ارزش سفارش‌ها با درآمد تاییدشده متفاوت است. فقط سفارش‌هایی که رسید تاییدشده دارند در درآمد تاییدشده محاسبه می‌شوند؛ تاریخ گزارش بر اساس تاریخ ثبت سفارش است.</p></div>
    {!period.error ? <>
    <div className={styles.kpis}><Kpi id="sales" title="ارزش محصولات سفارش‌شده" metric={kpis.sales} icon="sales" money lead comparison={comparison} hint="بدون هزینه ارسال؛ پس از تخفیف" /><Kpi id="orders" title="تعداد سفارشات" metric={kpis.orders} icon="orders" comparison={comparison} hint="تمام وضعیت‌ها، شامل لغوشده" /><Kpi id="averageOrder" title="میانگین ارزش سفارش" metric={kpis.averageOrder} icon="sales" money comparison={comparison} hint="ارزش محصولات ÷ سفارش‌های مبنای فروش" /><Kpi id="units" title="تعداد کالای سفارش‌شده" metric={kpis.units} icon="box" comparison={comparison} hint={`${number(summary.qualifiedOrders)} سفارش در مبنای فروش انتخاب‌شده`} /></div>
    <div className={styles.grid}>
      <Panel title="روند ارزش سفارش‌ها" description={`ارزش محصولات پس از تخفیف، بدون ارسال · تومان · ${bucketLabel}`}>
        {summary.qualifiedOrders ? <Plot points={trend.map(point => ({ label: point.label, value: point.sales }))} label="روند ارزش محصولات سفارش‌شده" money /> : <EmptyChart />}
        <div className={styles.legend}><span><i className={styles.swatch} style={{ background: "var(--analytics-line, #82976f)" }} />ارزش محصولات سفارش‌شده</span><span>{basis === "delivered" ? "فقط تحویل‌شده" : "بدون سفارش‌های لغوشده"}</span></div>
        <DataTable label="جدول روند ارزش سفارش‌ها" headers={["بازه", "ارزش محصولات (تومان)", "تعداد سفارشات", "تعداد کالا"]} rows={trend.map(point => [point.label, point.sales, point.orders, point.units])} />
      </Panel>
      <Panel title="وضعیت سفارشات" description="همه وضعیت‌ها در بازه انتخاب‌شده؛ مستقل از مبنای فروش" link={{ href: adminSectionHref("orders"), label: "مدیریت سفارشات" }}><StatusChart rows={analytics.statuses} total={summary.totalOrders} /><div className={styles.secondaryStats}><div><span>لغوشده</span><strong>{number(summary.cancelledCount)}</strong></div><div><span>نرخ لغو</span><strong>{summary.totalOrders ? percent.format(summary.cancelledCount / summary.totalOrders * 100) : "۰"}٪</strong></div><div><span>ارزش لغوشده</span><strong>{compact.format(summary.cancelledValue)} <small>تومان</small></strong></div></div></Panel>
    </div>
    <div className={styles.equalGrid}>
      <Panel title="محصولات پرفروش" description="رتبه‌بندی بر اساس مبنای فروش و بازه انتخاب‌شده" control={<Toggle label="رتبه‌بندی محصولات" value={ranking} options={[{ value: "sales", label: "مبلغ" }, { value: "quantity", label: "تعداد" }]} onChange={setRanking} />}>
        <div data-analytics-top-products={ranking}><Ranking money={ranking === "sales"} rows={topProducts.map(product => ({ id: product.id, name: product.name, value: ranking === "sales" ? product.sales : product.quantity, secondary: `${number(product.orderCount)} سفارش · ${ranking === "sales" ? `${number(product.quantity)} عدد` : currency(product.sales)}${product.live ? "" : " · خارج از فهرست فعلی"}` }))} /></div>
        <DataTable label="جدول کامل فروش محصولات" headers={["محصول", "تعداد", "ارزش محصولات (تومان)", "تعداد سفارش"]} rows={topProducts.map(product => [product.name, product.quantity, product.sales, product.orderCount])} />
      </Panel>
      <Panel title="ارزش سفارش و وضعیت پرداخت" description="ارقام این بخش فقط سفارش‌های مبنای فروش را پوشش می‌دهند">
        <div className={styles.reconcile}><div className={styles.reconcileRow}><span>ارزش خالص محصولات</span><strong data-analytics-value="productSales">{currency(summary.productSales)}</strong></div><div className={styles.reconcileRow}><span>هزینه ارسال ثبت‌شده</span><strong>{currency(summary.shippingFees)}</strong></div><div className={`${styles.reconcileRow} ${styles.reconcileTotal}`}><span>ارزش کل سفارش‌ها</span><strong data-analytics-value="orderValue">{currency(summary.orderValue)}</strong></div><div className={styles.reconcileRow}><span>تخفیف ثبت‌شده محصولات</span><strong>{currency(summary.discount)}</strong></div><div className={styles.reconcileRow}><span>پرداخت‌نشده · {number(summary.knownUnpaidCount)} سفارش</span><strong>{currency(summary.knownUnpaidValue)}</strong></div><div className={styles.reconcileRow}><span>وضعیت پرداخت نامشخص · {number(summary.unknownPaymentCount)} سفارش</span><strong>{currency(summary.unknownPaymentValue)}</strong></div><div className={styles.reconcileRow}><span>درآمد تاییدشده با رسید</span><strong data-analytics-value="confirmedRevenue">{summary.confirmedRevenue === null ? "رسید تاییدشده‌ای وجود ندارد" : currency(summary.confirmedRevenue)}</strong></div></div><p className={styles.smallNote}>تخفیف در ارزش خالص محصولات لحاظ شده است. کرایه پس‌کرایه در مبلغ سفارش محاسبه نمی‌شود. «تحویل‌شده» به معنی تایید پرداخت نیست.</p>
      </Panel>
    </div>
    <div className={styles.equalGrid}>
      <Panel title="روند تعداد سفارشات" description={`تمام وضعیت‌ها، شامل لغوشده · ${bucketLabel}`}>
        {summary.totalOrders ? <Plot mode="bar" points={trend.map(point => ({ label: point.label, value: point.orders }))} label="تعداد سفارشات ثبت‌شده" /> : <EmptyChart />}
        <DataTable label="جدول تعداد سفارشات" headers={["بازه", "تعداد سفارشات"]} rows={trend.map(point => [point.label, point.orders])} />
      </Panel>
      <Panel title="رشد کاربران" description={growth === "new" ? `حساب‌های ثبت‌شده در هر بازه · ${bucketLabel}` : "مجموع حساب‌های ثبت‌شده تا پایان هر بازه"} control={<Toggle label="نمودار رشد کاربران" value={growth} options={[{ value: "new", label: "جدید" }, { value: "total", label: "تجمعی" }]} onChange={setGrowth} />}>
        {customers.total ? <Plot mode="line" points={trend.map(point => ({ label: point.label, value: growth === "new" ? point.newCustomers : point.totalCustomers }))} label={growth === "new" ? "روند ثبت‌نام کاربران" : "روند مجموع کاربران"} /> : <EmptyChart title="هنوز کاربری ثبت نشده است" description="با ثبت کاربران و سفارش‌های جدید، این نمودار تکمیل می‌شود." />}
        <div className={styles.secondaryStats}><div><span>کاربر جدید در بازه</span><strong data-analytics-value="newCustomers">{number(kpis.newCustomers.value)}</strong></div><div><span>خریدار یکتا</span><strong>{number(customers.buyers)}</strong></div><div><span>خریدار دارای سابقه قبلی</span><strong>{number(customers.repeatBuyers)}</strong></div></div>
        <DataTable label="جدول رشد کاربران" headers={["بازه", "کاربران جدید", "مجموع کاربران"]} rows={trend.map(point => [point.label, point.newCustomers, point.totalCustomers])} />
      </Panel>
    </div>
    <div className={styles.equalGrid}>
      <Panel title="فروش به تفکیک برند" description="ارزش خالص محصولات بر اساس برند فعلی آن‌ها · تومان"><Ranking money rows={analytics.brands.map(row => ({ id: row.id, name: row.name, value: row.sales, secondary: `${number(row.quantity)} عدد` }))} /><DataTable label="جدول فروش برندها" headers={["برند", "تعداد", "ارزش محصولات (تومان)"]} rows={analytics.brands.map(row => [row.name, row.quantity, row.sales])} /></Panel>
      <Panel title="فروش به تفکیک دسته‌بندی" description="ارزش خالص محصولات بر اساس دسته‌بندی فعلی · تومان"><Ranking money rows={analytics.categories.map(row => ({ id: row.id, name: row.name, value: row.sales, secondary: `${number(row.quantity)} عدد` }))} /><DataTable label="جدول فروش دسته‌بندی‌ها" headers={["دسته‌بندی", "تعداد", "ارزش محصولات (تومان)"]} rows={analytics.categories.map(row => [row.name, row.quantity, row.sales])} /></Panel>
    </div>
    <Panel title="روش‌های ارسال سفارش‌ها" description="روش ارسال ذخیره‌شده هنگام ثبت سفارش؛ با مبنای فروش انتخاب‌شده">
      <div className={styles.tableScroll}><table className={styles.table} data-analytics-shipping><thead><tr><th scope="col">روش ارسال</th><th scope="col">سفارش</th><th scope="col">ارزش سفارش‌ها (تومان)</th><th scope="col">هزینه ارسال (تومان)</th></tr></thead><tbody>{analytics.shipping.length ? analytics.shipping.map(method => <tr key={method.id}><td>{method.name}{method.postpaid ? " · پس‌کرایه" : ""}</td><td>{number(method.count)}</td><td>{number(method.value)}</td><td>{method.postpaid ? "پرداخت هنگام تحویل" : number(method.fees)}</td></tr>) : <tr><td colSpan={4}>روشی در سفارش‌های این بازه ثبت نشده است.</td></tr>}</tbody></table></div>
    </Panel>
    </> : null}
    <div className={styles.sectionHeading}><h2>وضعیت فعلی فروشگاه</h2><span>این بخش به بازه زمانی سفارش‌ها وابسته نیست.</span></div>
    <div className={styles.equalGrid}>
      <Panel title="محصولات و موجودی" description={`${number(catalog.total)} محصول در فهرست فعلی · ${number(catalog.variants)} تنوع`} link={{ href: adminSectionHref("products"), label: "مدیریت محصولات" }}>
        <div className={styles.inventory}><div className={styles.inventoryItem}><strong data-analytics-value="products">{number(catalog.total)}</strong><span>کل محصولات فعلی</span></div><div className={styles.inventoryItem} data-warning="true"><strong>{number(catalog.lowStock)}</strong><span>محصول کم‌موجود</span></div><div className={styles.inventoryItem} data-warning="true"><strong>{number(catalog.outOfStock)}</strong><span>محصول ناموجود</span></div></div>
        <div className={styles.progressStack} aria-hidden="true">{productStateRows.map(row => <span key={row.name} style={{ width: `${catalog.total ? row.count / catalog.total * 100 : 0}%`, background: row.color }} />)}</div><div className={styles.legend}>{productStateRows.map(row => <span key={row.name}><i className={styles.swatch} style={{ background: row.color }} />{row.name}: {number(row.count)}</span>)}</div><p className={styles.smallNote}>کم‌موجود: موجودی قابل شمارش ۱ تا ۵ عدد. موجودی امروز، وضعیت فعال محصولات و تنوع‌هایشان را در نظر می‌گیرد؛ {number(catalog.untracked)} محصول بدون شمارش موجودی است.</p><DataTable label="جدول محصولات کم‌موجود" headers={["محصول", "موجودی فعلی"]} rows={catalog.lowStockProducts.map(product => [product.name, product.stock])} />
      </Panel>
      <Panel title="کاربران و خریداران" description="حساب‌های فعلی پایگاه داده، شامل مشتریان خرید مهمان" link={{ href: adminSectionHref("users"), label: "مدیریت کاربران" }}>
        <div className={styles.inventory}><div className={styles.inventoryItem}><strong data-analytics-value="users">{number(customers.total)}</strong><span>کل حساب‌ها</span></div><div className={styles.inventoryItem}><strong>{number(customers.active)}</strong><span>حساب فعال</span></div><div className={styles.inventoryItem}><strong>{number(customers.inactive)}</strong><span>حساب غیرفعال</span></div></div>
        <div className={styles.progressStack} aria-hidden="true"><span style={{ width: `${customers.total ? customers.active / customers.total * 100 : 0}%`, background: "var(--analytics-active, #829970)" }} /><span style={{ width: `${customers.total ? customers.inactive / customers.total * 100 : 0}%`, background: "var(--analytics-neutral, #c8cdbd)" }} /></div><p className={styles.smallNote}>فعال یا غیرفعال بودن، وضعیت حساب است و تعداد بازدیدکنندگان یا کاربران آنلاین را نشان نمی‌دهد.</p>{!period.error ? <><div className={styles.secondaryStats}><div><span>خریدار جدید در بازه</span><strong>{number(customers.newBuyers)}</strong></div><div><span>خریدار دارای سابقه قبلی</span><strong>{number(customers.repeatBuyers)}</strong></div><div><span>سهم خریداران قبلی</span><strong>{percent.format(customers.repeatRate)}٪</strong></div></div><p className={styles.smallNote}>خریدار قبلی، پیش از شروع بازه در همین مبنای فروش سفارش داشته و در این بازه هم سفارش دارد؛ این شاخص به معنی پرداخت تأییدشده نیست.</p></> : null}
      </Panel>
    </div>
    <details className={styles.footnote}><summary>تعریف شاخص‌ها و محدوده داده‌ها</summary><ul><li>منبع: سفارش‌ها، اقلام سفارش، مشتریان و فهرست محصولات پایگاه داده فروشگاه. هیچ داده نمونه‌ای به گزارش اضافه نمی‌شود.</li><li>زمان سفارش مبنای ورود به بازه است؛ تاریخ تأیید پرداخت و تاریخ تغییر وضعیت در داده‌های فعلی موجود نیست.</li><li>ارزش محصولات، مجموع قیمت ذخیره‌شده هر قلم × تعداد است. هزینه ارسال جداست؛ مبالغ همه نمودارها تومان هستند.</li><li>تعداد سفارشات و نمودار وضعیت شامل لغوشده‌ها هستند. مبلغ فروش، رتبه محصولات، خریداران و روش‌های ارسال از مبنای فروش انتخاب‌شده استفاده می‌کنند.</li><li>برند و دسته‌بندی با فهرست فعلی تطبیق داده می‌شوند؛ سابقه تغییرات آن‌ها ذخیره نشده است. محصولات حذف‌شده همچنان در رتبه‌بندی اقلام سفارش باقی می‌مانند.</li><li>نرخ تبدیل بازدید به خرید، سود خالص و مبلغ بازپرداخت بدون داده‌های بازدید، بهای تمام‌شده و تراکنش پرداخت قابل محاسبه نیستند.</li>{analytics.notices.filter(notice => /رکورد|قلم با/.test(notice)).map(notice => <li key={notice}>{notice}</li>)}</ul></details>
  </section>;
}
