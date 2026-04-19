-- Optional seed data for local development.
-- Run after migration:
-- psql "$DATABASE_URL" -f database/seed.sql

insert into clients (id, first_name, last_name, email, phone, sign_in_zip)
values
  ('11111111-1111-1111-1111-111111111111', 'Alex', 'Rivera', 'alex@example.com', '555-123-4567', '60601')
on conflict do nothing;

insert into client_addresses (
  id, client_id, line_1, line_2, city, state, postal_code, country_code, is_default
)
values
  (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    '123 Main St',
    'Apt 4',
    'Chicago',
    'IL',
    '60601',
    'US',
    true
  )
on conflict do nothing;

insert into message_threads (id, client_id, subject, last_message_at)
values
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'General support',
    now()
  )
on conflict do nothing;

insert into messages (thread_id, sender, sender_ref, body, delivered_at)
values
  (
    '33333333-3333-3333-3333-333333333333',
    'system',
    'seed',
    'Welcome to your portal. This thread is ready for live messaging.',
    now()
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'client',
    '11111111-1111-1111-1111-111111111111',
    'Thanks, I can see my account details.',
    now()
  )
on conflict do nothing;

insert into orders (
  id,
  order_number,
  client_id,
  status,
  title,
  summary,
  subtotal_cents,
  tax_cents,
  shipping_cents,
  submitted_at
)
values
  (
    '44444444-4444-4444-4444-444444444444',
    'ORD-2026-1001',
    '11111111-1111-1111-1111-111111111111',
    'in_progress',
    'Premium resin set',
    'Initial run with metallic finish.',
    9800,
    784,
    500,
    now()
  )
on conflict do nothing;

insert into order_timeline_events (order_id, event_code, event_label, event_details, created_by)
values
  (
    '44444444-4444-4444-4444-444444444444',
    'submitted',
    'Order submitted',
    'Order received and queued for prep.',
    'system'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'in_progress',
    'In progress',
    'Casting started. Estimated completion in 3 days.',
    'admin'
  )
on conflict do nothing;

