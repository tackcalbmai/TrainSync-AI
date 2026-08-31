create table if not exists public.api_rate_limit_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 1 and 80),
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, endpoint, bucket_start)
);

alter table public.api_rate_limit_buckets enable row level security;
revoke all on table public.api_rate_limit_buckets from anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_endpoint text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz,
  request_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_bucket_start timestamptz;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'SIGN_IN_REQUIRED' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^[a-z0-9_:-]{1,80}$' then
    raise exception 'RATE_LIMIT_ENDPOINT_INVALID' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'RATE_LIMIT_VALUE_INVALID' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 10 or p_window_seconds > 86400 then
    raise exception 'RATE_LIMIT_WINDOW_INVALID' using errcode = '22023';
  end if;

  v_bucket_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_limit_buckets as bucket (
    user_id, endpoint, bucket_start, request_count, updated_at
  ) values (
    v_user_id, p_endpoint, v_bucket_start, 1, v_now
  )
  on conflict (user_id, endpoint, bucket_start)
  do update set
    request_count = bucket.request_count + 1,
    updated_at = excluded.updated_at
  returning api_rate_limit_buckets.request_count into v_count;

  delete from public.api_rate_limit_buckets
  where user_id = v_user_id
    and bucket_start < v_bucket_start - interval '2 days';

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_bucket_start + make_interval(secs => p_window_seconds),
    v_count;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to authenticated;
