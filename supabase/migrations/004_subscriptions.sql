-- ListWise subscriptions + webhook idempotency (Stripe test/live).
-- Safe to run after 001–003. Only service role may write billing rows.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Subscriptions (one row per Supabase user)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'none'
    check (status in (
      'none',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'incomplete',
      'incomplete_expired',
      'paused'
    )),
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  has_used_trial boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id);
create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id);
create index if not exists subscriptions_stripe_subscription_id_idx
  on public.subscriptions (stripe_subscription_id);
create index if not exists subscriptions_status_idx
  on public.subscriptions (status);

alter table public.subscriptions enable row level security;

-- Users may read only their own row. No client writes.
drop policy if exists "Users can view own subscription" on public.subscriptions;
create policy "Users can view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Stripe webhook event log (idempotency)
-- ---------------------------------------------------------------------------
create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_type_idx
  on public.stripe_webhook_events (type);

alter table public.stripe_webhook_events enable row level security;
-- No policies for authenticated users — service role only.
