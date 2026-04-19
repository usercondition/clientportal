# Database Setup (Live-Ready Foundation)

This project is currently static frontend + local browser storage.  
This database package gives you a production-ready PostgreSQL schema so you can wire real APIs next.

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

## Next implementation step

Build API routes/services that replace browser storage in:

- `portal-data.js`
- `message-bus.js`

Use database IDs and server auth/session for both client portal and admin portal.

