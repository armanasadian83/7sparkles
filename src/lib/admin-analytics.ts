import type { AdminOrder, AdminProduct, AdminSnapshot, OrderStatus } from "./admin-types";

export type AnalyticsRange = "7d" | "30d" | "90d" | "365d" | "all" | "custom";
export type AnalyticsOptions = { range: AnalyticsRange; from?: string; to?: string; basis: "orders" | "delivered"; now?: Date };
export type ComparisonMetric = { value: number; previous: number | null; change: number | null };
export type AnalyticsPeriod = { from: string; to: string; previousFrom: string | null; previousTo: string | null; label: string; previousLabel: string | null; bucket: "day" | "week" | "month"; error: string | null };
export type AnalyticsProduct = { id: string; name: string; brand: string; category: string; quantity: number; sales: number; orderCount: number; live: boolean };
export type AnalyticsSegment = { id: string; name: string; quantity: number; sales: number };
export type AnalyticsPoint = { key: string; label: string; sales: number; orderValue: number; orders: number; units: number; newCustomers: number; totalCustomers: number };
export type AdminAnalytics = {
  basis: AnalyticsOptions["basis"];
  period: AnalyticsPeriod;
  kpis: Record<"sales" | "orders" | "units" | "averageOrder" | "newCustomers" | "buyers", ComparisonMetric>;
  summary: { productSales: number; orderValue: number; shippingFees: number; discount: number; totalOrders: number; qualifiedOrders: number; knownUnpaidValue: number; knownUnpaidCount: number; unknownPaymentValue: number; unknownPaymentCount: number; cancelledValue: number; cancelledCount: number; confirmedRevenue: number | null };
  trend: AnalyticsPoint[];
  statuses: { id: OrderStatus; label: string; count: number; value: number }[];
  topProducts: AnalyticsProduct[];
  brands: AnalyticsSegment[];
  categories: AnalyticsSegment[];
  customers: { total: number; active: number; inactive: number; newCount: number; buyers: number; repeatBuyers: number; newBuyers: number; repeatRate: number };
  catalog: { total: number; active: number; draft: number; archived: number; lowStock: number; outOfStock: number; untracked: number; variants: number; stockUnits: number; lowStockProducts: { id: string; name: string; stock: number }[] };
  shipping: { id: string; name: string; count: number; value: number; fees: number; postpaid: boolean }[];
  notices: string[];
};

const DAY = 86_400_000;
const TIME_ZONE = "Asia/Tehran";
const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const clockParts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const dateLabel = new Intl.DateTimeFormat("fa-IR", { timeZone: TIME_ZONE, year: "numeric", month: "short", day: "numeric" });
const pointLabel = new Intl.DateTimeFormat("fa-IR", { timeZone: TIME_ZONE, month: "short", day: "numeric" });
const statusLabels: Record<OrderStatus, string> = { processing: "در حال پردازش", shipped: "ارسال‌شده", delivered: "تحویل‌شده", cancelled: "لغوشده" };

function dayKey(time: number) {
  const parts = dateParts.formatToParts(time);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function validDay(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (Number(value.slice(0, 4)) < 1900) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function addDays(day: string, amount: number) { return new Date(Date.parse(`${day}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10); }
function dayStart(day: string) {
  const nominal = Date.parse(`${day}T00:00:00Z`);
  const offset = (time: number) => {
    const pieces = clockParts.formatToParts(time);
    const get = (key: string) => Number(pieces.find(part => part.type === key)!.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - time;
  };
  const first = nominal - offset(nominal);
  return nominal - offset(first);
}
function timestamp(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return validDay(value) ? dayStart(value) : NaN;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !validDay(value.slice(0, 10))) return NaN;
  return Date.parse(value);
}
function periodLabel(from: string, to: string) { return `${dateLabel.format(dayStart(from) + 12 * 3_600_000)} تا ${dateLabel.format(dayStart(to) + 12 * 3_600_000)}`; }
function bucketKind(from: string, to: string): AnalyticsPeriod["bucket"] {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  return days <= 45 ? "day" : days <= 180 ? "week" : "month";
}

/** Calendar dates and period comparisons use Tehran days, independently of the server/browser timezone. */
export function getAnalyticsPeriod(snapshot: Pick<AdminSnapshot, "orders" | "users">, options: AnalyticsOptions): AnalyticsPeriod {
  const now = options.now?.getTime() ?? Date.now();
  const today = dayKey(Number.isFinite(now) ? now : Date.now());
  let from = addDays(today, -29);
  let to = today;
  let error: string | null = null;
  if (options.range === "custom") {
    if (!validDay(options.from) || !validDay(options.to)) error = "تاریخ شروع و پایان معتبر وارد کنید.";
    else if (options.from > options.to) error = "تاریخ شروع باید پیش از تاریخ پایان باشد.";
    else if (options.to > today) error = "تاریخ پایان نمی‌تواند در آینده باشد.";
    else { from = options.from; to = options.to; }
  } else if (options.range === "all") {
    for (const value of [...snapshot.orders.map(order => order.createdAt), ...snapshot.users.map(user => user.joinedAt)]) {
      const time = timestamp(value);
      if (Number.isFinite(time) && time < dayStart(addDays(today, 1))) {
        const key = dayKey(time);
        if (key < from) from = key;
      }
    }
  } else {
    const days = options.range === "7d" ? 7 : options.range === "90d" ? 90 : options.range === "365d" ? 365 : 30;
    from = addDays(today, 1 - days);
  }
  const duration = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  const previousTo = options.range === "all" || error ? null : addDays(from, -1);
  const previousFrom = previousTo ? addDays(previousTo, 1 - duration) : null;
  return { from, to, previousFrom, previousTo, label: periodLabel(from, to), previousLabel: previousFrom && previousTo ? periodLabel(previousFrom, previousTo) : null, bucket: bucketKind(from, to), error };
}

type OrderMeasure = { order: AdminOrder; time: number; productSales: number; orderValue: number; shippingFees: number; discount: number; units: number; items: AdminOrder["items"] };
function nonnegative(value: number) { return Number.isFinite(value) && value >= 0 ? value : 0; }
function measureOrder(order: AdminOrder): OrderMeasure {
  const items = order.items.filter(item => Number.isSafeInteger(item.quantity) && item.quantity > 0 && Number.isFinite(item.price) && item.price >= 0);
  const productSales = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingFees = order.checkout ? nonnegative(order.checkout.shipping.fee) : 0;
  return { order, time: timestamp(order.createdAt), productSales, shippingFees, orderValue: productSales + shippingFees, discount: order.checkout ? nonnegative(order.checkout.discount) : 0, units: items.reduce((sum, item) => sum + item.quantity, 0), items };
}
function qualifies(order: AdminOrder, basis: AnalyticsOptions["basis"]) { return basis === "delivered" ? order.status === "delivered" : order.status !== "cancelled"; }
function metric(value: number, previous: number | null): ComparisonMetric { return { value, previous, change: previous === null || previous === 0 ? null : (value - previous) / previous * 100 }; }
function aggregate(rows: OrderMeasure[]) {
  return rows.reduce((sum, row) => ({ sales: sum.sales + row.productSales, orderValue: sum.orderValue + row.orderValue, shipping: sum.shipping + row.shippingFees, discount: sum.discount + row.discount, units: sum.units + row.units }), { sales: 0, orderValue: 0, shipping: 0, discount: 0, units: 0 });
}

function inventory(products: AdminProduct[]): AdminAnalytics["catalog"] {
  const result: AdminAnalytics["catalog"] = { total: products.length, active: 0, draft: 0, archived: 0, lowStock: 0, outOfStock: 0, untracked: 0, variants: 0, stockUnits: 0, lowStockProducts: [] };
  for (const product of products) {
    result[product.status] += 1;
    result.variants += product.hasVariants ? product.variants.length : 0;
    if (product.status !== "active") continue;
    if (!product.trackStock) result.untracked += 1;
    const entries = product.hasVariants ? product.variants : [product];
    const available = entries.filter(entry => product.availability !== "out_of_stock" && entry.availability !== "out_of_stock" && (entry.availability === "preorder" || !product.trackStock || entry.stock > 0));
    if (!available.length) { result.outOfStock += 1; continue; }
    if (!product.trackStock) continue;
    const counted = entries.filter(entry => product.availability !== "out_of_stock" && entry.availability !== "out_of_stock" && entry.availability !== "preorder");
    const stock = counted.reduce((sum, entry) => sum + nonnegative(entry.stock), 0);
    result.stockUnits += stock;
    if (counted.length && stock > 0 && stock <= 5) { result.lowStock += 1; result.lowStockProducts.push({ id: product.id, name: product.name, stock }); }
  }
  result.lowStockProducts.sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, "fa"));
  return result;
}

function segments(products: AnalyticsProduct[], field: "brand" | "category") {
  const groups = new Map<string, AnalyticsSegment>();
  for (const product of products) {
    const name = product[field];
    const group = groups.get(name) ?? { id: name, name, quantity: 0, sales: 0 };
    group.quantity += product.quantity; group.sales += product.sales; groups.set(name, group);
  }
  return Array.from(groups.values()).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, "fa"));
}

function createBuckets(period: AnalyticsPeriod): { from: number; to: number; point: AnalyticsPoint }[] {
  const buckets: { from: number; to: number; point: AnalyticsPoint }[] = [];
  const endKey = addDays(period.to, 1);
  let cursor = period.from;
  const monthCount = (Number(period.to.slice(0, 4)) - Number(period.from.slice(0, 4))) * 12 + Number(period.to.slice(5, 7)) - Number(period.from.slice(5, 7)) + 1;
  const monthStep = Math.max(1, Math.ceil(monthCount / 120));
  while (cursor < endKey) {
    let next: string;
    if (period.bucket === "month") {
      const date = new Date(`${cursor}T12:00:00Z`);
      date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + monthStep);
      next = date.toISOString().slice(0, 10);
    } else next = addDays(cursor, period.bucket === "week" ? 7 : 1);
    if (next > endKey) next = endKey;
    const formatter = period.bucket === "month" ? dateLabel : pointLabel;
    const label = period.bucket === "day" ? formatter.format(dayStart(cursor) + 12 * 3_600_000) : `${formatter.format(dayStart(cursor) + 12 * 3_600_000)}–${formatter.format(dayStart(addDays(next, -1)) + 12 * 3_600_000)}`;
    buckets.push({ from: dayStart(cursor), to: dayStart(next), point: { key: cursor, label, sales: 0, orderValue: 0, orders: 0, units: 0, newCustomers: 0, totalCustomers: 0 } });
    cursor = next;
  }
  return buckets;
}

/** Builds aggregate admin measurements; never infers a payment from an order's fulfilment status. */
export function buildAdminAnalytics(snapshot: AdminSnapshot, options: AnalyticsOptions): AdminAnalytics {
  const period = getAnalyticsPeriod(snapshot, options);
  const suppliedNow = options.now?.getTime() ?? Date.now();
  const now = Number.isFinite(suppliedNow) ? suppliedNow : Date.now();
  const start = dayStart(period.from), end = dayStart(addDays(period.to, 1));
  const allRows = snapshot.orders.map(measureOrder);
  const validRows = allRows.filter(row => Number.isFinite(row.time) && row.time <= now);
  const current = period.error ? [] : validRows.filter(row => row.time >= start && row.time < end);
  const eligible = current.filter(row => qualifies(row.order, options.basis));
  const prior = period.previousFrom && period.previousTo ? validRows.filter(row => row.time >= dayStart(period.previousFrom!) && row.time < dayStart(addDays(period.previousTo!, 1))) : null;
  const priorEligible = prior?.filter(row => qualifies(row.order, options.basis)) ?? null;
  const total = aggregate(eligible), previous = priorEligible ? aggregate(priorEligible) : null;
  const usersWithDates = snapshot.users.map(user => ({ user, time: timestamp(user.joinedAt) }));
  const datedUsers = usersWithDates.filter(({ time }) => Number.isFinite(time) && time <= now);
  const newUsers = period.error ? 0 : datedUsers.filter(({ time }) => time >= start && time < end).length;
  const previousUsers = period.previousFrom && period.previousTo ? datedUsers.filter(({ time }) => time >= dayStart(period.previousFrom!) && time < dayStart(addDays(period.previousTo!, 1))).length : null;
  const buyerIds = new Set(eligible.map(row => row.order.userId));
  const priorBuyerIds = priorEligible ? new Set(priorEligible.map(row => row.order.userId)) : null;
  const firstOrder = new Map<string, number>();
  for (const row of validRows) if (qualifies(row.order, options.basis)) firstOrder.set(row.order.userId, Math.min(firstOrder.get(row.order.userId) ?? Infinity, row.time));
  let repeatBuyers = 0;
  for (const id of buyerIds) if ((firstOrder.get(id) ?? Infinity) < start) repeatBuyers += 1;
  const liveProducts = new Map(snapshot.products.map(product => [product.id, product]));
  const categoryNames = new Map(snapshot.categories.map(category => [category.id, category.name]));
  const ranked = new Map<string, AnalyticsProduct & { orders: Set<string> }>();
  for (const row of eligible) for (const item of row.items) {
    const live = liveProducts.get(item.productId);
    const value = ranked.get(item.productId) ?? { id: item.productId, name: item.name, brand: live?.brand || "برند نامشخص", category: live ? categoryNames.get(live.category) || live.categoryName || "دسته‌بندی نامشخص" : "دسته‌بندی نامشخص", quantity: 0, sales: 0, orderCount: 0, live: Boolean(live), orders: new Set<string>() };
    value.quantity += item.quantity; value.sales += item.price * item.quantity; value.orders.add(row.order.id); ranked.set(item.productId, value);
  }
  const topProducts = Array.from(ranked.values(), ({ orders, ...value }) => ({ ...value, orderCount: orders.size })).sort((a, b) => b.sales - a.sales || b.quantity - a.quantity || a.name.localeCompare(b.name, "fa"));
  const shippingGroups = new Map<string, AdminAnalytics["shipping"][number]>();
  for (const row of eligible) {
    const shipping = row.order.checkout?.shipping;
    const id = shipping ? `${shipping.id}:${shipping.postpaid ? "postpaid" : shipping.fee ? "paid" : "free"}` : "unknown";
    const group = shippingGroups.get(id) ?? { id, name: shipping?.name ?? "روش ارسال ثبت نشده", count: 0, value: 0, fees: 0, postpaid: shipping?.postpaid ?? false };
    group.count += 1; group.value += row.orderValue; group.fees += row.shippingFees; shippingGroups.set(id, group);
  }
  const unpaid = eligible.filter(row => row.order.checkout?.paymentStatus === "unpaid");
  const paid = eligible.filter(row => row.order.checkout?.paymentStatus === "paid");
  const unknown = eligible.filter(row => !row.order.checkout);
  const cancelled = current.filter(row => row.order.status === "cancelled");
  const buckets = createBuckets(period);
  for (const bucket of buckets) {
    if (period.error) continue;
    const bucketOrders = current.filter(row => row.time >= bucket.from && row.time < bucket.to);
    const chosen = bucketOrders.filter(row => qualifies(row.order, options.basis));
    const sums = aggregate(chosen);
    Object.assign(bucket.point, { sales: sums.sales, orderValue: sums.orderValue, orders: bucketOrders.length, units: sums.units, newCustomers: datedUsers.filter(({ time }) => time >= bucket.from && time < bucket.to).length, totalCustomers: datedUsers.filter(({ time }) => time < bucket.to).length });
  }
  const invalidDates = allRows.filter(row => !Number.isFinite(row.time)).length + usersWithDates.filter(({ time }) => !Number.isFinite(time)).length;
  const futureDates = allRows.filter(row => row.time > now).length + usersWithDates.filter(({ time }) => time > now).length;
  const malformedItems = snapshot.orders.reduce((sum, order) => sum + order.items.filter(item => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.price) || item.price < 0).length, 0);
  const notices = ["ارزش فروش، جمع مبلغ خالص اقلام سفارش است؛ هزینه ارسال جدا محاسبه می‌شود و به معنی دریافت وجه نیست.", "درآمد تاییدشده بر اساس رسیدهای تاییدشده توسط مدیریت است؛ وضعیت تحویل، اثبات پرداخت نیست. بازه زمانی بر اساس تاریخ سفارش است.", "برند و دسته‌بندی با کاتالوگ فعلی تطبیق داده می‌شوند؛ اطلاعات تاریخی آن‌ها ذخیره نشده است.", "تعداد و موجودی محصولات و کل کاربران، وضعیت فعلی پایگاه داده است و با بازه تاریخ محدود نمی‌شود."];
  if (period.to === dayKey(now)) notices.push("روز جاری هنوز کامل نشده است؛ مقایسه با دوره قبل، تقویمی و با دوره هم‌طول است.");
  if (invalidDates) notices.push(`${invalidDates} رکورد با تاریخ نامعتبر از محاسبات زمانی کنار گذاشته شد.`);
  if (futureDates) notices.push(`${futureDates} رکورد با تاریخ آینده از محاسبات زمانی کنار گذاشته شد.`);
  if (malformedItems) notices.push(`${malformedItems} قلم با تعداد یا قیمت نامعتبر از جمع اقلام کنار گذاشته شد.`);
  if (period.error) notices.push(period.error);
  return {
    basis: options.basis,
    period,
    kpis: { sales: metric(total.sales, previous?.sales ?? null), orders: metric(current.length, prior?.length ?? null), units: metric(total.units, previous?.units ?? null), averageOrder: metric(eligible.length ? total.sales / eligible.length : 0, priorEligible ? priorEligible.length ? previous!.sales / priorEligible.length : 0 : null), newCustomers: metric(newUsers, previousUsers), buyers: metric(buyerIds.size, priorBuyerIds?.size ?? null) },
    summary: { productSales: total.sales, orderValue: total.orderValue, shippingFees: total.shipping, discount: total.discount, totalOrders: current.length, qualifiedOrders: eligible.length, knownUnpaidValue: aggregate(unpaid).orderValue, knownUnpaidCount: unpaid.length, unknownPaymentValue: aggregate(unknown).orderValue, unknownPaymentCount: unknown.length, cancelledValue: aggregate(cancelled).orderValue, cancelledCount: cancelled.length, confirmedRevenue: paid.length ? aggregate(paid).orderValue : null },
    trend: buckets.map(bucket => bucket.point),
    statuses: (Object.keys(statusLabels) as OrderStatus[]).map(id => { const rows = current.filter(row => row.order.status === id); return { id, label: statusLabels[id], count: rows.length, value: aggregate(rows).orderValue }; }),
    topProducts, brands: segments(topProducts, "brand"), categories: segments(topProducts, "category"),
    customers: { total: snapshot.users.length, active: snapshot.users.filter(user => user.active).length, inactive: snapshot.users.filter(user => !user.active).length, newCount: newUsers, buyers: buyerIds.size, repeatBuyers, newBuyers: buyerIds.size - repeatBuyers, repeatRate: buyerIds.size ? repeatBuyers / buyerIds.size * 100 : 0 },
    catalog: inventory(snapshot.products), shipping: Array.from(shippingGroups.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fa")), notices,
  };
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  // Neutralize spreadsheet formula prefixes, including whitespace before them.
  const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
/** Aggregate export only: no customer names, phones, addresses or individual order identifiers. */
export function analyticsToCsv(analytics: AdminAnalytics) {
  const rows: unknown[][] = [["گزارش درآمد و سفارش‌ها"], ["از", analytics.period.from, "تا", analytics.period.to], ["مبنای فروش", analytics.basis === "delivered" ? "فقط تحویل‌شده" : "بدون لغوشده"], ["مقایسه با", analytics.period.previousLabel ?? "بدون مقایسه"], ["واحد مبالغ", "تومان"], ["توجه", "ارزش سفارش به معنی درآمد دریافت‌شده نیست"], [], ["شاخص", "مقدار", "دوره قبل", "تغییر درصد"]];
  const labels = { sales: "ارزش خالص اقلام", orders: "تمام سفارش‌ها", units: "تعداد اقلام", averageOrder: "میانگین خالص سفارش", newCustomers: "کاربران جدید", buyers: "خریداران یکتا" };
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) rows.push([labels[key], analytics.kpis[key].value, analytics.kpis[key].previous, analytics.kpis[key].change]);
  rows.push([], ["جمع ارزش سفارش‌ها", analytics.summary.orderValue], ["هزینه ارسال", analytics.summary.shippingFees], ["تخفیف ثبت‌شده", analytics.summary.discount], ["پرداخت‌نشده", analytics.summary.knownUnpaidValue], ["پرداخت نامشخص", analytics.summary.unknownPaymentValue], ["درآمد تأییدشده", analytics.summary.confirmedRevenue ?? "رسید تاییدشده موجود نیست"], [], ["شروع بازه", "برچسب", "ارزش خالص اقلام", "ارزش با ارسال", "تمام سفارش‌ها", "تعداد اقلام", "کاربران جدید", "کل کاربران تا پایان بازه"]);
  for (const point of analytics.trend) rows.push([point.key, point.label, point.sales, point.orderValue, point.orders, point.units, point.newCustomers, point.totalCustomers]);
  rows.push([], ["محصول", "برند فعلی", "دسته‌بندی فعلی", "تعداد", "ارزش خالص اقلام", "سفارش‌ها"]);
  for (const product of analytics.topProducts) rows.push([product.name, product.brand, product.category, product.quantity, product.sales, product.orderCount]);
  rows.push([], ["وضعیت سفارش", "تعداد", "ارزش با ارسال"]);
  for (const status of analytics.statuses) rows.push([status.label, status.count, status.value]);
  rows.push([], ["روش ارسال", "سفارش‌ها", "هزینه ارسال", "پس‌کرایه"]);
  for (const method of analytics.shipping) rows.push([method.name, method.count, method.fees, method.postpaid ? "بله" : "خیر"]);
  rows.push([], ["یادداشت‌های محاسبات"]);
  for (const notice of analytics.notices) rows.push([notice]);
  return `\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}`;
}
