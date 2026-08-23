import { getExerciseDefinition } from "./exercise-catalog.mjs";

export const MUTATION_POLICY_VERSION = "2026-08-23.1";
export const MAX_AUTO_LOAD_JUMP_RATIO = 0.10;
export const REP_TARGET_INCREMENT = 1;
export const DURATION_TARGET_INCREMENT_SECONDS = 5;

// Intentionally tiny until bodyweight progression families are researched and reviewed.
// Same-family membership alone is not enough to claim that one variant is the correct next step.
export const REGISTERED_VARIANT_TRANSITIONS = Object.freeze({
  incline_push_up: Object.freeze(["push_up"]),
});

function clone(value) { return JSON.parse(JSON.stringify(value ?? null)); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function round(value, digits = 3) { const p = 10 ** digits; return Math.round(value * p) / p; }
function repsSet(set) { return String(set?.metricType || set?.metric_type || "reps") === "reps"; }
function durationSet(set) { return String(set?.metricType || set?.metric_type || "reps") === "duration_seconds"; }

export function resolveNextAvailableLoad({ currentLoadKg, availableLoadsKg = [], maxAutoJumpRatio = MAX_AUTO_LOAD_JUMP_RATIO } = {}) {
  const current = finite(currentLoadKg);
  if (current == null || current <= 0) return { resolved:false, reasonCode:"CURRENT_LOAD_UNKNOWN" };
  const loads = [...new Set((Array.isArray(availableLoadsKg) ? availableLoadsKg : []).map(finite).filter((x) => x != null && x > 0))].sort((a,b) => a-b);
  if (!loads.length) return { resolved:false, reasonCode:"LOAD_INVENTORY_REQUIRED" };
  const next = loads.find((value) => value > current + 1e-9);
  if (next == null) return { resolved:false, reasonCode:"NO_HIGHER_LOAD_AVAILABLE", currentLoadKg:current };
  const jumpRatio = (next - current) / current;
  if (jumpRatio > maxAutoJumpRatio + 1e-9) {
    return {
      resolved:false,
      reasonCode:"LOAD_JUMP_TOO_LARGE_FOR_AUTO_APPLY",
      currentLoadKg:current,
      candidateLoadKg:next,
      jumpRatio:round(jumpRatio),
      maxAutoJumpRatio,
    };
  }
  return {
    resolved:true,
    currentLoadKg:current,
    nextLoadKg:next,
    incrementKg:round(next - current),
    jumpRatio:round(jumpRatio),
    maxAutoJumpRatio,
  };
}

function commonPlannedLoad(exercise, lastObservedLoadKg = null) {
  const setLoads = (exercise?.sets || []).map((set) => finite(set?.weightKg ?? set?.targetWeightKg ?? set?.target_weight_kg)).filter((value) => value != null && value > 0);
  const unique = [...new Set(setLoads.map((value) => round(value)))];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) return null;
  const observed = finite(lastObservedLoadKg);
  return observed != null && observed > 0 ? observed : null;
}

function incrementReps(exercise) {
  const next = clone(exercise);
  const strengthCap = String(next?.role || "") === "primary_strength" ? 10 : 40;
  let changed = 0;
  for (const set of next.sets || []) {
    if (!repsSet(set)) continue;
    const min = finite(set.minReps ?? set.targetReps ?? set.reps);
    const max = finite(set.maxReps ?? set.targetReps ?? set.reps);
    if (min == null || max == null) return { applied:false, reasonCode:"REP_TARGET_MISSING" };
    if (max + REP_TARGET_INCREMENT > strengthCap) return { applied:false, reasonCode:"REP_CEILING_REACHED", maxAllowedReps:strengthCap };
    set.minReps = Math.round(min + REP_TARGET_INCREMENT);
    set.maxReps = Math.round(max + REP_TARGET_INCREMENT);
    changed += 1;
  }
  if (!changed) return { applied:false, reasonCode:"NO_REP_SETS" };
  return {
    applied:true,
    exercise:next,
    reasonCode:"REP_TARGET_INCREMENTED",
    ruleKeys:["repTargetIncrement", ...(strengthCap === 10 ? ["primaryStrengthMaxReps"] : [])],
    mutation:{ type:"reps", increment:REP_TARGET_INCREMENT, changedSets:changed },
  };
}

function incrementDuration(exercise) {
  const next = clone(exercise);
  let changed = 0;
  for (const set of next.sets || []) {
    if (!durationSet(set)) continue;
    const min = finite(set.minDurationSeconds ?? set.targetDurationSeconds ?? set.durationSeconds);
    const max = finite(set.maxDurationSeconds ?? set.targetDurationSeconds ?? set.durationSeconds);
    if (min == null || max == null) return { applied:false, reasonCode:"DURATION_TARGET_MISSING" };
    if (max + DURATION_TARGET_INCREMENT_SECONDS > 600) return { applied:false, reasonCode:"DURATION_CEILING_REACHED" };
    set.minDurationSeconds = Math.round(min + DURATION_TARGET_INCREMENT_SECONDS);
    set.maxDurationSeconds = Math.round(max + DURATION_TARGET_INCREMENT_SECONDS);
    changed += 1;
  }
  if (!changed) return { applied:false, reasonCode:"NO_DURATION_SETS" };
  return {
    applied:true,
    exercise:next,
    reasonCode:"DURATION_TARGET_INCREMENTED",
    ruleKeys:["durationTargetIncrement"],
    mutation:{ type:"duration_seconds", incrementSeconds:DURATION_TARGET_INCREMENT_SECONDS, changedSets:changed },
  };
}

function incrementLoad(exercise, { availableLoadsKg = [], lastObservedLoadKg = null } = {}) {
  const currentLoadKg = commonPlannedLoad(exercise, lastObservedLoadKg);
  if (currentLoadKg == null) return { applied:false, reasonCode:"CURRENT_LOAD_UNKNOWN_OR_NONUNIFORM" };
  const resolution = resolveNextAvailableLoad({ currentLoadKg, availableLoadsKg });
  if (!resolution.resolved) return { applied:false, ...resolution, ruleKeys:["equipmentAwareLoadIncrement"] };
  const next = clone(exercise);
  let changed = 0;
  for (const set of next.sets || []) {
    if (!repsSet(set)) continue;
    set.weightKg = resolution.nextLoadKg;
    changed += 1;
  }
  if (!changed) return { applied:false, reasonCode:"NO_LOADABLE_REP_SETS" };
  return {
    applied:true,
    exercise:next,
    reasonCode:"LOAD_INCREMENT_APPLIED",
    ruleKeys:["equipmentAwareLoadIncrement"],
    mutation:{ type:"load", ...resolution, changedSets:changed },
  };
}

function progressVariant(exercise, nextVariantKey) {
  const currentKey = String(exercise?.exerciseKey || "");
  const allowed = REGISTERED_VARIANT_TRANSITIONS[currentKey] || [];
  if (!nextVariantKey || !allowed.includes(nextVariantKey)) {
    return { applied:false, reasonCode:"VARIANT_TRANSITION_NOT_REGISTERED", currentExerciseKey:currentKey, requestedVariantKey:nextVariantKey || null, ruleKeys:["registeredVariantOnly"] };
  }
  const currentDef = getExerciseDefinition(currentKey);
  const nextDef = getExerciseDefinition(nextVariantKey);
  if (!currentDef || !nextDef || currentDef.family !== nextDef.family) return { applied:false, reasonCode:"VARIANT_FAMILY_MISMATCH", ruleKeys:["registeredVariantOnly"] };
  const next = clone(exercise);
  next.exerciseKey = nextDef.key;
  next.name = nextDef.name;
  next.movementPattern = nextDef.movementPattern;
  next.loadType = nextDef.loadType;
  next.requiredEquipment = [...nextDef.requiredEquipment];
  next.primaryMuscles = [...nextDef.primaryMuscles];
  next.secondaryMuscles = [...nextDef.secondaryMuscles];
  next.fatigueTags = [...(nextDef.fatigueTags || [])];
  next.progressionMode = nextDef.progressionMode;
  next.setMetric = nextDef.defaultSetMetric || "reps";
  next.exerciseFamily = nextDef.family;
  return {
    applied:true,
    exercise:next,
    reasonCode:"REGISTERED_VARIANT_APPLIED",
    ruleKeys:["registeredVariantOnly"],
    mutation:{ type:"variant", fromExerciseKey:currentKey, toExerciseKey:nextDef.key },
  };
}

export function applyAdaptationDecision({ exercise, decision, availableLoadsKg = [], lastObservedLoadKg = null } = {}) {
  if (!exercise || typeof exercise !== "object") return { applied:false, reasonCode:"EXERCISE_REQUIRED" };
  const action = String(decision?.action || "hold");
  if (action === "hold" || action === "reduce_or_review") return { applied:false, reasonCode:action === "hold" ? "HOLD_NO_MUTATION" : "REVIEW_REQUIRED", exercise:clone(exercise), ruleKeys:decision?.ruleKeys || [] };
  if (action === "progress_reps") return incrementReps(exercise);
  if (action === "progress_duration") return incrementDuration(exercise);
  if (action === "progress_load") return incrementLoad(exercise, { availableLoadsKg, lastObservedLoadKg });
  if (action === "progress_variant") return progressVariant(exercise, decision?.nextVariantKey);
  return { applied:false, reasonCode:"UNSUPPORTED_ADAPTATION_ACTION", action };
}

export function mergeDecisionAndMutationRuleKeys(decision, mutation) {
  return [...new Set([...(decision?.ruleKeys || []), ...(mutation?.ruleKeys || [])])];
}
