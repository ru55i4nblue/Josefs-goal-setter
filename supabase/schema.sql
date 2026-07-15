-- Goal Setter — Supabase schema
-- Run once in your project's SQL Editor (Supabase dashboard → SQL Editor → Run).

-- One JSON blob of app state per user.
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: each user can only see/modify their own row.
alter table public.user_state enable row level security;

drop policy if exists "own state" on public.user_state;
create policy "own state" on public.user_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Enable realtime so other devices get live updates.
alter publication supabase_realtime add table public.user_state;
