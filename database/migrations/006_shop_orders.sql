-- Paid mini-shop orders from Stripe Checkout (webhook persistence).

create table if not exists shop_orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  customer_email text,
  customer_name text,
  currency text not null default 'usd',
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  status text not null default 'paid',
  line_items jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists shop_orders_created_idx on shop_orders (created_at desc);

create index if not exists shop_orders_email_idx on shop_orders (lower(customer_email));
