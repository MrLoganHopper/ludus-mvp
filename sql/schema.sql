-- Optional Supabase Postgres backing store for demo sessions.
-- Apply this in Supabase SQL Editor, and configure the server-only env vars.
create table if not exists public.playtest_sessions (
  id uuid primary key,
  game_id text not null,
  archetype_id text not null,
  fixture_id text not null,
  execution_mode text not null default 'demo' check (execution_mode='demo'),
  requested_run_count int not null default 1 check (requested_run_count between 1 and 100),
  video_id text,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz
);
alter table public.playtest_sessions enable row level security;
-- No public policies: server-only access via service-role key.
create index if not exists playtest_sessions_created_at_idx on public.playtest_sessions(created_at desc);

-- For pre-existing Supabase projects running v0.3:
alter table public.playtest_sessions add column if not exists video_id text;
