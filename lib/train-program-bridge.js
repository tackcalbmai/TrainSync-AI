import { getSession, refreshSession, SUPABASE_URL } from "./supabase-client.js";
import { getActiveProgram, listProgramSessions } from "./program-client.js";
import { validateWorkout } from "./workout.mjs";
import { actualSetPayloadFromWorkout, localIsoDate, programSessionToWorkout, selectNextProgramSession } from "./program-session-workout.mjs";

const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";

function headers(session, extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...extra,
  };
}
async function parse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
async function authorizedRest(path, options = {}) {
  let session = getSession();
  if (!session?.access_token) throw new Error("SIGN_IN_REQUIRED");
  const send = () => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: headers(session, options.headers || {}) });
  let response = await send();
  if (response.status === 401 && session.refresh_token) {
    session = await refreshSession();
    response = await send();
  }
  return parse(response);
}
async function authorizedApi(path, payload) {
  let session = getSession();
  if (!session?.access_token) throw new Error("SIGN_IN_REQUIRED");
  const send = () => fetch(path, {
    method: "POST",
    headers: { "Content-Type":"application/json", Authorization:`Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  let response = await send();
  if (response.status === 401 && session.refresh_token) {
    session = await refreshSession();
    response = await send();
  }
  return parse(response);
}

export async function loadNextActiveProgramWorkout({ timezone = "UTC", now = new Date() } = {}) {
  const program = await getActiveProgram();
  if (!program) return null;
  const sessions = await listProgramSessions(program.id);
  const todayIso = localIsoDate(timezone || "UTC", now);
  const programSession = selectNextProgramSession(sessions, todayIso);
  if (!programSession) return { program, programSession:null, workout:null, workoutDbId:null, reasonCode:"NO_UPCOMING_PROGRAM_SESSION" };
  const workout = programSessionToWorkout({ program, programSession, timezone });
  const validation = validateWorkout(workout);
  if (!validation.valid) {
    const error = new Error("ACTIVE_PROGRAM_SESSION_INVALID");
    error.validation = validation;
    throw error;
  }
  const rows = await authorizedRest("rpc/materialize_program_session", {
    method: "POST",
    headers: { Prefer:"return=representation" },
    body: JSON.stringify({
      p_program_session_id: programSession.id,
      p_expected_revision: Number(programSession.revision || 1),
      p_workout_payload: workout,
    }),
  });
  const materialized = Array.isArray(rows) ? rows[0] : rows;
  if (!materialized?.workout_id) throw new Error("PROGRAM_MATERIALIZATION_FAILED");
  return {
    program,
    programSession:{ ...programSession, workout_id:materialized.workout_id, status:"generated" },
    workout,
    workoutDbId:materialized.workout_id,
    validation,
    reasonCode:"PROGRAM_WORKOUT_READY",
  };
}

export async function completeProgramWorkout({ workout, workoutDbId, actualSets, startedAt, completedAt, durationSeconds = 0, notes = "" } = {}) {
  if (!workout?.programSessionId || !workoutDbId) throw new Error("MATERIALIZED_PROGRAM_WORKOUT_REQUIRED");
  const payloadSets = actualSetPayloadFromWorkout(workout, actualSets);
  if (!payloadSets.length) throw new Error("COMPLETED_SETS_REQUIRED");
  const rows = await authorizedRest("rpc/complete_materialized_program_session", {
    method:"POST",
    headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      p_program_session_id:workout.programSessionId,
      p_workout_id:workoutDbId,
      p_started_at:startedAt || completedAt || new Date().toISOString(),
      p_completed_at:completedAt || new Date().toISOString(),
      p_duration_seconds:Math.max(0, Math.min(86400, Math.round(Number(durationSeconds) || 0))),
      p_notes:String(notes || ""),
      p_actual_sets:payloadSets,
    }),
  });
  const completed = Array.isArray(rows) ? rows[0] : rows;
  if (!completed?.workout_session_id) throw new Error("PROGRAM_COMPLETION_FAILED");

  let adaptation = null;
  try {
    adaptation = await authorizedApi("/api/adapt-session", { workoutSessionId:completed.workout_session_id });
  } catch (error) {
    adaptation = {
      status:"error",
      reasonCode:"POST_COMPLETION_ADAPTATION_FAILED",
      message:error.message || "Adaptation failed after the completed session was saved.",
    };
  }
  return { workoutSessionId:completed.workout_session_id, duplicate:Boolean(completed.duplicate), adaptation };
}
