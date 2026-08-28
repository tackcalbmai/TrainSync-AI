create or replace function public.resolve_missed_program_session(
  p_program_session_id uuid,
  p_action text,
  p_today date,
  p_new_date date default null
)
returns table(program_session_id uuid,resolution text,scheduled_date date)
language plpgsql
set search_path to 'public'
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_ps public.program_sessions%rowtype;
  v_next_date date;
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz:=now();
begin
  if v_user_id is null then raise exception 'SIGN_IN_REQUIRED'; end if;
  if p_today is null then raise exception 'TODAY_REQUIRED'; end if;
  if p_action not in ('move','skip') then raise exception 'MISSED_SESSION_ACTION_INVALID'; end if;
  select ps.* into v_ps from public.program_sessions ps join public.training_programs tp on tp.id=ps.program_id and tp.user_id=v_user_id and tp.status='active' where ps.id=p_program_session_id and ps.user_id=v_user_id for update of ps;
  if not found then raise exception 'PROGRAM_SESSION_NOT_FOUND_OR_PROGRAM_NOT_ACTIVE'; end if;
  if v_ps.status not in ('planned','generated') then raise exception 'PROGRAM_SESSION_NOT_RESOLVABLE'; end if;
  if v_ps.scheduled_date is null or v_ps.scheduled_date>=p_today then raise exception 'PROGRAM_SESSION_NOT_MISSED'; end if;
  v_before:=jsonb_build_object('scheduledDate',v_ps.scheduled_date,'status',v_ps.status);
  if p_action='skip' then
    update public.program_sessions set status='skipped',rationale=coalesce(rationale,'{}'::jsonb)||jsonb_build_object('missedResolution',jsonb_build_object('action','skip','originalDate',v_ps.scheduled_date,'resolvedAt',v_now,'catchUpVolume',false)),updated_at=v_now where id=v_ps.id and user_id=v_user_id;
    v_after:=jsonb_build_object('scheduledDate',v_ps.scheduled_date,'status','skipped');
    insert into public.program_adjustments(user_id,program_id,program_session_id,target_key,adjustment_type,reason_code,reason_text,evidence_level,before_state,after_state,science_version,evidence_claim_ids,evidence_rule_keys,decision_confidence,metrics_snapshot,decision_source)
    values(v_user_id,v_ps.program_id,v_ps.id,'session','schedule','MISSED_SESSION_SKIPPED','A missed session was skipped and the remaining program continues without automatically adding catch-up volume.','heuristic',v_before,v_after,'schedule:2026-08-28.1','{}','{}',1,jsonb_build_object('catchUpVolume',false),'user_confirmed');
    return query select v_ps.id,'skip'::text,v_ps.scheduled_date;return;
  end if;
  if p_new_date is null or p_new_date<p_today then raise exception 'MISSED_SESSION_MOVE_DATE_INVALID'; end if;
  if exists(select 1 from public.program_sessions other where other.user_id=v_user_id and other.program_id=v_ps.program_id and other.id<>v_ps.id and other.status in ('planned','generated') and other.scheduled_date=p_new_date) then raise exception 'SESSION_ALREADY_SCHEDULED_ON_DATE'; end if;
  select min(other.scheduled_date) into v_next_date from public.program_sessions other where other.user_id=v_user_id and other.program_id=v_ps.program_id and other.id<>v_ps.id and other.status in ('planned','generated') and other.scheduled_date>=p_today;
  if v_next_date is not null and p_new_date>=v_next_date then raise exception 'MISSED_SESSION_MOVE_CROSSES_NEXT_SESSION'; end if;
  update public.program_sessions set scheduled_date=p_new_date,rationale=coalesce(rationale,'{}'::jsonb)||jsonb_build_object('missedResolution',jsonb_build_object('action','move','originalDate',v_ps.scheduled_date,'newDate',p_new_date,'resolvedAt',v_now,'catchUpVolume',false)),updated_at=v_now where id=v_ps.id and user_id=v_user_id;
  if v_ps.workout_id is not null then update public.workouts set scheduled_date=p_new_date,payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{scheduledDate}',to_jsonb(p_new_date::text),true),updated_at=v_now where id=v_ps.workout_id and user_id=v_user_id; end if;
  v_after:=jsonb_build_object('scheduledDate',p_new_date,'status',v_ps.status);
  insert into public.program_adjustments(user_id,program_id,program_session_id,target_key,adjustment_type,reason_code,reason_text,evidence_level,before_state,after_state,science_version,evidence_claim_ids,evidence_rule_keys,decision_confidence,metrics_snapshot,decision_source)
  values(v_user_id,v_ps.program_id,v_ps.id,'session','schedule','MISSED_SESSION_MOVED','The missed session was moved to a user-confirmed date after deterministic spacing checks; no other session or weekly volume was automatically changed.','heuristic',v_before,v_after,'schedule:2026-08-28.1','{}','{}',1,jsonb_build_object('catchUpVolume',false),'user_confirmed');
  return query select v_ps.id,'move'::text,p_new_date;
end;
$function$;

grant execute on function public.resolve_missed_program_session(uuid,text,date,date) to authenticated;
