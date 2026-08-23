import { buildPostSessionAdaptationPlan } from "./adaptation-plan.mjs";
import { bundleAdaptationProposals } from "./adaptation-bundle.mjs";

const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";

function headers(token, extra = {}) { return { apikey:SUPABASE_KEY, Authorization:`Bearer ${token}`, "Content-Type":"application/json", ...extra }; }
async function parseResponse(response) {
  const text = await response.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) { const error = new Error(data?.message || data?.error || `Supabase request failed (${response.status})`); error.status = response.status; error.data = data; throw error; }
  return data;
}
async function rest(token, path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers:headers(token, options.headers || {}), signal:AbortSignal.timeout(12000) });
  return parseResponse(response);
}
async function one(token, path) { const rows = await rest(token, path); return Array.isArray(rows) ? rows[0] || null : null; }

async function getWorkoutSession(token, userId, workoutSessionId) {
  const q = new URLSearchParams({ select:"id,user_id,program_session_id,workout_id,status,source,completed_at", id:`eq.${workoutSessionId}`, user_id:`eq.${userId}`, limit:"1" });
  return one(token, `workout_sessions?${q}`);
}
async function getProgramSession(token, userId, programSessionId) {
  const q = new URLSearchParams({ select:"id,user_id,program_id,week_index,day_index,scheduled_date,title,status,payload,rationale,revision,updated_at", id:`eq.${programSessionId}`, user_id:`eq.${userId}`, limit:"1" });
  return one(token, `program_sessions?${q}`);
}
async function getSetHistory(token, userId) {
  const q = new URLSearchParams({ select:"session_id,exercise_name,exercise_key,set_index,target_reps,target_min_reps,target_max_reps,target_weight_kg,reps,weight_kg,rpe,is_warmup,completed_at,metric_type,target_duration_seconds,target_min_duration_seconds,target_max_duration_seconds,duration_seconds", user_id:`eq.${userId}`, is_warmup:"eq.false", order:"completed_at.desc", limit:"500" });
  return rest(token, `set_results?${q}`);
}
async function getFutureSessions(token, userId, programId, afterDate) {
  const q = new URLSearchParams({ select:"id,user_id,program_id,week_index,day_index,slot_index,scheduled_date,title,status,payload,rationale,revision,updated_at", user_id:`eq.${userId}`, program_id:`eq.${programId}`, status:"in.(planned,generated)", order:"scheduled_date.asc,day_index.asc", limit:"80" });
  if (afterDate) q.set("scheduled_date", `gt.${afterDate}`);
  return rest(token, `program_sessions?${q}`);
}
async function applyBundle(token, workoutSessionId, bundle) {
  const body = {
    p_program_session_id:bundle.targetProgramSessionId,
    p_expected_revision:bundle.expectedRevision,
    p_new_payload:bundle.newPayload,
    p_workout_session_id:workoutSessionId,
    p_adjustments:bundle.adjustments,
  };
  const rows = await rest(token, "rpc/apply_program_session_adjustments", { method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify(body) });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function runProgramAdaptation({ token, userId, workoutSessionId, apply = true, explicitAvailableLoadsByExercise = {} } = {}) {
  if (!token || !userId || !workoutSessionId) throw new Error("ADAPTATION_CONTEXT_REQUIRED");
  const workoutSession = await getWorkoutSession(token, userId, workoutSessionId);
  if (!workoutSession) return { status:"skipped", reasonCode:"WORKOUT_SESSION_NOT_FOUND", appliedBundles:[], requirements:[] };
  if (workoutSession.status !== "completed") return { status:"skipped", reasonCode:"WORKOUT_SESSION_NOT_COMPLETED", appliedBundles:[], requirements:[] };
  if (!workoutSession.program_session_id) return { status:"skipped", reasonCode:"PROGRAM_SESSION_LINK_NOT_CONFIRMED", appliedBundles:[], requirements:[] };

  const programSession = await getProgramSession(token, userId, workoutSession.program_session_id);
  if (!programSession) return { status:"skipped", reasonCode:"PROGRAM_SESSION_NOT_FOUND", appliedBundles:[], requirements:[] };
  const [setResults, futureProgramSessions] = await Promise.all([
    getSetHistory(token, userId),
    getFutureSessions(token, userId, programSession.program_id, programSession.scheduled_date),
  ]);
  const plan = buildPostSessionAdaptationPlan({ completedProgramSession:programSession, completedWorkoutSession:workoutSession, setResults, futureProgramSessions, explicitAvailableLoadsByExercise });
  if (!plan.valid) return { status:"skipped", reasonCode:plan.reasonCode, plan, appliedBundles:[], requirements:plan.requirements || [] };
  const bundles = bundleAdaptationProposals(plan.proposals);
  if (!bundles.length) {
    if (plan.requirements?.length) return { status:"needs_input", reasonCode:"ADAPTATION_INPUT_REQUIRED", plan, bundles:[], appliedBundles:[], requirements:plan.requirements };
    return { status:"no_change", reasonCode:"NO_CONFIRMED_ADAPTATION", plan, bundles:[], appliedBundles:[], requirements:[] };
  }
  if (!apply) return { status:"preview", reasonCode:"ADAPTATION_PREVIEW", plan, bundles, appliedBundles:[], requirements:plan.requirements || [] };

  const appliedBundles = [], conflicts = [];
  for (const bundle of bundles) {
    try {
      const result = await applyBundle(token, workoutSessionId, bundle);
      appliedBundles.push({ targetProgramSessionId:bundle.targetProgramSessionId, result, adjustmentCount:bundle.adjustments.length });
    } catch (error) {
      conflicts.push({ targetProgramSessionId:bundle.targetProgramSessionId, message:error.message, status:error.status || null });
    }
  }
  return {
    status:conflicts.length ? (appliedBundles.length ? "partial" : "conflict") : "applied",
    reasonCode:conflicts.length ? "ADAPTATION_TRANSACTION_CONFLICT" : "ADAPTATION_APPLIED",
    plan,
    bundleCount:bundles.length,
    appliedBundles,
    conflicts,
    requirements:plan.requirements || [],
  };
}
