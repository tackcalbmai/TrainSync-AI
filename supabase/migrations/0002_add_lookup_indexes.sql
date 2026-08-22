create index if not exists publication_attempts_workout_id_idx on public.publication_attempts(workout_id);
create index if not exists tool_audit_log_user_id_idx on private.tool_audit_log(user_id);
create index if not exists workouts_user_created_at_idx on public.workouts(user_id, created_at desc);
create index if not exists workouts_user_scheduled_date_idx on public.workouts(user_id, scheduled_date);
