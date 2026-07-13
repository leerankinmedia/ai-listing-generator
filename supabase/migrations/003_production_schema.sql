-- ListWise production schema: profiles, photos, marketplace connections,
-- inventory, AI generations, storage bucket + RLS.
-- Safe to run after 001_listings.sql and 002_listing_engine.sql.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (app user record linked to auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ensure listings engine columns exist (idempotent with 001/002)
-- ---------------------------------------------------------------------------
alter table public.listings
  add column if not exists field_confidence jsonb not null default '{}'::jsonb;
alter table public.listings
  add column if not exists comps jsonb;
alter table public.listings
  add column if not exists analysis_meta jsonb;

-- ---------------------------------------------------------------------------
-- Listing photos (normalized; listings.images jsonb remains for app reads)
-- ---------------------------------------------------------------------------
create table if not exists public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  storage_path text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_photos_listing_id_idx
  on public.listing_photos (listing_id);
create index if not exists listing_photos_user_id_idx
  on public.listing_photos (user_id);

alter table public.listing_photos enable row level security;

drop policy if exists "Users can view own listing photos" on public.listing_photos;
create policy "Users can view own listing photos"
  on public.listing_photos for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own listing photos" on public.listing_photos;
create policy "Users can insert own listing photos"
  on public.listing_photos for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own listing photos" on public.listing_photos;
create policy "Users can update own listing photos"
  on public.listing_photos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own listing photos" on public.listing_photos;
create policy "Users can delete own listing photos"
  on public.listing_photos for delete
  using (auth.uid() = user_id);

drop trigger if exists listing_photos_set_updated_at on public.listing_photos;
create trigger listing_photos_set_updated_at
  before update on public.listing_photos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Marketplace connections (encrypted credential payloads per user)
-- ---------------------------------------------------------------------------
create table if not exists public.marketplace_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null
    check (marketplace_id in (
      'ebay', 'poshmark', 'mercari', 'depop', 'grailed',
      'facebook_marketplace', 'etsy', 'vinted', 'whatnot'
    )),
  auth_method text not null check (auth_method in ('oauth', 'api_token')),
  account_label text,
  -- AES-GCM ciphertext produced by CONNECTIONS_SECRET (never store raw tokens)
  encrypted_payload text not null,
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, marketplace_id)
);

create index if not exists marketplace_connections_user_id_idx
  on public.marketplace_connections (user_id);

alter table public.marketplace_connections enable row level security;

drop policy if exists "Users can view own marketplace connections" on public.marketplace_connections;
create policy "Users can view own marketplace connections"
  on public.marketplace_connections for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own marketplace connections" on public.marketplace_connections;
create policy "Users can insert own marketplace connections"
  on public.marketplace_connections for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own marketplace connections" on public.marketplace_connections;
create policy "Users can update own marketplace connections"
  on public.marketplace_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own marketplace connections" on public.marketplace_connections;
create policy "Users can delete own marketplace connections"
  on public.marketplace_connections for delete
  using (auth.uid() = user_id);

drop trigger if exists marketplace_connections_set_updated_at on public.marketplace_connections;
create trigger marketplace_connections_set_updated_at
  before update on public.marketplace_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Inventory items
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  sku text,
  quantity integer not null default 1 check (quantity >= 0),
  location text,
  cost numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_user_id_idx
  on public.inventory_items (user_id);
create index if not exists inventory_items_listing_id_idx
  on public.inventory_items (listing_id);
create unique index if not exists inventory_items_user_listing_uidx
  on public.inventory_items (user_id, listing_id)
  where listing_id is not null;

alter table public.inventory_items enable row level security;

drop policy if exists "Users can view own inventory" on public.inventory_items;
create policy "Users can view own inventory"
  on public.inventory_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own inventory" on public.inventory_items;
create policy "Users can insert own inventory"
  on public.inventory_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own inventory" on public.inventory_items;
create policy "Users can update own inventory"
  on public.inventory_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own inventory" on public.inventory_items;
create policy "Users can delete own inventory"
  on public.inventory_items for delete
  using (auth.uid() = user_id);

drop trigger if exists inventory_items_set_updated_at on public.inventory_items;
create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- AI generation runs (audit / history)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  model text not null,
  images_analyzed integer not null default 0 check (images_analyzed >= 0),
  draft jsonb not null default '{}'::jsonb,
  status text not null default 'succeeded'
    check (status in ('succeeded', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ai_generations_user_id_idx
  on public.ai_generations (user_id);
create index if not exists ai_generations_listing_id_idx
  on public.ai_generations (listing_id);
create index if not exists ai_generations_created_at_idx
  on public.ai_generations (created_at desc);

alter table public.ai_generations enable row level security;

drop policy if exists "Users can view own AI generations" on public.ai_generations;
create policy "Users can view own AI generations"
  on public.ai_generations for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own AI generations" on public.ai_generations;
create policy "Users can insert own AI generations"
  on public.ai_generations for insert
  with check (auth.uid() = user_id);

-- Generations are immutable audit rows — no update/delete for authenticated users.

-- ---------------------------------------------------------------------------
-- Storage: public listing-images bucket + RLS policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read listing images" on storage.objects;
create policy "Public can read listing images"
  on storage.objects for select
  using (bucket_id = 'listing-images');

drop policy if exists "Users can upload listing images" on storage.objects;
create policy "Users can upload listing images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own listing images" on storage.objects;
create policy "Users can update own listing images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own listing images" on storage.objects;
create policy "Users can delete own listing images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
