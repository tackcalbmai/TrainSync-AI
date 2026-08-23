import { classifyExercisePerformance } from "./programming-engine.mjs";
import { decideExerciseAdaptation } from "./adaptation-policy.mjs";
import { buildProgramAdjustmentAudit } from "./adaptation-audit.mjs";
import {
  applyAdaptationDecision,
  mergeDecisionAndMutationRuleKeys,
  REGISTERED_VARIANT_TRANSITIONS,
} from "./prescription-mutation.mjs";

function arr(value) { return Array.isArray(value) ? value : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function clone(value) { return JSON.parse(JSON.stringify(value ?? null)); }
function isoTime(value) { const ms = Date.parse(value || ""); return Number.isFinite(ms) ? ms : 0; }

function targetFromResult(row) {
  const timed = String(row.metric_type || "reps") === "duration_seconds";
  if (timed) return {
    metricType:"duration_seconds",
    minDurationSeconds:row.target_min_duration_seconds ?? row.target_duration_seconds ?? null,
    maxDurationSeconds:row.target_max_duration_seconds ?? row.target_duration_seconds ?? null,
  };
  return {
    metricType:"reps",
    minReps:row.target_min_reps ?? row.target_reps ?? null,
    maxReps:row.target_max_reps ?? row.target_reps ?? null,
    targetWeightKg:row.target_weight_kg == null ? null : Number(row.target_weight_kg),
  };
}

function actualFromResult(row) {
  const timed = String(row.metric_type || "reps") === "duration_seconds";
  return timed
    ? { metricType:"duration_seconds", durationSeconds:row.duration_seconds == null ? null : Number(row.duration_seconds), rpe:row.rpe == null ? null : Number(row.rpe) }
    : { metricType:"reps", reps:row.reps == null ? null : Number(row.reps), weightKg:row.weight_kg == null ? null : Number(row.weight_kg), rpe:row.rpe == null ? null : Number(row.rpe) };
}

export function classifyResultExposure(rows = []) {
  const working = arr(rows).filter((row) => !row.is_warmup).sort((a,b) => Number(a.set_index || 0) - Number(b.set_index || 0));
  const targets = working.map(targetFromResult);
  const actuals = working.map(actualFromResult);
  let result = classifyExercisePerformance({ targetSets:targets, actualSets:actuals });

  const comparableWeights = working.map((row) => ({ target:finite(row.target_weight_kg), actual:finite(row.weight_kg) })).filter((x) => x.target != null && x.target > 0 && x.actual != null && x.actual > 0);
  if (comparableWeights.some((x) => x.actual + 1e-9 < x.target)) {
    result = { state:"underperformed", confidence:Math.max(0.7, Number(result.confidence || 0)), reasons:["At least one working set used less load than prescribed; repetition count alone cannot be treated as overperformance."] };
  }

  const effortKnown = working.some((row) => row.rpe != null && Number.isFinite(Number(row.rpe)));
  if (!effortKnown && result.state === "overperformed") {
    result = { ...result, confidence:Math.min(Number(result.confidence || 0.75), 0.68), reasons:[...(result.reasons || []), "Effort was not recorded, so progression confidence is reduced."] };
  }
  return result;
}

export function performanceHistoryForExercise(setResults = [], exerciseKey, limit = 3) {
  const groups = new Map();
  for (const row of arr(setResults)) {
    if (row.exercise_key !== exerciseKey || row.is_warmup) continue;
    const sessionId = row.session_id;
    if (!sessionId) continue;
    if (!groups.has(sessionId)) groups.set(sessionId, []);
    groups.get(sessionId).push(row);
  }
  return [...groups.entries()].map(([sessionId, rows]) => ({
    sessionId,
    completedAt:rows.reduce((latest, row) => isoTime(row.completed_at) > isoTime(latest) ? row.completed_at : latest, rows[0]?.completed_at || null),
    performance:classifyResultExposure(rows),
    rows,
  })).sort((a,b) => isoTime(b.completedAt) - isoTime(a.completedAt)).slice(0, Math.max(1, limit));
}

function lastObservedLoad(rows = []) {
  const values = arr(rows).map((row) => finite(row.weight_kg)).filter((value) => value != null && value > 0);
  if (!values.length) return null;
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a,b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

export function observedLoadsForExercise(setResults = [], exerciseKey) {
  return [...new Set(arr(setResults).filter((row) => row.exercise_key === exerciseKey && !row.is_warmup).map((row) => finite(row.weight_kg)).filter((value) => value != null && value > 0))].sort((a,b) => a-b);
}

function futureOccurrences(futureSessions, programId, afterDate, exerciseKey) {
  return arr(futureSessions).filter((session) => {
    if (session.program_id !== programId) return false;
    if (!["planned","generated"].includes(String(session.status || "planned"))) return false;
    if (afterDate && session.scheduled_date && String(session.scheduled_date) <= String(afterDate)) return false;
    return arr(session.payload?.exercises).some((exercise) => exercise.exerciseKey === exerciseKey);
  }).sort((a,b) => String(a.scheduled_date || "9999-12-31").localeCompare(String(b.scheduled_date || "9999-12-31")) || Number(a.week_index || 0) - Number(b.week_index || 0));
}

function replaceExercise(payload, exerciseKey, replacement) {
  const next = clone(payload || {});
  next.exercises = arr(next.exercises).map((exercise) => exercise.exerciseKey === exerciseKey ? clone(replacement) : exercise);
  return next;
}

export function buildPostSessionAdaptationPlan({
  completedProgramSession,
  completedWorkoutSession,
  setResults = [],
  futureProgramSessions = [],
  explicitAvailableLoadsByExercise = {},
} = {}) {
  if (!completedProgramSession?.id || !completedWorkoutSession?.id) return { valid:false, reasonCode:"COMPLETED_SESSION_CONTEXT_REQUIRED", proposals:[] };
  if (completedWorkoutSession.program_session_id !== completedProgramSession.id) return { valid:false, reasonCode:"PROGRAM_SESSION_LINK_NOT_CONFIRMED", proposals:[] };
  if (String(completedWorkoutSession.status || "") !== "completed") return { valid:false, reasonCode:"WORKOUT_SESSION_NOT_COMPLETED", proposals:[] };

  const programId = completedProgramSession.program_id;
  const proposals = [];
  for (const completedExercise of arr(completedProgramSession.payload?.exercises)) {
    const exerciseKey = completedExercise.exerciseKey;
    if (!exerciseKey) continue;
    const history = performanceHistoryForExercise(setResults, exerciseKey, 3);
    if (!history.length || history[0].sessionId !== completedWorkoutSession.id) continue;
    const occurrences = futureOccurrences(futureProgramSessions, programId, completedProgramSession.scheduled_date, exerciseKey);
    if (!occurrences.length) continue;

    const nextSession = occurrences[0];
    const futureExercise = arr(nextSession.payload?.exercises).find((exercise) => exercise.exerciseKey === exerciseKey);
    if (!futureExercise) continue;
    const transition = REGISTERED_VARIANT_TRANSITIONS[exerciseKey]?.[0] || null;
    const decision = decideExerciseAdaptation({
      progressionMode:futureExercise.progressionMode || completedExercise.progressionMode,
      recentPerformances:history.map((item) => item.performance),
      nextVariantKey:transition,
    });
    if (!["progress_load","progress_reps","progress_duration","progress_variant"].includes(decision.action)) continue;

    const observed = observedLoadsForExercise(setResults, exerciseKey);
    const explicit = arr(explicitAvailableLoadsByExercise?.[exerciseKey]).map(finite).filter((value) => value != null && value > 0);
    const availableLoadsKg = [...new Set([...observed, ...explicit])].sort((a,b) => a-b);
    const mutation = applyAdaptationDecision({
      exercise:futureExercise,
      decision,
      availableLoadsKg,
      lastObservedLoadKg:lastObservedLoad(history[0].rows),
    });
    if (!mutation.applied) {
      proposals.push({ exerciseKey, applied:false, decision, mutation, targetProgramSessionId:nextSession.id });
      continue;
    }

    const newPayload = replaceExercise(nextSession.payload, exerciseKey, mutation.exercise);
    const ruleKeys = mergeDecisionAndMutationRuleKeys(decision, mutation);
    const metricsSnapshot = {
      sourceWorkoutSessionId:completedWorkoutSession.id,
      sourceProgramSessionId:completedProgramSession.id,
      recentPerformance:history.map((item) => ({ sessionId:item.sessionId, completedAt:item.completedAt, state:item.performance.state, confidence:item.performance.confidence })),
      observedLoadsKg:observed,
      explicitAvailableLoadsKg:explicit,
      mutation:mutation.mutation || null,
    };
    const audit = buildProgramAdjustmentAudit({
      adjustmentType:decision.action,
      reasonCode:decision.reasonCode,
      reasonText:decision.reasonText,
      ruleKeys,
      beforeState:futureExercise,
      afterState:mutation.exercise,
      metricsSnapshot,
      decisionConfidence:decision.confidence,
      decisionSource:"deterministic",
    });
    proposals.push({
      exerciseKey,
      applied:true,
      decision,
      mutation,
      targetProgramSessionId:nextSession.id,
      expectedRevision:Number(nextSession.revision || 1),
      newPayload,
      audit,
    });
  }
  return { valid:true, reasonCode:"OK", proposals };
}
