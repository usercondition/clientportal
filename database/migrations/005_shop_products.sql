-- Licensed mini shop catalog (Postgres source of truth for storefront + checkout).

create table if not exists shop_products (
  sku text primary key,
  name text not null,
  description text,
  vendor_slug text not null,
  vendor_label text not null,
  category text not null default 'general',
  search_text text not null default '',
  base_price_cents integer not null check (base_price_cents >= 0),
  price_cents integer not null check (price_cents >= 0),
  image_url text,
  gallery_urls jsonb not null default '[]'::jsonb,
  stock_qty integer check (stock_qty is null or stock_qty >= 0),
  active boolean not null default true,
  source_file text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_products_vendor_active_sort_idx
  on shop_products (vendor_slug, active, sort_order, sku);
