-- eBay Marketplace Account Deletion compliance helpers.
-- Adds stable eBay identity fields for matching deletion notifications
-- without scanning OAuth token payloads.

alter table public.marketplace_connections
  add column if not exists external_user_id text;

alter table public.marketplace_connections
  add column if not exists external_username text;

create index if not exists marketplace_connections_ebay_external_user_id_idx
  on public.marketplace_connections (marketplace_id, external_user_id)
  where external_user_id is not null;

create index if not exists marketplace_connections_ebay_external_username_idx
  on public.marketplace_connections (marketplace_id, lower(external_username))
  where external_username is not null;

-- Audit log for deletion notifications (no PII / no tokens).
create table if not exists public.ebay_account_deletion_events (
  id uuid primary key default gen_random_uuid(),
  notification_id text,
  topic text,
  matched_connections integer not null default 0,
  processed_at timestamptz not null default now(),
  note text
);

create index if not exists ebay_account_deletion_events_processed_at_idx
  on public.ebay_account_deletion_events (processed_at desc);

alter table public.ebay_account_deletion_events enable row level security;
-- No authenticated-user policies — service role only.
