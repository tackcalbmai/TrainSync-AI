drop function if exists public.consume_api_rate_limit(text, integer, integer);

revoke all on table public.api_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limit_buckets to authenticated;

create or replace function public.enforce_api_rate_limit_bucket_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_window_seconds integer;
  v_expected_bucket timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'SIGN_IN_REQUIRED' using errcode = '42501';
  end if;

  v_window_seconds := case new.endpoint
    when 'ai_workout_hour' then 3600
    when 'ai_workout_day' then 86400
    when 'ai_program_hour' then 3600
    when 'ai_program_day' then 86400
    else null
  end;
  if v_window_seconds is null then
    raise exception 'RATE_LIMIT_ENDPOINT_INVALID' using errcode = '22023';
  end if;

  v_expected_bucket := to_timestamp(
    floor(extract(epoch from v_now) / v_window_seconds) * v_window_seconds
  );

  if tg_op = 'INSERT' then
    new.user_id := v_user_id;
    if new.bucket_start is distinct from v_expected_bucket then
      raise exception 'RATE_LIMIT_BUCKET_INVALID' using errcode = '22023';
    end if;
    new.request_count := 1;
    new.created_at := v_now;
    new.updated_at := v_now;
    return new;
  end if;

  if old.user_id is distinct from v_user_id then
    raise exception 'RATE_LIMIT_ROW_FORBIDDEN' using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id
     or new.endpoint is distinct from old.endpoint
     or new.bucket_start is distinct from old.bucket_start then
    raise exception 'RATE_LIMIT_IDENTITY_IMMUTABLE' using errcode = '22023';
  end if;
  if old.bucket_start is distinct from v_expected_bucket then
    raise exception 'RATE_LIMIT_BUCKET_EXPIRED' using errcode = '22023';
  end if;

  new.request_count := old.request_count + 1;
  new.created_at := old.created_at;
  new.updated_at := v_now;
  return new;
end;
$$;

revoke all on function public.enforce_api_rate_limit_bucket_write() from public, anon, authenticated;

drop trigger if exists enforce_api_rate_limit_bucket_write on public.api_rate_limit_buckets;
create trigger enforce_api_rate_limit_bucket_write
before insert or update on public.api_rate_limit_buckets
for each row execute function public.enforce_api_rate_limit_bucket_write();

drop policy if exists api_rate_limit_select_own on public.api_rate_limit_buckets;
create policy api_rate_limit_select_own
on public.api_rate_limit_buckets
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists api_rate_limit_insert_own on public.api_rate_limit_buckets;
create policy api_rate_limit_insert_own
on public.api_rate_limit_buckets
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists api_rate_limit_update_own on public.api_rate_limit_buckets;
create policy api_rate_limit_update_own
on public.api_rate_limit_buckets
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists api_rate_limit_delete_expired_own on public.api_rate_limit_buckets;
create policy api_rate_limit_delete_expired_own
on public.api_rate_limit_buckets
for delete
to authenticated
using (
  user_id = auth.uid()
  and bucket_start < clock_timestamp() - interval '2 days'
);

create or replace function public.consume_ai_generation_limit(p_policy text)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz,
  hour_count integer,
  day_count integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_hour_endpoint text;
  v_day_endpoint text;
  v_hour_limit integer;
  v_day_limit integer;
  v_hour_bucket timestamptz;
  v_day_bucket timestamptz;
  v_hour_count integer;
  v_day_count integer;
begin
  if v_user_id is null then
    raise exception 'SIGN_IN_REQUIRED' using errcode = '42501';
  end if;

  case p_policy
    when 'workout_generation' then
      v_hour_endpoint := 'ai_workout_hour';
      v_day_endpoint := 'ai_workout_day';
      v_hour_limit := 20;
      v_day_limit := 60;
    when 'program_generation' then
      v_hour_endpoint := 'ai_program_hour';
      v_day_endpoint := 'ai_program_day';
      v_hour_limit := 6;
      v_day_limit := 20;
    else
      raise exception 'RATE_LIMIT_POLICY_UNKNOWN' using errcode = '22023';
  end case;

  v_hour_bucket := to_timestamp(floor(extract(epoch from v_now) / 3600) * 3600);
  v_day_bucket := to_timestamp(floor(extract(epoch from v_now) / 86400) * 86400);

  insert into public.api_rate_limit_buckets as bucket (
    user_id, endpoint, bucket_start, request_count, updated_at
  ) values (
    v_user_id, v_hour_endpoint, v_hour_bucket, 1, v_now
  )
  on conflict (user_id, endpoint, bucket_start)
  do update set request_count = bucket.request_count + 1, updated_at = excluded.updated_at
  returning request_count into v_hour_count;

  insert into public.api_rate_limit_buckets as bucket (
    user_id, endpoint, bucket_start, request_count, updated_at
  ) values (
    v_user_id, v_day_endpoint, v_day_bucket, 1, v_now
  )
  on conflict (user_id, endpoint, bucket_start)
  do update set request_count = bucket.request_count + 1, updated_at = excluded.updated_at
  returning request_count into v_day_count;

  delete from public.api_rate_limit_buckets
  where user_id = v_user_id
    and bucket_start < v_now - interval '2 days';

  return query select
    v_hour_count <= v_hour_limit and v_day_count <= v_day_limit,
    least(greatest(0, v_hour_limit - v_hour_count), greatest(0, v_day_limit - v_day_count)),
    case
      when v_day_count > v_day_limit then v_day_bucket + interval '1 day'
      else v_hour_bucket + interval '1 hour'
    end,
    v_hour_count,
    v_day_count;
end;
$$;

revoke all on function public.consume_ai_generation_limit(text) from public, anon;
grant execute on function public.consume_ai_generation_limit(text) to authenticated;

comment on function public.consume_ai_generation_limit(text) is
'Authenticated self-rate-limiter. Limits are hard-coded by policy; RLS and trigger rules prevent clients from reducing or resetting counters.';
