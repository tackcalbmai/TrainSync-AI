create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.athlete_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Europe/Riga',
  units text not null default 'metric' check (units in ('metric','imperial')),
  goal text,
  experience_level text check (experience_level in ('beginner','intermediate','advanced')),
  default_workout_minutes integer not null default 50 check (default_workout_minutes between 20 and 180),
  equipment text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_workout_id text not null,
  revision integer not null default 1 check (revision > 0),
  title text not null,
  sport text not null default 'strength',
  scheduled_date date,
  timezone text not null default 'Europe/Riga',
  estimated_duration_minutes integer check (estimated_duration_minutes between 1 and 360),
  status text not null default 'draft' check (status in ('draft','validated','published','failed','archived')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_workout_id, revision)
);

create table public.publication_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  provider text not null default 'garmin',
  idempotency_key text not null,
  provider_resource_id text,
  status text not null check (status in ('pending','published','failed')),
  error_code text,
  response_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table private.garmin_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'disconnected' check (status in ('disconnected','connected','expired','revoked')),
  scopes text[] not null default '{}',
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  expires_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.tool_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  tool_name text not null,
  target_id text,
  outcome text not null,
  correlation_id text,
  created_at timestamptz not null default now()
);

alter table public.athlete_profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.publication_attempts enable row level security;

create policy "profile_select_own" on public.athlete_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profile_insert_own" on public.athlete_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profile_update_own" on public.athlete_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "workouts_select_own" on public.workouts for select to authenticated using ((select auth.uid()) = user_id);
create policy "workouts_insert_own" on public.workouts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "workouts_update_own" on public.workouts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "workouts_delete_own" on public.workouts for delete to authenticated using ((select auth.uid()) = user_id);

create policy "publication_select_own" on public.publication_attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy "publication_insert_own" on public.publication_attempts for insert to authenticated with check ((select auth.uid()) = user_id);

-- New Supabase projects may not auto-expose SQL-created tables to the Data API.
-- Explicit grants are safe because RLS above still enforces row ownership.
grant usage on schema public to authenticated;
grant select, insert, update on public.athlete_profiles to authenticated;
grant select, insert, update, delete on public.workouts to authenticated;
grant select, insert on public.publication_attempts to authenticated;

revoke all on all tables in schema private from public, anon, authenticated;
