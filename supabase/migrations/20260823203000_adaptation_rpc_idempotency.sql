create unique index if not exists program_adjustments_execution_target_unique
  on public.program_adjustments(workout_session_id, program_session_id, target_key, adjustment_type, reason_code)
  where workout_session_id is not null and program_session_id is not null;

create or replace function public.apply_program_session_adjustments(
  p_program_session_id uuid,
  p_expected_revision integer,
  p_new_payload jsonb,
  p_workout_session_id uuid,
  p_adjustments jsonb
)
returns table(new_revision integer, adjustment_count integer)
language plpgsql
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_program_id uuid;
  v_revision integer;
  v_item jsonb;
  v_count integer := 0;
  v_total integer;
  v_existing integer := 0;
begin
  if v_user_id is null then raise exception 'SIGN_IN_REQUIRED'; end if;
  if p_workout_session_id is null or not exists (
    select 1 from public.workout_sessions ws
    where ws.id = p_workout_session_id and ws.user_id = v_user_id and ws.status = 'completed'
  ) then raise exception 'COMPLETED_WORKOUT_SESSION_REQUIRED'; end if;
  if p_adjustments is null or jsonb_typeof(p_adjustments) <> 'array' or jsonb_array_length(p_adjustments) < 1 then
    raise exception 'ADJUSTMENTS_REQUIRED';
  end if;

  v_total := jsonb_array_length(p_adjustments);

  if exists (
    select 1
    from jsonb_array_elements(p_adjustments) x(value)
    group by
      coalesce(nullif(trim(x.value->>'targetKey'), ''), 'session'),
      x.value->>'adjustment_type',
      x.value->>'reason_code'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_ADJUSTMENT_KEYS';
  end if;

  select count(*) into v_existing
  from jsonb_array_elements(p_adjustments) x(value)
  where exists (
    select 1
    from public.program_adjustments pa
    where pa.user_id = v_user_id
      and pa.workout_session_id = p_workout_session_id
      and pa.program_session_id = p_program_session_id
      and pa.target_key = coalesce(nullif(trim(x.value->>'targetKey'), ''), 'session')
      and pa.adjustment_type = x.value->>'adjustment_type'
      and pa.reason_code = x.value->>'reason_code'
  );

  if v_existing = v_total then
    select ps.revision into v_revision
    from public.program_sessions ps
    where ps.id = p_program_session_id and ps.user_id = v_user_id;
    if v_revision is null then raise exception 'PROGRAM_SESSION_NOT_FOUND'; end if;
    return query select v_revision, 0;
    return;
  elsif v_existing > 0 then
    raise exception 'ADJUSTMENT_IDEMPOTENCY_PARTIAL_CONFLICT';
  end if;

  update public.program_sessions ps
  set payload = coalesce(p_new_payload, '{}'::jsonb), revision = ps.revision + 1, updated_at = now()
  where ps.id = p_program_session_id and ps.user_id = v_user_id
    and ps.revision = p_expected_revision and ps.status in ('planned','generated')
  returning ps.program_id, ps.revision into v_program_id, v_revision;
  if v_program_id is null then raise exception 'PROGRAM_SESSION_REVISION_CONFLICT_OR_NOT_MUTABLE'; end if;

  for v_item in select value from jsonb_array_elements(p_adjustments)
  loop
    insert into public.program_adjustments (
      user_id, program_id, program_session_id, workout_session_id, target_key,
      adjustment_type, reason_code, reason_text, evidence_level,
      before_state, after_state, science_version, evidence_claim_ids,
      evidence_rule_keys, decision_confidence, metrics_snapshot, decision_source
    ) values (
      v_user_id, v_program_id, p_program_session_id, p_workout_session_id,
      coalesce(nullif(trim(v_item->>'targetKey'), ''), 'session'),
      v_item->>'adjustment_type', v_item->>'reason_code', v_item->>'reason_text', v_item->>'evidence_level',
      coalesce(v_item->'before_state','{}'::jsonb), coalesce(v_item->'after_state','{}'::jsonb),
      v_item->>'science_version',
      coalesce(array(select jsonb_array_elements_text(coalesce(v_item->'evidence_claim_ids','[]'::jsonb))), '{}'::text[]),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_item->'evidence_rule_keys','[]'::jsonb))), '{}'::text[]),
      nullif(v_item->>'decision_confidence','')::real,
      coalesce(v_item->'metrics_snapshot','{}'::jsonb),
      coalesce(v_item->>'decision_source','deterministic')
    );
    v_count := v_count + 1;
  end loop;

  return query select v_revision, v_count;
end;
$function$;
