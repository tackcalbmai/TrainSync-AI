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
function finiteLoads(values = []) { return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isFinite(value) && value > 0))].sort((a,b) => a-b); }

async function getWorkoutSession(token, userId, workoutSessionId) {
  const q = new URLSearchParams({ select:"id,user_id,program_session_id,workout_id,status,source,completed_at", id:`eq.${workoutSessionId}`, user_id:`eq.${userId}`, limit:"1" });
  return one(token, `workout_sessions?${q}`);
}
async function getProgramSession(token, userId, programSessionId) {
  const q = new URLSearchParams({ select:"id,user_id,program_id,week_index,day_index,scheduled_date,title,status,payload,rationale,revision,updated_at", id:`eq.${programSessionId}`, user_id:`eq.${userId}`, limit:"1" });
  return one(token, `program_sessions?${q}`);
}
async function getSetHistory(token, userId) {
  const q = new URLSearchParams({ select:"session_id,exercise_name,exercise_key,set_index,prescribed_set_count,target_reps,target_min_reps,target_max_reps,target_weight_kg,target_rir,reps,weight_kg,rpe,is_warmup,completed_at,metric_type,target_duration_seconds,target_min_duration_seconds,target_max_duration_seconds,duration_seconds", user_id:`eq.${userId}`, is_warmup:"eq.false", order:"completed_at.desc", limit:"500" });
  return rest(token, `set_results?${q}`);
}
async function getFutureSessions(token, userId, programId, afterDate) {
  const q = new URLSearchParams({ select:"id,user_id,program_id,week_index,day_index,slot_index,scheduled_date,title,status,payload,rationale,revision,updated_at", user_id:`eq.${userId}`, program_id:`eq.${programId}`, status:"in.(planned,generated)", order:"scheduled_date.asc,day_index.asc", limit:"80" });
  if (afterDate) q.set("scheduled_date", `gt.${afterDate}`);
  return rest(token, `program_sessions?${q}`);
}
async function getAdjustmentHistory(token, userId, programId) {
  const q = new URLSearchParams({ select:"id,target_key,adjustment_type,reason_code,reason_text,before_state,after_state,metrics_snapshot,decision_confidence,created_at", user_id:`eq.${userId}`, program_id:`eq.${programId}`, order:"created_at.desc", limit:"200" });
  return rest(token, `program_adjustments?${q}`).catch(() => []);
}
async function getConfirmedLoadOptions(token, userId) {
  const q = new URLSearchParams({ select:"exercise_key,loads_kg,source,updated_at", user_id:`eq.${userId}`, order:"updated_at.desc", limit:"200" });
  const rows = await rest(token, `exercise_load_options?${q}`).catch(() => []);
  const map = {};
  for (const row of Array.isArray(rows) ? rows : []) map[row.exercise_key] = finiteLoads(row.loads_kg);
  return map;
}
function mergeLoadOptions(stored = {}, explicit = {}) {
  const result = { ...stored };
  for (const [exerciseKey, values] of Object.entries(explicit || {})) result[exerciseKey] = finiteLoads([...(result[exerciseKey] || []), ...finiteLoads(values)]);
  return result;
}
async function persistRequirements(token, userId, programId, workoutSessionId, requirements = []) {
  const rows = (Array.isArray(requirements) ? requirements : []).filter((item) => item?.targetProgramSessionId && item?.exerciseKey && item?.type).map((item) => ({
    user_id:userId,
    program_id:programId,
    source_workout_session_id:workoutSessionId,
    target_program_session_id:item.targetProgramSessionId,
    exercise_key:item.exerciseKey,
    request_type:item.type,
    reason_code:item.reasonCode || "ADAPTATION_INPUT_REQUIRED",
    payload:item,
    status:"pending",
    updated_at:new Date().toISOString(),
  }));
  if (!rows.length) return;
  const conflict = encodeURIComponent("source_workout_session_id,target_program_session_id,exercise_key,request_type");
  await rest(token, `adaptation_requests?on_conflict=${conflict}`, {
    method:"POST",
    headers:{ Prefer:"resolution=merge-duplicates,return=minimal" },
    body:JSON.stringify(rows),
  });
}
async function resolveRequestsForApplied(token, userId, workoutSessionId, proposals = [], loadOptions = {}) {
  const appliedKeys = [...new Set((Array.isArray(proposals) ? proposals : []).filter((item) => item?.applied && item?.exerciseKey).map((item) => item.exerciseKey))];
  for (const exerciseKey of appliedKeys) {
    const q = new URLSearchParams({ user_id:`eq.${userId}`, source_workout_session_id:`eq.${workoutSessionId}`, exercise_key:`eq.${exerciseKey}`, status:"eq.pending" });
    await rest(token, `adaptation_requests?${q}`, {
      method:"PATCH",
      headers:{ Prefer:"return=minimal" },
      body:JSON.stringify({ status:"resolved", resolution:{ resolvedBy:"adaptation_apply", loadsKg:loadOptions[exerciseKey] || [] }, updated_at:new Date().toISOString() }),
    }).catch(() => {});
  }
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
export function adaptationStatusForRequirements(requirements = []) {
  const list = Array.isArray(requirements) ? requirements : [];
  if (list.some((item) => item?.type === "load_options")) return { status:"needs_input", reasonCode:"ADAPTATION_INPUT_REQUIRED" };
  if (list.some((item) => item?.type === "review")) return { status:"needs_review", reasonCode:"ADAPTATION_REVIEW_REQUIRED" };
  return { status:"no_change", reasonCode:"NO_CONFIRMED_ADAPTATION" };
}

export async function runProgramAdaptation({ token, userId, workoutSessionId, apply = true, explicitAvailableLoadsByExercise = {} } = {}) {
  if (!token || !userId || !workoutSessionId) throw new Error("ADAPTATION_CONTEXT_REQUIRED");
  const workoutSession = await getWorkoutSession(token, userId, workoutSessionId);
  if (!workoutSession) return { status:"skipped", reasonCode:"WORKOUT_SESSION_NOT_FOUND", appliedBundles:[], requirements:[] };
  if (workoutSession.status !== "completed") return { status:"skipped", reasonCode:"WORKOUT_SESSION_NOT_COMPLETED", appliedBundles:[], requirements:[] };
  if (!workoutSession.program_session_id) return { status:"skipped", reasonCode:"PROGRAM_SESSION_LINK_NOT_CONFIRMED", appliedBundles:[], requirements:[] };

  const programSession = await getProgramSession(token, userId, workoutSession.program_session_id);
  if (!programSession) return { status:"skipped", reasonCode:"PROGRAM_SESSION_NOT_FOUND", appliedBundles:[], requirements:[] };
  const [setResults, futureProgramSessions, storedLoadOptions, adjustmentHistory] = await Promise.all([
    getSetHistory(token, userId),
    getFutureSessions(token, userId, programSession.program_id, programSession.scheduled_date),
    getConfirmedLoadOptions(token, userId),
    getAdjustmentHistory(token, userId, programSession.program_id),
  ]);
  const availableLoadsByExercise = mergeLoadOptions(storedLoadOptions, explicitAvailableLoadsByExercise);
  const plan = buildPostSessionAdaptationPlan({ completedProgramSession:programSession, completedWorkoutSession:workoutSession, setResults, futureProgramSessions, adjustmentHistory, explicitAvailableLoadsByExercise:availableLoadsByExercise });
  if (!plan.valid) return { status:"skipped", reasonCode:plan.reasonCode, plan, appliedBundles:[], requirements:plan.requirements || [] };
  const bundles = bundleAdaptationProposals(plan.proposals);
  if (!bundles.length) {
    if (plan.requirements?.length) {
      if (apply) await persistRequirements(token, userId, programSession.program_id, workoutSessionId, plan.requirements).catch(() => {});
      const unresolved = adaptationStatusForRequirements(plan.requirements);
      return { ...unresolved, plan, bundles:[], appliedBundles:[], requirements:plan.requirements };
    }
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
  if (appliedBundles.length) await resolveRequestsForApplied(token, userId, workoutSessionId, plan.proposals, availableLoadsByExercise);
  if (plan.requirements?.length) await persistRequirements(token, userId, programSession.program_id, workoutSessionId, plan.requirements).catch(() => {});
  return {
    status:conflicts.length ? (appliedBundles.length ? "partial" : "conflict") : "applied",
    reasonCode:conflicts.length ? "ADAPTATION_TRANSACTION_CONFLICT" : "ADAPTATION_APPLIED",
    plan,
    bundleCount:bundles.length,
    appliedBundles,
    conflicts,
    requirements:plan.requirements || [],
    attention:plan.requirements?.length ? adaptationStatusForRequirements(plan.requirements) : null,
  };
}
