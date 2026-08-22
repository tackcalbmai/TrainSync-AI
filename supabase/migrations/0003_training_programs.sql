-- Multi-week evidence-constrained programming model.
-- Applied to production separately via Supabase migration tooling.

create table if not exists public.training_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  goal text not null check (goal in ('strength','hypertrophy','general_fitness','fat_loss','mixed')),
  status text not null default 'draft' check (status in ('draft','active','paused','completed','archived')),
  start_date date,
  duration_weeks integer not null check (duration_weeks between 1 and 52),
  days_per_week integer not null check (days_per_week between 1 and 7),
  default_session_minutes integer not null default 50 check (default_session_minutes between 15 and 240),
  progression_strategy text not null default 'double_progression' check (progression_strategy in ('double_progression','load_progression','autoregulated_strength','mixed')),
  priority jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  evidence_version text not null default '2026-08-22',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.program_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.training_programs(id) on delete cascade,
  week_index integer not null check (week_index between 1 and 52),
  day_index integer not null check (day_index between 1 and 7),
  slot_index integer not null default 1 check (slot_index between 1 and 4),
  scheduled_date date,
  title text not null,
  status text not null default 'planned' check (status in ('planned','generated','completed','skipped','moved','cancelled')),
  workout_id uuid references public.workouts(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  rationale jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, week_index, day_index, slot_index)
);

create table if not exists public.program_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.training_programs(id) on delete cascade,
  program_session_id uuid references public.program_sessions(id) on delete set null,
  workout_session_id uuid references public.workout_sessions(id) on delete set null,
  adjustment_type text not null,
  reason_code text not null,
  reason_text text not null,
  evidence_level text not null check (evidence_level in ('high','moderate','emerging','heuristic')),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists training_programs_user_status_idx
  on public.training_programs(user_id, status, updated_at desc);
create index if not exists program_sessions_user_date_idx
  on public.program_sessions(user_id, scheduled_date, status);
create index if not exists program_sessions_workout_id_idx
  on public.program_sessions(workout_id) where workout_id is not null;
create index if not exists program_adjustments_program_idx
  on public.program_adjustments(program_id, created_at desc);
create index if not exists program_adjustments_workout_session_idx
  on public.program_adjustments(workout_session_id) where workout_session_id is not null;

alter table public.training_programs enable row level security;
alter table public.program_sessions enable row level security;
alter table public.program_adjustments enable row level security;

drop policy if exists training_programs_select_own on public.training_programs;
create policy training_programs_select_own on public.training_programs
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists training_programs_insert_own on public.training_programs;
create policy training_programs_insert_own on public.training_programs
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists training_programs_update_own on public.training_programs;
create policy training_programs_update_own on public.training_programs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists training_programs_delete_own on public.training_programs;
create policy training_programs_delete_own on public.training_programs
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists program_sessions_select_own on public.program_sessions;
create policy program_sessions_select_own on public.program_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists program_sessions_insert_own on public.program_sessions;
create policy program_sessions_insert_own on public.program_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists program_sessions_update_own on public.program_sessions;
create policy program_sessions_update_own on public.program_sessions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists program_sessions_delete_own on public.program_sessions;
create policy program_sessions_delete_own on public.program_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists program_adjustments_select_own on public.program_adjustments;
create policy program_adjustments_select_own on public.program_adjustments
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists program_adjustments_insert_own on public.program_adjustments;
create policy program_adjustments_insert_own on public.program_adjustments
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- Prevent a user-owned child row from referencing another user's parent rows.
create or replace function private.enforce_program_child_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.training_programs p
    where p.id = new.program_id and p.user_id = new.user_id
  ) then
    raise exception 'PROGRAM_OWNERSHIP_MISMATCH';
  end if;

  if tg_table_name = 'program_sessions' and new.workout_id is not null and not exists (
    select 1 from public.workouts w
    where w.id = new.workout_id and w.user_id = new.user_id
  ) then
    raise exception 'WORKOUT_OWNERSHIP_MISMATCH';
  end if;

  if tg_table_name = 'program_adjustments' then
    if new.program_session_id is not null and not exists (
      select 1 from public.program_sessions s
      where s.id = new.program_session_id and s.program_id = new.program_id and s.user_id = new.user_id
    ) then
      raise exception 'PROGRAM_SESSION_OWNERSHIP_MISMATCH';
    end if;
    if new.workout_session_id is not null and not exists (
      select 1 from public.workout_sessions ws
      where ws.id = new.workout_session_id and ws.user_id = new.user_id
    ) then
      raise exception 'WORKOUT_SESSION_OWNERSHIP_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_program_child_ownership() from public, anon, authenticated;

drop trigger if exists enforce_program_sessions_ownership on public.program_sessions;
create trigger enforce_program_sessions_ownership
before insert or update on public.program_sessions
for each row execute function private.enforce_program_child_ownership();

drop trigger if exists enforce_program_adjustments_ownership on public.program_adjustments;
create trigger enforce_program_adjustments_ownership
before insert or update on public.program_adjustments
for each row execute function private.enforce_program_child_ownership();

grant select, insert, update, delete on public.training_programs to authenticated;
grant select, insert, update, delete on public.program_sessions to authenticated;
grant select, insert on public.program_adjustments to authenticated;
