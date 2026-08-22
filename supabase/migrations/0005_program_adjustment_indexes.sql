create index if not exists program_adjustments_user_idx
  on public.program_adjustments(user_id, created_at desc);
create index if not exists program_adjustments_program_session_idx
  on public.program_adjustments(program_session_id)
  where program_session_id is not null;
