# Seven Sparkles

A Persian skincare storefront and admin panel built with Next.js, TypeScript, SQLite, RTL layouts, and the locally hosted Vazirmatn font.

## Run locally

Use **Node.js 22.13 or newer**; Node.js 24 LTS is recommended. SQLite is included with Node, so no separate database service is needed.

```bash
npm ci
npm run setup
npm run db:init
npm run dev
```

Open [localhost:3000](http://localhost:3000). The database starts with **no products, orders, or customers**. Previous browser-local admin demo records are not imported.

Open [localhost:3000/admin/setup](http://localhost:3000/admin/setup), enter the `ADMIN_SETUP_KEY` from the private `.env.local` file created by `npm run setup`, and choose your administrator name, email, and password (12–128 characters, entered twice). Setup signs you into `/admin`; use `/admin/login` on later visits. To display the setup key intentionally in your own terminal, run `npm run setup -- --show-key`.

`npm run setup` does not overwrite an existing real setup key. Restart a development server that was already running before the configuration was created. Keep `.env.local` private. See [DEPLOYMENT.md](DEPLOYMENT.md) for VPS, Docker, and cPanel setup.

```bash
npm run lint
npm run build
npm run test:backend
npm run test:analytics
npm run test:customer-auth
npm run test:payment-receipts
npm run test:inventory
```

Backend tests start their own local production server and disposable database. They verify migrations, access control, image validation, product metadata and variations, safe rich text, publishing, settings, session expiry, and persistence across a restart without changing the working database.

## Storefront

The storefront and admin share a theme icon that switches directly between **روشن** and **تیره** with one click. The browser remembers this choice across routes, refreshes and tabs; the default is light. A small head script applies the theme before the first paint without making the root layout dynamic. Product photographs retain their original colors in both themes.

Typography shares a readable minimum across the storefront and admin: `--text-caption` is 14px for compact labels and chart axes, `--text-small` / `--text-label` are 15px for helper text and labels, and `--text-body` is 16px for body text and form fields. Mobile layouts wrap rather than reducing these sizes. Secondary copy uses the theme-aware `--muted` color, while `--gold-ink` provides a darker gold for small text in the light theme. Brand artwork and registered-mark glyphs keep their original proportions.

The storefront reads active products from the database. Category filters, search, product details, favorites, quantity controls, and the shopping list use this real catalog. Cart and favorite selections remain in the visitor's browser.

The homepage banner has three night-galaxy slides. Use the arrows, slide indicators, a mouse drag, or a horizontal touch swipe to browse. While the banner is focused, arrow keys and Home/End also navigate. Star dots drift independently; nearby dots glow and ease away from the cursor with a slight individual lag, then gradually settle back. Mouse hover also activates a gentle zoom/parallax. Animation pauses offscreen or in a hidden tab, and reduced-motion preferences disable movement. Slides do not advance automatically.

The longer homepage adds concern-led discovery, day/night routine steps, an ingredient explorer, three short reading guides, shopping FAQs, and a closing galaxy campaign. Concern and ingredient links use exactly the same search matching as `/shop`, choosing a matching Persian or English term from the current catalog; displayed counts are database-backed. Reading guides open accessible dialogs rather than linking to nonexistent blog pages. The support CTA calls the configured store phone, or opens the existing selection guide when no phone is configured. New photography is decorative editorial imagery, not seeded merchandise or customer testimonials. Product cards, prices, inventory and cart actions continue to use the real catalog.

The cart links to `/checkout`, where customers enter recipient and delivery details and choose a database-configured shipping method. The server checks current prices, quantities and shipping fees before saving an unpaid order for admin review. Below the order confirmation, customers can upload a payment-receipt image for manual review. Online payment processing and real SMS delivery are not connected; no sample records are generated.

## Product pages and slugs

Published products have a database-backed page at `/product/{slug}`. Enter a **required, unique slug manually** in the admin editor, including when saving a draft. Slugs support lowercase English or Persian/Arabic letters, digits, and single hyphens between words; the server trims whitespace, normalizes Unicode, and lowercases English letters. Changing a slug changes the public URL. Existing products receive `product-{id}` slugs during migration, with normalized IDs and numeric suffixes when needed to avoid collisions. Draft and archived products are unavailable on public product routes.

Product pages display the stored gallery, descriptions, pricing, inventory, options, specifications, usage instructions, suitability, and shipping/return text. Hover over the main image to zoom. **افزودن به سبد خرید** adds the selected variant and quantity to the cart using current catalog prices and stock limits.

Reviews are read-only and come from published rows in the database. Pending reviews stay private, and ratings/counts are calculated from published reviews only. No example reviews or ratings are generated; submitting and moderating reviews will be connected later.

## Admin management

The protected Persian admin panel reads products, orders, customers, and settings from SQLite. Open `/admin/products/new` to add a product or choose Edit in the product list to open `/admin/products/[id]/edit`. The editor saves the name, short description, formatted full description, category, brand, tags, attributes, SKU, pricing, inventory, and variations together. Full descriptions are sanitized on the server before storage.

The **درآمد** tab at `/admin?section=revenue` analyzes stored orders, customers and the current catalog. It includes date filters, previous-period comparisons, sales and customer trends, product rankings by quantity or value, order statuses, shipping, inventory and aggregate CSV export. Calendar boundaries use `Asia/Tehran`. Sales values use saved order-item prices after discounts, with shipping shown separately; cancelled orders are excluded from sales. A delivered-only basis is also available. Current catalog and customer totals remain all-time counts, independent of the order-date filter.

Booked sales are not confirmed receipts. New checkouts are explicitly unpaid, and legacy orders without payment information have an unknown payment state. Approving a payment receipt marks its order paid; reversing every approval returns it to unpaid. The revenue report includes each paid order once and uses the order date for reporting periods. It never treats delivery or a missing payment state as proof of payment. Brand/category breakdowns use the current catalog because historical taxonomy was not saved. Visitor conversion, profit and refunds are not estimated from order records.

Upload up to 10 JPEG, PNG, or WebP images, each at most 5 MB. Images are normalized to WebP and stored under `DATA_DIR/uploads`; the first gallery image is the main image. Each image can have its own alternative text and caption. Moving an image to the first position updates the storefront image on the next catalog refresh.

A product with a name and unique slug can be saved as a draft before it has an image. Published products require an image; variable products also require all option combinations to be generated. Draft and archived products stay out of the public catalog. A sale price must be less than the regular price. An empty price means customers should inquire rather than add that item to the basket.

Inventory can be tracked by quantity or managed using availability alone. Out-of-stock products cannot be added to the basket. Preorders and products without quantity tracking allow up to 99 units per basket item. For variable products, define up to three options and generate up to 50 combinations; each combination has its own SKU, price, quantity, and availability. A variant must be selected before it can be added to the basket, and its price takes precedence over the product-level price or discount. A variant's availability controls its own stock behavior; setting the entire product out of stock blocks every variant.

Submitting an order immediately deducts its tracked product or selected-variant quantities in the same database transaction that saves the unpaid order. Retries never deduct twice, and competing checkouts cannot buy the same final units. Cancelling adds back exactly the quantities that order deducted, preserving later sales and manual stock changes; repeated cancellation has no additional effect. Reopening a cancelled order deducts those quantities again and fails without changing the order if stock is insufficient. Preorders and products without quantity tracking do not change numeric stock. Orders created before this inventory feature retain their original behavior: cancellation does not credit stock that was never deducted. Restore a missing original product or variant before changing an order's inventory-related status.

`DATA_DIR` defaults to `./data` and contains `store.sqlite`, `uploads/`, `payment-receipts/`, and `backups/`. Set an absolute persistent path in production. Schema migrations are applied automatically. Back up the database with `npm run db:backup` and back up both uploaded-file directories separately. Deployment, backup, restore, and update instructions are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Payment receipts

Customers can upload one JPEG, PNG or WebP image at a time, up to 5 MiB per image. Each order can have only one receipt awaiting review; rejected receipts remain in its history without preventing another attempt. Upload attempts are rate limited. Images are verified, stripped of metadata, and normalized to WebP under private `DATA_DIR/payment-receipts`. They are never served through the public product-media route or image optimizer. Immediate guest checkout receives a random order-scoped upload/read capability, valid for 24 hours and held only in page memory. Returning customers use their verified account at `/myorders`; another customer's order number alone never grants access.

The **رسیدهای پرداخت** admin tab at `/admin?section=payment-receipts` supports order-number search, status filters, private previews, approval/rejection and a customer-visible review note. Receipts begin **در انتظار بررسی**; reviewers can choose **تایید شده** or **عدم تایید** and revise decisions later. After upload, the uploader stays hidden and the server blocks another submission while any receipt is pending or approved. Rejection shows the uploader again, allowing a replacement; the review history remains visible. Approval changes payment status independently of fulfillment status. This is manual payment confirmation, not a bank or payment-gateway integration.

## Customer login and order history

The homepage **ورود** button opens [localhost:3000/login](http://localhost:3000/login). Enter an Iranian mobile number beginning with `09`. Persian and Arabic numerals are supported.

A random six-digit code is generated and verified on the server. In `npm run dev`, the development code is displayed on the login page; it expires after two minutes, supports resend after 30 seconds, and locks after five incorrect attempts. Verification creates a customer session in an HttpOnly cookie. Customer phone numbers, order details and session tokens are not stored in localStorage. Previous browser-only demo sessions no longer grant account access.

The development code is never issued or accepted in production. Production customer login returns an unavailable message until a real SMS provider is connected at the delivery boundary in `src/server/customer-auth.ts`. Administrator login is independent and continues to work normally.

Signed-in customers can open `/myorders` through **سفارشات من**. Each order expands to show its saved items, quantities, prices, delivery details and payment state. The private API checks the server session and returns only that customer's orders, with pagination and no shared caching. Active-account checks, expiry and logout are enforced by the server. Checkout assigns signed-in orders to the submitting account even when the delivery recipient has a different phone number; guest orders remain associated with their original customer record.

The product catalog is managed through the admin panel rather than a source-code sample array. Existing packshot files remain available as image choices, not seeded products.

## Assets

Product packshot source URLs are recorded in [public/images/products/sources.json](public/images/products/sources.json).

The following images were created or edited with built-in ImageGen:

- `public/images/hero-celestial.png` — reference product packaging on light travertine with clouds and gold orbits; quiet space on the right accommodates native page text.
- `public/images/hero-galaxy-midnight.png`, `hero-galaxy-aurora.png`, `hero-galaxy-violet.png` — nighttime variants created with built-in ImageGen. Prompt direction: preserve the supplied skincare packaging on pale moonlit stone at left; midnight navy sky, indigo/violet or cyan nebulae, gold star orbits, and a calm dark right half; no interface text or controls in the artwork. Original daylight artwork is retained.
- `public/images/routine-celestial.png` — pearl and lavender silk, travertine, crystal, and gold orbits.
- `public/images/seven-sparkles-boutique.png` — enhanced version of the supplied shop photo with its video badge removed.
- `public/images/login-celestial.png` — a crystal orb with gold star orbits, ivory travertine, and champagne/lilac silk, generated with the built-in ImageGen tool for the login screen.
- `public/images/home-hydration.webp`, `home-ritual.webp`, `home-ingredients.webp` — new built-in ImageGen editorial photography for concern discovery, day/night routines and ingredients. Prompts specified clear serum textures, cream travertine, sage/lavender silk, soft natural daylight and restrained gold celestial accents, without labels, UI or text.
- `public/images/home-reading-label.webp`, `home-reading-routine.webp`, `home-reading-first-use.webp` — built-in ImageGen reading-room photographs: an adult hand holding a blank amber dropper bottle, cream in a clear glass dish, and a folded ivory towel with an unlabelled frosted bottle. Prompts used the same stone, sage and warm-light direction, without branding or UI text.
- `public/images/home-cosmic-portrait.webp` — built-in ImageGen wide night-sky campaign photograph with an adult woman's profile at left, fine gold orbital arcs and calm navy space at right for native page text. Generated photographs are optimized as WebP; original generation files remain outside the project.

The original shop photo is retained at `public/images/seven-sparkles-shop.png`. The Vazirmatn font license is included at [public/fonts/Vazirmatn-OFL.txt](public/fonts/Vazirmatn-OFL.txt).
