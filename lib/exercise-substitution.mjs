import {
  EXERCISE_CATALOG_VERSION,
  exerciseCatalogForEquipment,
  getExerciseDefinition,
} from "./exercise-catalog.mjs";

export const EXERCISE_SUBSTITUTION_VERSION = "2026-08-28.1";
const ALWAYS_AVAILABLE = new Set(["bodyweight", "floor", "wall"]);
const LIMITING_FATIGUE = new Set(["grip", "spinal_bracing", "core_bracing", "hinge", "shoulder_girdle_stability"]);

function arr(value) { return Array.isArray(value) ? value : []; }
function set(value) { return new Set(arr(value)); }
function overlapRatio(a, b) {
  const left = set(a), right = set(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  return shared / Math.max(left.size, right.size);
}
function jaccard(a, b) {
  const left = set(a), right = set(b);
  const union = new Set([...left, ...right]);
  if (!union.size) return 1;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  return shared / union.size;
}
function equipmentAvailable(entry, equipment = []) {
  const allowed = new Set([...ALWAYS_AVAILABLE, ...arr(equipment)]);
  return arr(entry?.requiredEquipment).every((item) => allowed.has(item));
}
function limitingFatigue(entry) {
  return arr(entry?.fatigueTags).filter((tag) => LIMITING_FATIGUE.has(tag));
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }

export function scoreExerciseSubstitution(originalValue, candidateValue, { equipment = [] } = {}) {
  const original = getExerciseDefinition(originalValue);
  const candidate = getExerciseDefinition(candidateValue);
  if (!original || !candidate) return { eligible:false, score:0, tier:"reject", reasonCode:"UNKNOWN_EXERCISE" };
  if (original.key === candidate.key) return { eligible:false, score:0, tier:"reject", reasonCode:"SAME_EXERCISE" };
  if (!equipmentAvailable(candidate, equipment)) return { eligible:false, score:0, tier:"reject", reasonCode:"EQUIPMENT_UNAVAILABLE" };
  if (original.defaultSetMetric !== candidate.defaultSetMetric) return { eligible:false, score:0, tier:"reject", reasonCode:"SET_METRIC_MISMATCH" };

  const primaryOverlap = overlapRatio(original.primaryMuscles, candidate.primaryMuscles);
  const sameMovement = original.movementPattern === candidate.movementPattern;
  const sameFamily = Boolean(original.family && candidate.family && original.family === candidate.family);
  if (!sameMovement && primaryOverlap < 0.75) return { eligible:false, score:0, tier:"reject", reasonCode:"STIMULUS_MISMATCH" };
  if (primaryOverlap < 0.5) return { eligible:false, score:0, tier:"reject", reasonCode:"PRIMARY_TARGET_MISMATCH" };

  const secondaryOverlap = jaccard(original.secondaryMuscles, candidate.secondaryMuscles);
  const fatigueOverlap = jaccard(limitingFatigue(original), limitingFatigue(candidate));
  const sameLoadType = original.loadType === candidate.loadType;
  const sameProgression = original.progressionMode === candidate.progressionMode;

  let score = 0;
  if (sameMovement) score += 35;
  if (sameFamily) score += 18;
  score += primaryOverlap * 30;
  score += secondaryOverlap * 4;
  score += fatigueOverlap * 5;
  if (sameLoadType) score += 5;
  if (sameProgression) score += 3;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const tier = score >= 82 ? "strong" : score >= 68 ? "good" : score >= 55 ? "compromise" : "reject";
  if (tier === "reject") return { eligible:false, score, tier, reasonCode:"SUBSTITUTION_SCORE_TOO_LOW" };

  const warnings = [];
  if (!sameMovement) warnings.push("MOVEMENT_PATTERN_CHANGED");
  if (!sameLoadType) warnings.push("LOAD_SEMANTICS_CHANGED");
  if (fatigueOverlap < 0.5 && (limitingFatigue(original).length || limitingFatigue(candidate).length)) warnings.push("FATIGUE_PROFILE_CHANGED");
  if (!sameProgression) warnings.push("PROGRESSION_MODE_CHANGED");

  const reasons = unique([
    sameMovement ? "same movement pattern" : null,
    sameFamily ? "same exercise family" : null,
    primaryOverlap >= 0.99 ? "same primary muscle target" : primaryOverlap >= 0.75 ? "high primary-target overlap" : "acceptable primary-target overlap",
    sameLoadType ? "same load type" : null,
  ]);

  return {
    eligible:true,
    score,
    tier,
    reasonCode:"SUBSTITUTION_ALLOWED",
    originalKey:original.key,
    candidateKey:candidate.key,
    primaryOverlap:Math.round(primaryOverlap * 100) / 100,
    sameMovement,
    sameFamily,
    sameLoadType,
    sameProgression,
    warnings,
    reasons,
    loadTransferAllowed:false,
    prescriptionTransfer:{ setMetric:true, setCount:true, targetRange:true, targetRir:true, rest:true, load:false },
    policyVersion:EXERCISE_SUBSTITUTION_VERSION,
    catalogVersion:EXERCISE_CATALOG_VERSION,
  };
}

export function exerciseSubstitutionCandidates(originalValue, { equipment = [], limit = 8 } = {}) {
  const original = getExerciseDefinition(originalValue);
  if (!original) return [];
  return exerciseCatalogForEquipment(equipment)
    .filter((entry) => entry.key !== original.key)
    .map((entry) => ({ entry, assessment:scoreExerciseSubstitution(original.key, entry.key, { equipment }) }))
    .filter(({ assessment }) => assessment.eligible)
    .sort((a,b) => b.assessment.score - a.assessment.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 8)))
    .map(({ entry, assessment }) => ({
      exerciseKey:entry.key,
      name:entry.name,
      movementPattern:entry.movementPattern,
      loadType:entry.loadType,
      requiredEquipment:[...entry.requiredEquipment],
      primaryMuscles:[...entry.primaryMuscles],
      secondaryMuscles:[...entry.secondaryMuscles],
      fatigueTags:[...entry.fatigueTags],
      progressionMode:entry.progressionMode,
      setMetric:entry.defaultSetMetric,
      family:entry.family || null,
      ...assessment,
    }));
}

export function validateExerciseSubstitution(originalKey, replacementKey, options = {}) {
  const assessment = scoreExerciseSubstitution(originalKey, replacementKey, options);
  if (!assessment.eligible) {
    const error = new Error(`EXERCISE_SUBSTITUTION_NOT_ALLOWED:${assessment.reasonCode}`);
    error.code = assessment.reasonCode;
    error.assessment = assessment;
    throw error;
  }
  return assessment;
}
