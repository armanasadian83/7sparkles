# Deployment

Seven Sparkles runs as one Next.js Node application with a SQLite database and a persistent product-image directory. Start with one application instance on one machine. Keep the database on that machine's local persistent disk; do not place SQLite on a shared network filesystem or scale separate containers against independent copies. Move to a server database before a multi-server deployment.

## Requirements

- Node.js **22.13+**, preferably Node.js 24 LTS, and npm.
- A writable, persistent `DATA_DIR` that survives application updates.
- A public HTTPS domain and a reverse proxy supplied by the host or configured on the VPS.
- A private setup key for creating the first administrator.

A VPS supports this structure directly. A cPanel plan works only if it provides a compatible Node.js application runtime, environment variables, a way to install dependencies/build, and writable persistent storage. An ordinary PHP-only cPanel plan cannot run this backend. Do not use a static export for this application: the database, admin API, sessions, and image uploads need a running server.

## Environment

Configure these values in the host's environment manager, or a private `.env.local` file in the application root:

```dotenv
APP_URL=https://shop.example.com
DATA_DIR=/home/shop/seven-sparkles-data
ADMIN_SETUP_KEY=<a-long-random-secret>
```

Generate a setup secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set `NODE_ENV=production` in the process manager or cPanel application configuration. `APP_URL` must be the exact public origin, including `https://`, without a path. Configure the reverse proxy to preserve the original host and forward the original protocol. Never prefix private values with `NEXT_PUBLIC_`, commit the real environment file, or put secrets in Docker build arguments.

The local `npm run setup` helper generates `.env.local` for development. For a deployment, use the public HTTPS `APP_URL` and an absolute production `DATA_DIR` instead of copying development values unchanged. The setup form requires the configured key and stops accepting initial setup once an administrator exists. After setup, remove the key from the production environment and restart the app if you do not need to retain it for a fresh installation.

## VPS: normal Node.js process

Upload or check out the source, excluding `.env.local`, `node_modules`, `.next`, and local `data`. On the VPS:

```bash
npm ci --include=dev
npm run db:init
npm run build
npm start -- --hostname 127.0.0.1 --port 3000
```

Run the final command under the host's service manager so the process restarts after a reboot or crash. Its working directory must be the application root. Do not set `NEXT_STANDALONE` for this build.

Place nginx, Caddy, or the hosting provider's HTTPS proxy in front of port 3000. For nginx, the application location can use:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    client_max_body_size 6m;
}
```

The proxy body limit permits a 5 MiB image upload plus multipart overhead. Keep the Node port bound to loopback and use the HTTPS domain to access the shop.

After starting, visit `https://shop.example.com/admin/setup`. Enter the private setup key, administrator name, email, and a password of 12–128 characters; confirm the password. Setup creates the first administrator once and signs you into `/admin`. Use `/admin/login` for later visits. Add a product in the active state to show it publicly. A fresh installation has no sample products, orders, or customers.

## VPS: Docker Compose

Docker builds the Linux image itself; do not copy a Windows `node_modules` or a Windows standalone build into it. Create a private `.env` beside `compose.yaml` with:

```dotenv
APP_URL=https://shop.example.com
ADMIN_SETUP_KEY=<a-long-random-secret>
```

Then:

```bash
docker compose up -d --build
docker compose logs -f web
```

The supplied container uses Node 24 and Next's standalone output, runs as a non-root user, and publishes only `127.0.0.1:3000`. Put your HTTPS reverse proxy in front of it. The named `shop-data` volume stores `/app/data`, including the database and uploaded images. Do not remove that volume during updates.

The Docker build excludes secrets and development data. Environment values are supplied at runtime by Compose. Complete `/admin/setup` after the container starts.

To make a consistent database backup inside the container:

```bash
docker compose exec web node scripts/db-backup.mjs
```

Copy the generated backups, `/app/data/uploads`, and `/app/data/payment-receipts` off the machine as part of your backup schedule. Receipt images contain private payment information and must remain outside public web directories. Rebuilding or replacing `web` keeps the named volume. `docker compose down -v` deletes the volume and the shop's data; do not use it for routine updates.

## cPanel with Node.js support

The exact control names differ by host. Ask the provider to confirm a Node.js 22.13+ runtime, including the built-in `node:sqlite` module, before choosing a plan.

1. Upload the application source to the Node application's root. Keep the data directory outside the public web document root, for example `/home/ACCOUNT/seven-sparkles-data`.
2. Configure the Node application with production mode, the chosen domain, and startup file **`server.cjs`**. This file is for the full Node installation; do not use it with a standalone-only bundle.
3. Set `APP_URL`, `DATA_DIR`, and `ADMIN_SETUP_KEY` in the application's environment settings. Let the host supply `PORT`; set `HOSTNAME=127.0.0.1` if the host expects an explicit bind address. Do not set `NEXT_STANDALONE`.
4. In the Node application's activated terminal, run `npm ci --include=dev`, `npm run db:init`, and `npm run build`. Build tools are needed even when the host sets `NODE_ENV=production`. If a shared host cannot provide enough memory or time for a build, use a compatible Linux build environment with the same Node/runtime and confirm the host's supported deployment procedure.
5. Restart the Node app through cPanel, enable HTTPS for the domain, and complete `/admin/setup`.

Do not put the SQLite file, backups, environment files, or uploaded-file storage directly inside a PHP public directory. Product images are served by the application's media route. If a host cannot run the startup file or does not provide the required Node version, use a VPS or a Node-capable hosting plan.

## Backups, restore, and updates

Run `npm run db:backup` from the application root with the same production environment as the running application. It creates a uniquely named SQLite snapshot in `DATA_DIR/backups` using `VACUUM INTO`, which includes committed changes in the WAL. Back up `DATA_DIR/uploads`, `DATA_DIR/payment-receipts` and the private environment configuration separately. Store copies off the server and restrict access: backups include account/session data and private receipt images.

Do not copy only `store.sqlite` while the live app is writing: committed data may still be in `store.sqlite-wal`. For a restore, stop the app first, preserve the current data directory as a rollback copy, restore a snapshot as `store.sqlite`, and restore its corresponding uploads. Remove stale WAL/SHM sidecars from the restored copy before restarting. Ensure the application user owns the restored files. Restart, then check admin login and several product images.

For upgrades, make a backup, deploy the new code, install with `npm ci --include=dev`, run `npm run db:init` to apply versioned schema migrations, build, and restart. Preserve `DATA_DIR` and environment configuration. Keep a database backup with each release: reverting code alone does not reverse a schema migration.

## Current application boundaries

The product/catalog backend, admin management APIs, stored settings, administrator authentication, customer sessions, checkout orders and payment-receipt reviews use the database. The shopper cart and favorites remain browser-local. Checkout saves unpaid orders, and manual receipt approval confirms payment; online payment processing and an SMS provider are not connected. Customer order history at `/myorders` requires a server-verified customer session. Local OTP codes are available only under `next dev`; production customer login is unavailable until SMS delivery is connected. Immediate guest receipt upload uses an order-scoped capability valid for 24 hours, retained only in page memory. Customer sessions never grant administrator access. The admin revenue report distinguishes booked order value from manually approved payment, using the order date for the reporting period.

## References

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting) — Node deployment, reverse proxy, and runtime storage.
- [Next.js custom server](https://nextjs.org/docs/app/guides/custom-server) — custom startup entry points and the standalone restriction.
- [Node.js SQLite](https://nodejs.org/download/release/v22.13.1/docs/api/sqlite.html) — minimum-runtime database API.
- [SQLite VACUUM INTO](https://www.sqlite.org/lang_vacuum.html#vacuum_with_an_into_clause) — consistent live database snapshots.
