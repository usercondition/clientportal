-- PostgreSQL initial schema for client portal.
-- Run with: psql "$DATABASE_URL" -f database/migrations/001_init.sql

create extension if not exists pgcrypto;

create type order_status as enum (
  'draft',
  'submitted',
  'in_progress',
  'awaiting_client',
  'fulfilled',
  'cancelled'
);

create type message_sender as enum ('client', 'admin', 'system');

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  sign_in_zip text not null check (sign_in_zip ~ '^[0-9]{5}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lower(first_name), lower(last_name), sign_in_zip)
);

create table if not exists client_addresses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  line_1 text not null,
  line_2 text,
  city text not null,
  state text not null check (state ~ '^[A-Z]{2}$'),
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  country_code text not null default 'US',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists client_addresses_one_default_idx
  on client_addresses(client_id)
  where is_default = true;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  client_id uuid not null references clients(id) on delete restrict,
  status order_status not null default 'submitted',
  title text not null,
  summary text,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer generated always as (subtotal_cents + tax_cents + shipping_cents) stored,
  submitted_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_client_created_idx
  on orders(client_id, created_at desc);

create table if not exists order_timeline_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  event_code text not null,
  event_label text not null,
  event_details text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists order_timeline_order_created_idx
  on order_timeline_events(order_id, created_at desc);

create table if not exists message_threads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  subject text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads(id) on delete cascade,
  sender message_sender not null,
  sender_ref text,
  body text not null,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_thread_created_idx
  on messages(thread_id, created_at desc);

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  role text not null default 'owner',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

