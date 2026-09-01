alter table public.workout_sessions
  add column if not exists completion_key uuid,
  add column if not exists completion_fingerprint text;

alter table public.workout_sessions
  drop constraint if exists workout_sessions_completion_fingerprint_check,
  add constraint workout_sessions_completion_fingerprint_check
    check (completion_fingerprint is null or completion_fingerprint ~ '^[0-9a-f]{32}$'),
  drop constraint if exists workout_sessions_completed_after_started_check,
  add constraint workout_sessions_completed_after_started_check
    check (completed_at is null or completed_at >= started_at);

create unique index if not exists workout_sessions_user_completion_key_uidx
  on public.workout_sessions (user_id, completion_key)
  where completion_key is not null;

create or replace function public.complete_workout_session(
  p_completion_key uuid,
  p_workout_id uuid,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_duration_seconds integer,
  p_notes text,
  p_actual_sets jsonb
)
returns table(workout_session_id uuid, duplicate boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_workout public.workouts%rowtype;
  v_existing_id uuid;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_workout_session_id uuid;
  v_item jsonb;
  v_plan_exercise jsonb;
  v_plan_set jsonb;
  v_exercise_order integer;
  v_set_index integer;
  v_metric text;
  v_reps integer;
  v_duration integer;
  v_weight numeric;
  v_rpe numeric;
  v_rir numeric;
  v_is_warmup boolean;
  v_exercise_key text;
  v_client_exercise_key text;
  v_exercise_name text;
  v_prescribed_set_count integer;
  v_total_sets integer;
  v_total_volume numeric := 0;
begin
  if v_user_id is null then raise exception 'SIGN_IN_REQUIRED'; end if;
  if p_completion_key is null then raise exception 'COMPLETION_KEY_REQUIRED'; end if;
  if p_workout_id is null then raise exception 'WORKOUT_REQUIRED'; end if;
  if p_started_at is null or p_completed_at is null or p_completed_at < p_started_at then
    raise exception 'SESSION_TIME_INVALID';
  end if;
  if p_duration_seconds is null or p_duration_seconds < 0 or p_duration_seconds > 86400 then
    raise exception 'SESSION_DURATION_INVALID';
  end if;
  if p_actual_sets is null or jsonb_typeof(p_actual_sets) <> 'array' then
    raise exception 'COMPLETED_SETS_REQUIRED';
  end if;
  v_total_sets := jsonb_array_length(p_actual_sets);
  if v_total_sets < 1 or v_total_sets > 200 then raise exception 'COMPLETED_SET_COUNT_INVALID'; end if;
  if exists (
    select 1
    from jsonb_array_elements(p_actual_sets) item(value)
    group by item.value->>'exerciseOrder', item.value->>'setIndex'
    having count(*) > 1
  ) then raise exception 'DUPLICATE_ACTUAL_SET_POSITION'; end if;

  v_fingerprint := md5(concat_ws('|',
    p_workout_id::text,
    p_started_at::text,
    p_completed_at::text,
    p_duration_seconds::text,
    trim(coalesce(p_notes, '')),
    p_actual_sets::text
  ));

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_completion_key::text, 0));
  select ws.id, ws.completion_fingerprint
    into v_existing_id, v_existing_fingerprint
  from public.workout_sessions ws
  where ws.user_id = v_user_id and ws.completion_key = p_completion_key
  limit 1;
  if v_existing_id is not null then
    if v_existing_fingerprint is distinct from v_fingerprint then raise exception 'COMPLETION_REPLAY_CONFLICT'; end if;
    return query select v_existing_id, true;
    return;
  end if;

  select w.* into v_workout
  from public.workouts w
  where w.id = p_workout_id and w.user_id = v_user_id
  for update;
  if not found then raise exception 'WORKOUT_NOT_FOUND'; end if;
  if v_workout.status = 'completed' then raise exception 'WORKOUT_ALREADY_COMPLETED'; end if;

  insert into public.workout_sessions (
    user_id, workout_id, title, started_at, completed_at, duration_seconds,
    status, notes, total_sets, total_volume_kg, source,
    completion_key, completion_fingerprint, updated_at
  ) values (
    v_user_id, v_workout.id, v_workout.title, p_started_at, p_completed_at, p_duration_seconds,
    'completed', nullif(trim(coalesce(p_notes, '')), ''), v_total_sets, 0, 'trainsync',
    p_completion_key, v_fingerprint, now()
  ) returning id into v_workout_session_id;

  for v_item in select value from jsonb_array_elements(p_actual_sets)
  loop
    begin v_exercise_order := (v_item->>'exerciseOrder')::integer; exception when others then v_exercise_order := null; end;
    begin v_set_index := (v_item->>'setIndex')::integer; exception when others then v_set_index := null; end;
    if v_exercise_order is null or v_exercise_order < 1 or v_set_index is null or v_set_index < 1 then
      raise exception 'SET_POSITION_INVALID';
    end if;

    v_plan_exercise := v_workout.payload->'exercises'->(v_exercise_order - 1);
    v_plan_set := v_plan_exercise->'sets'->(v_set_index - 1);
    if v_plan_exercise is null then raise exception 'PLAN_EXERCISE_NOT_FOUND'; end if;
    if v_plan_set is null then raise exception 'PLAN_SET_NOT_FOUND'; end if;

    v_prescribed_set_count := jsonb_array_length(coalesce(v_plan_exercise->'sets', '[]'::jsonb));
    v_client_exercise_key := nullif(trim(v_item->>'exerciseKey'), '');
    v_exercise_key := coalesce(nullif(trim(v_plan_exercise->>'exerciseKey'), ''), v_client_exercise_key);
    if v_exercise_key is null then raise exception 'EXERCISE_KEY_REQUIRED'; end if;
    if nullif(trim(v_plan_exercise->>'exerciseKey'), '') is not null
      and v_client_exercise_key is not null
      and v_client_exercise_key <> v_exercise_key then
      raise exception 'EXERCISE_IDENTITY_MISMATCH';
    end if;
    v_exercise_name := coalesce(nullif(trim(v_plan_exercise->>'name'), ''), nullif(trim(v_item->>'exerciseName'), ''), 'Exercise');
    v_metric := coalesce(nullif(v_plan_set->>'metricType', ''), nullif(v_plan_exercise->>'setMetric', ''), nullif(v_item->>'metricType', ''), 'reps');
    if v_metric not in ('reps', 'duration_seconds') then raise exception 'SET_METRIC_INVALID'; end if;

    begin v_reps := nullif(v_item->>'reps', '')::integer; exception when others then v_reps := null; end;
    begin v_duration := nullif(v_item->>'durationSeconds', '')::integer; exception when others then v_duration := null; end;
    begin v_weight := nullif(v_item->>'weightKg', '')::numeric; exception when others then v_weight := null; end;
    begin v_rpe := nullif(v_item->>'rpe', '')::numeric; exception when others then v_rpe := null; end;
    begin v_rir := nullif(v_item->>'rir', '')::numeric; exception when others then v_rir := null; end;
    begin v_is_warmup := coalesce((v_item->>'isWarmup')::boolean, false); exception when others then v_is_warmup := false; end;
    if v_metric = 'reps' and (v_reps is null or v_reps < 1 or v_reps > 500) then raise exception 'ACTUAL_REPS_REQUIRED'; end if;
    if v_metric = 'duration_seconds' and (v_duration is null or v_duration < 1 or v_duration > 7200) then raise exception 'ACTUAL_DURATION_REQUIRED'; end if;
    if v_weight is not null and v_weight < 0 then raise exception 'ACTUAL_WEIGHT_INVALID'; end if;
    if v_rpe is not null and (v_rpe < 1 or v_rpe > 10) then raise exception 'ACTUAL_RPE_INVALID'; end if;
    if v_rir is not null and (v_rir < 0 or v_rir > 6) then raise exception 'ACTUAL_RIR_INVALID'; end if;
    if v_metric = 'reps' and v_weight is not null then v_total_volume := v_total_volume + (v_reps * v_weight); end if;

    insert into public.set_results (
      user_id, session_id, exercise_name, exercise_key, planned_exercise_key,
      exercise_order, set_index, prescribed_set_count, metric_type,
      target_reps, target_min_reps, target_max_reps,
      target_duration_seconds, target_min_duration_seconds, target_max_duration_seconds,
      target_weight_kg, target_rir,
      reps, duration_seconds, weight_kg, rpe, rir, is_warmup, completed_at
    ) values (
      v_user_id, v_workout_session_id, v_exercise_name, v_exercise_key, v_exercise_key,
      v_exercise_order, v_set_index, nullif(v_prescribed_set_count, 0), v_metric,
      case when v_metric = 'reps' then nullif(v_plan_set->>'targetReps', '')::integer else null end,
      case when v_metric = 'reps' then nullif(v_plan_set->>'minReps', '')::integer else null end,
      case when v_metric = 'reps' then nullif(v_plan_set->>'maxReps', '')::integer else null end,
      case when v_metric = 'duration_seconds' then nullif(v_plan_set->>'targetDurationSeconds', '')::integer else null end,
      case when v_metric = 'duration_seconds' then nullif(v_plan_set->>'minDurationSeconds', '')::integer else null end,
      case when v_metric = 'duration_seconds' then nullif(v_plan_set->>'maxDurationSeconds', '')::integer else null end,
      nullif(v_plan_set->>'weightKg', '')::numeric,
      nullif(v_plan_set->>'targetRir', '')::numeric,
      case when v_metric = 'reps' then v_reps else null end,
      case when v_metric = 'duration_seconds' then v_duration else null end,
      v_weight, v_rpe, v_rir, v_is_warmup, p_completed_at
    );
  end loop;

  update public.workout_sessions
  set total_volume_kg = greatest(0, v_total_volume), updated_at = now()
  where id = v_workout_session_id and user_id = v_user_id;

  update public.workouts
  set status = 'completed',
      payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{status}', to_jsonb('completed'::text), true),
      updated_at = now()
  where id = v_workout.id and user_id = v_user_id;

  return query select v_workout_session_id, false;
end;
$$;

revoke all on function public.complete_workout_session(uuid, uuid, timestamptz, timestamptz, integer, text, jsonb) from public, anon;
grant execute on function public.complete_workout_session(uuid, uuid, timestamptz, timestamptz, integer, text, jsonb) to authenticated;
