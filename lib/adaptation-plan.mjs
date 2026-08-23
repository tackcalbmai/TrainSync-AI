import { classifyExercisePerformance } from "./programming-engine.mjs";
import { getExerciseDefinition } from "./exercise-catalog.mjs";
import { decideExerciseAdaptation } from "./adaptation-policy.mjs";
import { buildProgramAdjustmentAudit } from "./adaptation-audit.mjs";
import {
  applyAdaptationDecision,
  mergeDecisionAndMutationRuleKeys,
  REGISTERED_VARIANT_TRANSITIONS,
} from "./prescription-mutation.mjs";

const INPUT_REQUIRED_MUTATION_REASONS = new Set([
  "CURRENT_LOAD_UNKNOWN_OR_NONUNIFORM",
  "LOAD_INVENTORY_REQUIRED",
  "NO_HIGHER_LOAD_AVAILABLE",
  "LOAD_JUMP_TOO_LARGE_FOR_AUTO_APPLY",
]);
const EFFORT_RIR_TOLERANCE = 1;

function arr(value) { return Array.isArray(value) ? value : []; }
function finite(value) { if (value == null || value === "") return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function clone(value) { return JSON.parse(JSON.stringify(value ?? null)); }
function isoTime(value) { const ms = Date.parse(value || ""); return Number.isFinite(ms) ? ms : 0; }

function targetFromResult(row) {
  const targetRir = row.target_rir == null ? null : Number(row.target_rir);
  const timed = String(row.metric_type || "reps") === "duration_seconds";
  if (timed) return {
    metricType:"duration_seconds",
    minDurationSeconds:row.target_min_duration_seconds ?? row.target_duration_seconds ?? null,
    maxDurationSeconds:row.target_max_duration_seconds ?? row.target_duration_seconds ?? null,
    targetRir,
  };
  return {
    metricType:"reps",
    minReps:row.target_min_reps ?? row.target_reps ?? null,
    maxReps:row.target_max_reps ?? row.target_reps ?? null,
    targetWeightKg:row.target_weight_kg == null ? null : Number(row.target_weight_kg),
    targetRir,
  };
}

function actualFromResult(row) {
  const timed = String(row.metric_type || "reps") === "duration_seconds";
  return timed
    ? { metricType:"duration_seconds", durationSeconds:row.duration_seconds == null ? null : Number(row.duration_seconds), rpe:row.rpe == null ? null : Number(row.rpe) }
    : { metricType:"reps", reps:row.reps == null ? null : Number(row.reps), weightKg:row.weight_kg == null ? null : Number(row.weight_kg), rpe:row.rpe == null ? null : Number(row.rpe) };
}

function topRangeStatus(rows = []) {
  let eligible = 0, reached = 0, exceeded = 0, highEffort = false;
  let effortObserved = 0, effortComparable = 0, effortMatched = 0, effortAboveTarget = 0;
  for (const row of rows) {
    const timed = String(row.metric_type || "reps") === "duration_seconds";
    const targetMax = timed
      ? finite(row.target_max_duration_seconds ?? row.target_duration_seconds)
      : finite(row.target_max_reps ?? row.target_reps);
    const actual = timed ? finite(row.duration_seconds) : finite(row.reps);
    if (targetMax != null && targetMax > 0 && actual != null && actual > 0) {
      eligible += 1;
      if (actual >= targetMax) reached += 1;
      if (actual > targetMax) exceeded += 1;
    }
    const rpe = finite(row.rpe);
    if (rpe != null) {
      effortObserved += 1;
      if (rpe >= 9.5) highEffort = true;
      const targetRir = finite(row.target_rir);
      if (targetRir != null && targetRir >= 0 && targetRir <= 6) {
        effortComparable += 1;
        const actualRir = Math.max(0, 10 - rpe);
        if (actualRir + EFFORT_RIR_TOLERANCE >= targetRir) effortMatched += 1;
        else effortAboveTarget += 1;
      }
    }
  }
  return {
    allTop:eligible > 0 && eligible === rows.length && reached === eligible,
    exceeded,
    highEffort,
    effortObserved,
    effortComparable,
    effortAboveTarget,
    allEffortMatched:rows.length > 0 && effortComparable === rows.length && effortMatched === rows.length,
    effortToleranceRir:EFFORT_RIR_TOLERANCE,
  };
}

export function classifyResultExposure(rows = []) {
  const working = arr(rows).filter((row) => !row.is_warmup).sort((a,b) => Number(a.set_index || 0) - Number(b.set_index || 0));
  const targets = working.map(targetFromResult);
  const actuals = working.map(actualFromResult);
  let result = classifyExercisePerformance({ targetSets:targets, actualSets:actuals });

  const top = topRangeStatus(working);
  const stableBase = !["fatigue_signal","underperformed","insufficient_data"].includes(result.state);
  if (stableBase && top.allTop && top.effortAboveTarget > 0) {
    result = {
      state:"on_target",
      confidence:0.72,
      effortObserved:true,
      effortMatchedTarget:false,
      effortComparedSets:top.effortComparable,
      effortToleranceRir:top.effortToleranceRir,
      reasons:["The top of the prescribed range was reached, but reported effort was materially higher than the prescribed RIR target; hold rather than progress."],
    };
  } else if (stableBase && top.allTop && top.allEffortMatched) {
    result = {
      state:"overperformed",
      confidence:0.8,
      effortObserved:true,
      effortMatchedTarget:true,
      effortComparedSets:top.effortComparable,
      effortToleranceRir:top.effortToleranceRir,
      reasons:["Every working set reached the top of its prescribed range while reported effort stayed within the prescribed RIR tolerance."],
    };
  } else if (stableBase && top.allTop && !top.highEffort) {
    result = top.exceeded > 0
      ? { state:"overperformed", confidence:0.76, effortObserved:top.effortObserved > 0, effortMatchedTarget:false, effortComparedSets:top.effortComparable, effortToleranceRir:top.effortToleranceRir, reasons:["Every working set reached the top of its prescribed range and at least one exceeded it without a recorded high-effort signal."] }
      : { state:"top_range_completed", confidence:0.66, effortObserved:top.effortObserved > 0, effortMatchedTarget:false, effortComparedSets:top.effortComparable, effortToleranceRir:top.effortToleranceRir, reasons:["Every working set reached the top of its prescribed range without complete effort confirmation."] };
  } else if (result.state === "overperformed" && !top.allTop) {
    result = { state:"on_target", confidence:0.7, effortObserved:top.effortObserved > 0, effortMatchedTarget:false, effortComparedSets:top.effortComparable, reasons:["Some work exceeded the range, but not every working set reached the top; keep the prescription stable."] };
  }

  const comparableWeights = working.map((row) => ({ target:finite(row.target_weight_kg), actual:finite(row.weight_kg) })).filter((x) => x.target != null && x.target > 0 && x.actual != null && x.actual > 0);
  if (comparableWeights.some((x) => x.actual + 1e-9 < x.target)) {
    result = { state:"underperformed", confidence:Math.max(0.7, Number(result.confidence || 0)), effortObserved:top.effortObserved > 0, effortMatchedTarget:false, effortComparedSets:top.effortComparable, reasons:["At least one working set used less load than prescribed; repetition count alone cannot be treated as overperformance."] };
  }

  const effortFullyComparable = working.length > 0 && top.effortComparable === working.length;
  if (!effortFullyComparable && ["overperformed","top_range_completed"].includes(result.state)) {
    const cap = result.state === "overperformed" ? 0.68 : 0.62;
    result = { ...result, confidence:Math.min(Number(result.confidence || cap), cap), reasons:[...(result.reasons || []), "Complete prescribed-vs-reported effort data were not available, so progression confidence is reduced."] };
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

function reviewMessage(item) {
  if (item?.mutation?.reasonCode === "MINIMUM_WORKING_SETS_REACHED") return "Repeated fatigue was detected, but TrainSync will not reduce this exercise below two working sets automatically. Review load, recovery, and exercise fit before making another change.";
  if (item?.decision?.reasonCode === "REPEATED_UNDERPERFORMANCE") return "Repeated underperformance needs review before TrainSync changes the prescription. Check load selection, recovery, technique, and whether this exercise still fits the program.";
  return item?.decision?.reasonText || "TrainSync reached a safety boundary and needs this exercise reviewed before another automatic change.";
}

function requirementsFromProposals(proposals = []) {
  const requirements = [];
  for (const item of arr(proposals)) {
    if (item?.applied || !item?.exerciseKey || !item?.targetProgramSessionId) continue;
    if (INPUT_REQUIRED_MUTATION_REASONS.has(item?.mutation?.reasonCode)) {
      requirements.push({
        type:"load_options",
        exerciseKey:item.exerciseKey,
        targetProgramSessionId:item.targetProgramSessionId,
        reasonCode:item.mutation.reasonCode,
        currentLoadKg:item.mutation.currentLoadKg ?? null,
        candidateLoadKg:item.mutation.candidateLoadKg ?? null,
        jumpRatio:item.mutation.jumpRatio ?? null,
        message:item.mutation.reasonCode === "LOAD_JUMP_TOO_LARGE_FOR_AUTO_APPLY"
          ? "The next known load jump is too large for automatic progression. Confirm a smaller available load or keep the current prescription."
          : "TrainSync needs a known next available load for this exercise before applying a load progression.",
      });
      continue;
    }
    if (item?.decision?.action === "reduce_or_review") {
      requirements.push({
        type:"review",
        exerciseKey:item.exerciseKey,
        targetProgramSessionId:item.targetProgramSessionId,
        reasonCode:item.mutation?.reasonCode || item.decision.reasonCode || "REVIEW_REQUIRED",
        decisionReasonCode:item.decision.reasonCode || null,
        decisionReasonText:item.decision.reasonText || null,
        beforeWorkingSets:item.mutation?.beforeWorkingSets ?? null,
        minimumWorkingSets:item.mutation?.minimumWorkingSets ?? null,
        message:reviewMessage(item),
      });
    }
  }
  return requirements;
}

export function buildPostSessionAdaptationPlan({
  completedProgramSession,
  completedWorkoutSession,
  setResults = [],
  futureProgramSessions = [],
  explicitAvailableLoadsByExercise = {},
} = {}) {
  if (!completedProgramSession?.id || !completedWorkoutSession?.id) return { valid:false, reasonCode:"COMPLETED_SESSION_CONTEXT_REQUIRED", proposals:[], requirements:[] };
  if (completedWorkoutSession.program_session_id !== completedProgramSession.id) return { valid:false, reasonCode:"PROGRAM_SESSION_LINK_NOT_CONFIRMED", proposals:[], requirements:[] };
  if (String(completedWorkoutSession.status || "") !== "completed") return { valid:false, reasonCode:"WORKOUT_SESSION_NOT_COMPLETED", proposals:[], requirements:[] };

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
    const definition = getExerciseDefinition(exerciseKey);
    const progressionMode = definition?.progressionMode || futureExercise.progressionMode || completedExercise.progressionMode;
    const transition = REGISTERED_VARIANT_TRANSITIONS[exerciseKey]?.[0] || null;
    const decision = decideExerciseAdaptation({
      progressionMode,
      recentPerformances:history.map((item) => item.performance),
      nextVariantKey:transition,
    });
    if (!["progress_load","progress_reps","progress_duration","progress_variant","reduce_or_review"].includes(decision.action)) continue;

    const observed = observedLoadsForExercise(setResults, exerciseKey);
    const explicit = arr(explicitAvailableLoadsByExercise?.[exerciseKey]).map(finite).filter((value) => value != null && value > 0);
    const availableLoadsKg = [...new Set([...observed, ...explicit])].sort((a,b) => a-b);
    const mutation = applyAdaptationDecision({
      exercise:{ ...futureExercise, progressionMode },
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
      progressionModeSource:definition?.progressionMode ? "exercise_catalog" : "program_payload",
      recentPerformance:history.map((item) => ({
        sessionId:item.sessionId,
        completedAt:item.completedAt,
        state:item.performance.state,
        confidence:item.performance.confidence,
        effortObserved:Boolean(item.performance.effortObserved),
        effortMatchedTarget:Boolean(item.performance.effortMatchedTarget),
        effortComparedSets:Number(item.performance.effortComparedSets || 0),
        reasons:item.performance.reasons || [],
      })),
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
  return { valid:true, reasonCode:"OK", proposals, requirements:requirementsFromProposals(proposals) };
}
