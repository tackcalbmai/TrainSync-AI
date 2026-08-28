alter table public.set_results add column if not exists planned_exercise_key text;

create or replace function public.complete_materialized_program_session(
  p_program_session_id uuid,
  p_workout_id uuid,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_duration_seconds integer,
  p_notes text,
  p_actual_sets jsonb
)
returns table(workout_session_id uuid, duplicate boolean)
language plpgsql
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_ps public.program_sessions%rowtype;
  v_ws_id uuid;
  v_item jsonb;
  v_plan_exercise jsonb;
  v_plan_set jsonb;
  v_approved_sub jsonb;
  v_exercise_order integer;
  v_set_index integer;
  v_metric text;
  v_reps integer;
  v_duration integer;
  v_weight numeric;
  v_rpe numeric;
  v_rir numeric;
  v_total_volume numeric := 0;
  v_total_sets integer;
  v_prescribed_sets integer;
  v_completed timestamptz := coalesce(p_completed_at, now());
  v_planned_key text;
  v_performed_key text;
  v_performed_name text;
  v_is_substitution boolean;
begin
  if v_user_id is null then raise exception 'SIGN_IN_REQUIRED'; end if;
  if p_program_session_id is null or p_workout_id is null then raise exception 'PROGRAM_WORKOUT_CONTEXT_REQUIRED'; end if;
  if p_actual_sets is null or jsonb_typeof(p_actual_sets) <> 'array' or jsonb_array_length(p_actual_sets) < 1 then raise exception 'COMPLETED_SETS_REQUIRED'; end if;
  if exists (select 1 from jsonb_array_elements(p_actual_sets) x(value) group by x.value->>'exerciseOrder',x.value->>'setIndex' having count(*)>1) then raise exception 'DUPLICATE_ACTUAL_SET_POSITION'; end if;

  select ws.id into v_ws_id from public.workout_sessions ws where ws.user_id=v_user_id and ws.program_session_id=p_program_session_id and ws.status='completed' limit 1;
  if v_ws_id is not null then return query select v_ws_id,true; return; end if;

  select ps.* into v_ps
  from public.program_sessions ps
  join public.training_programs tp on tp.id=ps.program_id and tp.user_id=v_user_id and tp.status='active'
  join public.workouts w on w.id=p_workout_id and w.user_id=v_user_id and w.revision=ps.revision
  where ps.id=p_program_session_id and ps.user_id=v_user_id and ps.workout_id=p_workout_id and ps.status in ('planned','generated')
  for update of ps;
  if not found then raise exception 'PROGRAM_SESSION_NOT_MATERIALIZED_OR_NOT_ACTIVE'; end if;

  v_total_sets:=jsonb_array_length(p_actual_sets);
  insert into public.workout_sessions(user_id,workout_id,program_session_id,title,started_at,completed_at,duration_seconds,status,notes,total_sets,total_volume_kg,source,updated_at)
  values(v_user_id,p_workout_id,p_program_session_id,v_ps.title,coalesce(p_started_at,v_completed),v_completed,greatest(0,least(86400,coalesce(p_duration_seconds,0))),'completed',nullif(trim(coalesce(p_notes,'')),''),v_total_sets,0,'trainsync',now()) returning id into v_ws_id;

  for v_item in select value from jsonb_array_elements(p_actual_sets) loop
    begin v_exercise_order:=(v_item->>'exerciseOrder')::integer; exception when others then v_exercise_order:=null; end;
    begin v_set_index:=(v_item->>'setIndex')::integer; exception when others then v_set_index:=null; end;
    if v_exercise_order is null or v_exercise_order<1 or v_set_index is null or v_set_index<1 then raise exception 'SET_POSITION_INVALID'; end if;
    v_plan_exercise:=v_ps.payload->'exercises'->(v_exercise_order-1);
    if v_plan_exercise is null then raise exception 'PLAN_EXERCISE_NOT_FOUND'; end if;
    v_plan_set:=v_plan_exercise->'sets'->(v_set_index-1);
    if v_plan_set is null then raise exception 'PLAN_SET_NOT_FOUND'; end if;
    v_prescribed_sets:=jsonb_array_length(coalesce(v_plan_exercise->'sets','[]'::jsonb));
    v_planned_key:=nullif(v_plan_exercise->>'exerciseKey','');
    if v_planned_key is null then raise exception 'PLANNED_EXERCISE_KEY_REQUIRED'; end if;
    v_performed_key:=coalesce(nullif(v_item->>'exerciseKey',''),v_planned_key);
    v_is_substitution:=v_performed_key<>v_planned_key;
    v_approved_sub:=null;
    if v_is_substitution then
      select s.value into v_approved_sub
      from jsonb_array_elements(coalesce(v_ps.rationale->'liveSubstitutions','[]'::jsonb)) s(value)
      where nullif(s.value->>'exerciseOrder','')::integer=v_exercise_order
        and s.value->>'plannedExerciseKey'=v_planned_key
        and s.value->>'replacementExerciseKey'=v_performed_key
      order by s.value->>'approvedAt' desc nulls last limit 1;
      if v_approved_sub is null then raise exception 'UNAPPROVED_EXERCISE_SUBSTITUTION'; end if;
      v_performed_name:=coalesce(nullif(v_approved_sub->>'replacementExerciseName',''),nullif(v_item->>'exerciseName',''),'Exercise');
    else
      v_performed_name:=coalesce(nullif(v_plan_exercise->>'name',''),'Exercise');
    end if;
    v_metric:=coalesce(nullif(v_plan_set->>'metricType',''),nullif(v_plan_exercise->>'setMetric',''),'reps');
    if v_metric not in ('reps','duration_seconds') then raise exception 'SET_METRIC_INVALID'; end if;
    begin v_reps:=nullif(v_item->>'reps','')::integer; exception when others then v_reps:=null; end;
    begin v_duration:=nullif(v_item->>'durationSeconds','')::integer; exception when others then v_duration:=null; end;
    begin v_weight:=nullif(v_item->>'weightKg','')::numeric; exception when others then v_weight:=null; end;
    begin v_rpe:=nullif(v_item->>'rpe','')::numeric; exception when others then v_rpe:=null; end;
    begin v_rir:=nullif(v_item->>'rir','')::numeric; exception when others then v_rir:=null; end;
    if v_metric='reps' and (v_reps is null or v_reps<1) then raise exception 'ACTUAL_REPS_REQUIRED'; end if;
    if v_metric='duration_seconds' and (v_duration is null or v_duration<1) then raise exception 'ACTUAL_DURATION_REQUIRED'; end if;
    if v_weight is not null and v_weight<0 then raise exception 'ACTUAL_WEIGHT_INVALID'; end if;
    if v_rpe is not null and (v_rpe<1 or v_rpe>10) then raise exception 'ACTUAL_RPE_INVALID'; end if;
    if v_rir is not null and (v_rir<0 or v_rir>6) then raise exception 'ACTUAL_RIR_INVALID'; end if;
    if v_metric='reps' and v_weight is not null then v_total_volume:=v_total_volume+(v_reps*v_weight); end if;

    insert into public.set_results(user_id,session_id,exercise_name,exercise_key,planned_exercise_key,exercise_order,set_index,prescribed_set_count,metric_type,target_reps,target_min_reps,target_max_reps,target_duration_seconds,target_min_duration_seconds,target_max_duration_seconds,target_weight_kg,target_rir,reps,duration_seconds,weight_kg,rpe,rir,is_warmup,completed_at)
    values(v_user_id,v_ws_id,v_performed_name,v_performed_key,v_planned_key,v_exercise_order,v_set_index,nullif(v_prescribed_sets,0),v_metric,
      case when v_metric='reps' then nullif(v_plan_set->>'targetReps','')::integer else null end,
      case when v_metric='reps' then nullif(v_plan_set->>'minReps','')::integer else null end,
      case when v_metric='reps' then nullif(v_plan_set->>'maxReps','')::integer else null end,
      case when v_metric='duration_seconds' then nullif(v_plan_set->>'targetDurationSeconds','')::integer else null end,
      case when v_metric='duration_seconds' then nullif(v_plan_set->>'minDurationSeconds','')::integer else null end,
      case when v_metric='duration_seconds' then nullif(v_plan_set->>'maxDurationSeconds','')::integer else null end,
      case when v_is_substitution then null else nullif(v_plan_set->>'weightKg','')::numeric end,
      nullif(v_plan_set->>'targetRir','')::numeric,
      case when v_metric='reps' then v_reps else null end,
      case when v_metric='duration_seconds' then v_duration else null end,
      v_weight,v_rpe,v_rir,false,v_completed);
  end loop;

  update public.workout_sessions set total_volume_kg=greatest(0,v_total_volume),updated_at=now() where id=v_ws_id and user_id=v_user_id;
  update public.workouts set status='completed',payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{status}','\"completed\"'::jsonb,true),updated_at=now() where id=p_workout_id and user_id=v_user_id;
  update public.program_sessions set status='completed',rationale=coalesce(rationale,'{}'::jsonb)||jsonb_build_object('completionSource','trainsync','completedAt',v_completed),updated_at=now() where id=p_program_session_id and user_id=v_user_id;
  return query select v_ws_id,false;
end;
$function$;
