-- ListWise Phase 3: production listing engine fields

alter table public.listings
  add column if not exists field_confidence jsonb not null default '{}'::jsonb;

alter table public.listings
  add column if not exists comps jsonb;

alter table public.listings
  add column if not exists analysis_meta jsonb;
