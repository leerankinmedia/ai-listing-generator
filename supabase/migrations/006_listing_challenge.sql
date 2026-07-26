-- ListWise 10-Day Listing Challenge progress (per user, cross-device).
-- Safe to run after 001–005.

create extension if not exists "pgcrypto";

create table if not exists public.listing_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  status text not null default 'inactive'
    check (status in ('inactive', 'active', 'paused', 'completed')),
  current_day integer not null default 1
    check (current_day >= 1 and current_day <= 10),
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  accumulated_pause_ms bigint not null default 0,
  timezone text not null default 'UTC',
  streak integer not null default 0,
  longest_streak integer not null default 0,
  day_states jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_challenges_user_id_idx
  on public.listing_challenges (user_id);
create index if not exists listing_challenges_status_idx
  on public.listing_challenges (status);

alter table public.listing_challenges enable row level security;

drop policy if exists "Users can view own listing challenge" on public.listing_challenges;
create policy "Users can view own listing challenge"
  on public.listing_challenges for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own listing challenge" on public.listing_challenges;
create policy "Users can insert own listing challenge"
  on public.listing_challenges for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own listing challenge" on public.listing_challenges;
create policy "Users can update own listing challenge"
  on public.listing_challenges for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own listing challenge" on public.listing_challenges;
create policy "Users can delete own listing challenge"
  on public.listing_challenges for delete
  using (auth.uid() = user_id);

drop trigger if exists listing_challenges_set_updated_at on public.listing_challenges;
create trigger listing_challenges_set_updated_at
  before update on public.listing_challenges
  for each row execute function public.set_updated_at();
