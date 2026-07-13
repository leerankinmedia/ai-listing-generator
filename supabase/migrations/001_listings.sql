-- ListWise Phase 2: listings schema for Supabase
-- Run in the Supabase SQL editor or via migrations.

create extension if not exists "pgcrypto";

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  description text not null default '',
  price numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  keywords text[] not null default '{}',
  specifics jsonb not null default '{}'::jsonb,
  images jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'listed', 'sold', 'delisted', 'error')),
  marketplace_listings jsonb not null default '[]'::jsonb,
  target_marketplaces text[] not null default '{}',
  ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_user_id_idx on public.listings (user_id);
create index if not exists listings_status_idx on public.listings (status);
create index if not exists listings_updated_at_idx on public.listings (updated_at desc);

alter table public.listings enable row level security;

create policy "Users can view own listings"
  on public.listings for select
  using (auth.uid() = user_id);

create policy "Users can insert own listings"
  on public.listings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own listings"
  on public.listings for update
  using (auth.uid() = user_id);

create policy "Users can delete own listings"
  on public.listings for delete
  using (auth.uid() = user_id);

-- Storage bucket for listing images (create via dashboard if needed)
-- insert into storage.buckets (id, name, public) values ('listing-images', 'listing-images', true);

create or replace function public.set_listings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists listings_set_updated_at on public.listings;
create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_listings_updated_at();
