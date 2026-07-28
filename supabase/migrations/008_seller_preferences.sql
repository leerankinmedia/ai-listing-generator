-- Seller eBay defaults (handling, shipping, returns, offers, promoted listings).
-- One row per user; ListWise applies these to every new listing.
-- Run this in the production Supabase SQL editor if the table is missing.
-- After create, refresh PostgREST schema cache (see NOTIFY at bottom).

create table if not exists public.seller_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  ebay_defaults jsonb not null default '{}'::jsonb,
  setup_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seller_preferences_updated_at_idx
  on public.seller_preferences (updated_at desc);

alter table public.seller_preferences enable row level security;

drop policy if exists "Users can view own seller preferences" on public.seller_preferences;
create policy "Users can view own seller preferences"
  on public.seller_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own seller preferences" on public.seller_preferences;
create policy "Users can insert own seller preferences"
  on public.seller_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own seller preferences" on public.seller_preferences;
create policy "Users can update own seller preferences"
  on public.seller_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own seller preferences" on public.seller_preferences;
create policy "Users can delete own seller preferences"
  on public.seller_preferences for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.seller_preferences to authenticated;
grant all on table public.seller_preferences to service_role;

drop trigger if exists seller_preferences_set_updated_at on public.seller_preferences;
create trigger seller_preferences_set_updated_at
  before update on public.seller_preferences
  for each row execute function public.set_updated_at();

-- Force PostgREST (Supabase API) to reload the schema cache so
-- /rest/v1/seller_preferences resolves immediately after this migration.
notify pgrst, 'reload schema';
