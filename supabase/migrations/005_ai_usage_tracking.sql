-- AI usage / cost tracking columns + tighten RLS so only service role writes.
-- Safe to run after 003 (and 004). Does not drop existing ai_generations rows.

alter table public.ai_generations
  add column if not exists input_tokens integer not null default 0
    check (input_tokens >= 0),
  add column if not exists output_tokens integer not null default 0
    check (output_tokens >= 0),
  add column if not exists total_tokens integer not null default 0
    check (total_tokens >= 0),
  add column if not exists estimated_cost_usd numeric(12, 6) not null default 0
    check (estimated_cost_usd >= 0);

create index if not exists ai_generations_model_idx
  on public.ai_generations (model);
create index if not exists ai_generations_status_idx
  on public.ai_generations (status);
create index if not exists ai_generations_estimated_cost_usd_idx
  on public.ai_generations (estimated_cost_usd);

-- Remove client write access. Usage rows are immutable audit data written
-- only by the server with the service role key.
drop policy if exists "Users can insert own AI generations" on public.ai_generations;

-- Users may still view their own rows (without an admin dashboard).
-- They cannot update or delete. No update/delete policies are created.
drop policy if exists "Users can view own AI generations" on public.ai_generations;
create policy "Users can view own AI generations"
  on public.ai_generations for select
  using (auth.uid() = user_id);

-- Explicit deny of updates/deletes for authenticated role (defense in depth).
drop policy if exists "Users cannot update AI generations" on public.ai_generations;
drop policy if exists "Users cannot delete AI generations" on public.ai_generations;
-- No update/delete policies → default deny under RLS for those commands.
