-- Idempotent patches for databases that already have core tables but predate the current column set.
-- Applied on every server start (and via npm run db:migrate) after 001_init.sql.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.client_addresses ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'US';

ALTER TABLE public.message_threads ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_ref text;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS admin_archived_at timestamptz;

ALTER TABLE public.message_threads ADD COLUMN IF NOT EXISTS admin_last_read_at timestamptz;
