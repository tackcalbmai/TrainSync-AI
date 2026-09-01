alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_default_workout_minutes_check;

alter table public.athlete_profiles
  add constraint athlete_profiles_default_workout_minutes_check
  check (default_workout_minutes between 15 and 180);

alter table public.athlete_profiles alter column timezone set default 'UTC';
alter table public.workouts alter column timezone set default 'UTC';

create or replace function public.enforce_valid_timezone()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise check_violation using
      message = 'timezone must be a valid IANA timezone name',
      constraint = tg_table_name || '_timezone_check';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_valid_timezone() from public, anon;
grant execute on function public.enforce_valid_timezone() to authenticated;

drop trigger if exists athlete_profiles_valid_timezone on public.athlete_profiles;
create trigger athlete_profiles_valid_timezone
before insert or update of timezone on public.athlete_profiles
for each row execute function public.enforce_valid_timezone();

drop trigger if exists workouts_valid_timezone on public.workouts;
create trigger workouts_valid_timezone
before insert or update of timezone on public.workouts
for each row execute function public.enforce_valid_timezone();
