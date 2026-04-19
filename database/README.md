# Database Setup (Live-Ready Foundation)

The app (`server.js`) uses PostgreSQL via **`DATABASE_URL`**. This folder holds migrations, seed data, and local Docker Postgres.

## What is included

- `database/migrations/001_init.sql`
  - Core tables: `clients`, `client_addresses`, `orders`, `order_timeline_events`, `message_threads`, `messages`, `admin_users`
  - Constraints, enums, and indexes for portal lookup and inbox performance
- `database/seed.sql`
  - Optional local demo seed data
- `docker-compose.db.yml`
  - Local PostgreSQL container

## Local quick start

1) Start PostgreSQL

```bash
docker compose -f docker-compose.db.yml up -d
```

2) Set connection URL

```bash
export DATABASE_URL="postgresql://clientportal:clientportal_dev_password@localhost:5432/clientportal"
```

PowerShell:

```powershell
$env:DATABASE_URL="postgresql://clientportal:clientportal_dev_password@localhost:5432/clientportal"
```

3) Apply migration

```bash
psql "$DATABASE_URL" -f database/migrations/001_init.sql
```

4) (Optional) Seed

```bash
psql "$DATABASE_URL" -f database/seed.sql
```

## How this maps to your portal

- Client sign-in lookup (`first name + last name + ZIP`) -> `clients` unique key
- Profile/address data -> `clients` + `client_addresses`
- Current/past orders and timeline -> `orders` + `order_timeline_events`
- Real admin inbox + replies -> `message_threads` + `messages`

## Railway — avoid public DB URL (egress)

Railway exposes a **public** Postgres endpoint as **`DATABASE_PUBLIC_URL`** (TCP proxy / `RAILWAY_TCP_PROXY_DOMAIN`). Traffic through that path can incur **egress** charges.

For **your Node web service talking to Postgres in the same Railway project**:

1. Open your **Web** service → **Variables**.
2. Add **`DATABASE_URL`** as a **variable reference** to the **Postgres** service.
3. Choose the Postgres variable that is the **private** connection — typically the main **`DATABASE_URL`** (or **`DATABASE_PRIVATE_URL`** if Railway shows that name on the database service). **Do not** reference **`DATABASE_PUBLIC_URL`** for app-to-DB traffic.
4. Redeploy the web service.

Use **`DATABASE_PUBLIC_URL`** only when something **outside** Railway’s private network must reach Postgres (e.g. a GUI on your laptop, or a build step that cannot use private networking).

If `DATABASE_URL` accidentally points at the public proxy, this repo’s server logs a one-line warning when the hostname looks like `*.proxy.rlwy.net`.

## Run the app with DB + API

1) Start Postgres (if not already running)

```bash
docker compose -f docker-compose.db.yml up -d
```

2) Copy env

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

3) Install dependencies and run server

```bash
npm install
npm run start
```

4) Open app

- [http://localhost:3000](http://localhost:3000)

This serves static pages and API from the same origin, so portal/admin calls are ready for live backend data.

