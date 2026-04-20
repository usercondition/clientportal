-- Marketplace inbox mirror (extension -> POST /api/admin/marketplace/sync).
-- Idempotent: safe to re-run.

create table if not exists marketplace_threads (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  platform_thread_id text not null,
  buyer_name text,
  snippet text,
  unread_count integer not null default 0 check (unread_count >= 0 and unread_count <= 999999),
  last_message_at timestamptz,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, platform_thread_id)
);

create index if not exists marketplace_threads_platform_last_idx
  on marketplace_threads (platform, last_message_at desc nulls last);

create table if not exists marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references marketplace_threads(id) on delete cascade,
  platform text not null,
  platform_message_id text not null,
  sender_label text,
  body text,
  sent_at timestamptz,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  unique (platform, platform_message_id)
);

create index if not exists marketplace_messages_thread_idx
  on marketplace_messages (thread_id);
