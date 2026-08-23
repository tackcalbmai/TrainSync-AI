-- Runtime schema snapshot: PROGRAM -> TRAIN bridge
--
-- IMPORTANT: production Supabase has migrations newer than the checked-in 0001-0005
-- sequence. This file documents current runtime objects and is NOT numbered as a
-- fake sequential migration. Reconcile the full migration history before using the
-- repository to bootstrap a fresh database.
--
-- Applied to production on 2026-08-23 through Supabase migration tooling:
--   materialize_active_program_session
--   archive_stale_materialized_program_workout
--   complete_materialized_program_session
--   preserve_prescribed_set_count
--   harden_program_completion_identity
--
-- public.materialize_program_session(uuid, integer, jsonb)
--   * authenticated owner, active program, current program-session revision only
--   * validates programSessionId/revision/sport/date/non-empty exercises
--   * creates/reuses workouts client key program:<program_session_id>
--   * archives stale non-completed materialized revisions
--   * atomically links program_sessions.workout_id
--
-- public.complete_materialized_program_session(
--   uuid, uuid, timestamptz, timestamptz, integer, text, jsonb
-- )
--   * authenticated owner and current materialized active-program workout only
--   * rejects duplicate exerciseOrder/setIndex positions
--   * ignores client-supplied identity for scientific provenance: canonical name/key
--     and all prescribed targets come from program_sessions.payload
--   * accepts only execution values (reps/seconds/load/RPE) from TRAIN
--   * inserts workout_sessions + set_results and completes workout/program session
--     atomically; repeated completion is idempotent
--
-- set_results.prescribed_set_count integer nullable check 1..100
-- public.fill_set_result_program_targets() trigger
--   * fills prescribed_set_count from linked PROGRAM exercise
--   * fills target_rir only when the program actually prescribed it
--   * never converts missing RIR to zero/default

comment on function public.materialize_program_session(uuid, integer, jsonb)
is 'TrainSync runtime bridge: materialize the current revision of an active program session into the normal workout model.';

comment on function public.complete_materialized_program_session(uuid, uuid, timestamptz, timestamptz, integer, text, jsonb)
is 'TrainSync runtime bridge: persist actual execution against the server-owned active program prescription and complete it atomically.';

comment on column public.set_results.prescribed_set_count
is 'Working-set count prescribed for the matched program exercise at execution time; prevents partial logging from becoming a false progression signal.';
