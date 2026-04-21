-- Quote + payment-review workflow for portal/admin order collaboration.

create table if not exists order_quote_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_index integer not null default 0 check (item_index >= 0),
  description text not null,
  unit text,
  quantity_requested integer not null default 1 check (quantity_requested >= 0),
  quantity_approved integer not null default 1 check (quantity_approved >= 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  is_included boolean not null default true,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_quote_items_order_idx
  on order_quote_items(order_id, item_index asc);

alter table orders add column if not exists quote_version integer not null default 0;
alter table orders add column if not exists quote_ready_at timestamptz;
alter table orders add column if not exists client_revision_at timestamptz;
alter table orders add column if not exists payment_method text;
alter table orders add column if not exists payment_fee_rate_bps integer not null default 0;
alter table orders add column if not exists payment_fee_cents integer not null default 0;
alter table orders add column if not exists payment_warning_ack_at timestamptz;
