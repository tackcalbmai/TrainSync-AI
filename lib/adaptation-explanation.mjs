function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function array(value) { return Array.isArray(value) ? value : []; }
function exerciseState(value) {
  if (!value || typeof value !== "object") return {};
  return value.exercise && typeof value.exercise === "object" ? value.exercise : value;
}
function workingSets(value) {
  return array(exerciseState(value).sets).filter((set) => !Boolean(set?.isWarmup ?? set?.is_warmup)).length;
}
function firstWorkingSet(value) {
  return array(exerciseState(value).sets).find((set) => !Boolean(set?.isWarmup ?? set?.is_warmup)) || null;
}
function range(set, metric) {
  if (!set) return null;
  if (metric === "duration") {
    const exact = finite(set.targetDurationSeconds ?? set.target_duration_seconds);
    const min = finite(set.minDurationSeconds ?? set.target_min_duration_seconds ?? exact);
    const max = finite(set.maxDurationSeconds ?? set.target_max_duration_seconds ?? exact ?? min);
    if (min == null && max == null) return null;
    return min === max ? `${min}s` : `${min ?? "—"}–${max ?? "—"}s`;
  }
  const exact = finite(set.targetReps ?? set.target_reps);
  const min = finite(set.minReps ?? set.target_min_reps ?? exact);
  const max = finite(set.maxReps ?? set.target_max_reps ?? exact ?? min);
  if (min == null && max == null) return null;
  return min === max ? `${min} reps` : `${min ?? "—"}–${max ?? "—"} reps`;
}
function fmt(value, digits = 1) {
  const number = finite(value);
  if (number == null) return null;
  return Number(number.toFixed(digits)).toString();
}

const WHY = Object.freeze({
  REPEATED_HIGH_EFFORT_UNDERPERFORMANCE:"Repeated exposures missed the target at very high reported effort, so TrainSync made only a small reversible change instead of rewriting the program.",
  REPEATED_UNDERPERFORMANCE:"The target was missed across repeated exposures, which is a stronger signal than one difficult session.",
  REPEATED_EFFORT_CONFIRMED_TOP_RANGE:"Repeated sessions reached the top of the prescribed range while reported effort stayed comparable to the prescribed RIR target.",
  REPEATED_CONTROLLED_OVERPERFORMANCE:"Repeated sessions exceeded the target without a high-effort signal, supporting a conservative progression.",
  REPEATED_TOP_RANGE_COMPLETION:"The top of the prescribed range was completed across three consecutive exposures; direct effort data were limited, so TrainSync waited for repeated confirmation before progressing.",
  RECOVERED_AFTER_VOLUME_REDUCTION:"Performance stabilized after a temporary volume reduction, so one working set was restored toward the recorded baseline.",
  SINGLE_POOR_EXPOSURE:"One poor exposure was recorded, but TrainSync does not rewrite a prescription from one difficult session.",
  TARGET_MET:"The prescribed target was met, but there was not yet a strong enough signal to change the next exposure.",
});

const TITLES = Object.freeze({
  progress_load:"LOAD PROGRESSED",
  progress_reps:"REPS PROGRESSED",
  progress_duration:"TIME PROGRESSED",
  progress_variant:"VARIANT PROGRESSED",
  reduce_volume:"VOLUME REDUCED",
  restore_volume:"VOLUME RESTORED",
  reduce_or_review:"REVIEW REQUIRED",
  hold:"PRESCRIPTION HELD",
});

export function summarizePrescriptionChange(beforeState, afterState) {
  const before = exerciseState(beforeState);
  const after = exerciseState(afterState);
  const beforeCount = workingSets(before);
  const afterCount = workingSets(after);
  if (beforeCount && afterCount && beforeCount !== afterCount) return `${beforeCount} → ${afterCount} working sets`;

  const beforeSet = firstWorkingSet(before);
  const afterSet = firstWorkingSet(after);
  const beforeWeight = finite(beforeSet?.weightKg ?? beforeSet?.weight_kg);
  const afterWeight = finite(afterSet?.weightKg ?? afterSet?.weight_kg);
  if (beforeWeight != null && afterWeight != null && Math.abs(beforeWeight - afterWeight) > 1e-9) return `${fmt(beforeWeight)} → ${fmt(afterWeight)} kg`;

  const beforeReps = range(beforeSet, "reps");
  const afterReps = range(afterSet, "reps");
  if (beforeReps && afterReps && beforeReps !== afterReps) return `${beforeReps} → ${afterReps}`;

  const beforeDuration = range(beforeSet, "duration");
  const afterDuration = range(afterSet, "duration");
  if (beforeDuration && afterDuration && beforeDuration !== afterDuration) return `${beforeDuration} → ${afterDuration}`;

  const beforeKey = String(before.exerciseKey ?? before.exercise_key ?? "").trim();
  const afterKey = String(after.exerciseKey ?? after.exercise_key ?? "").trim();
  if (beforeKey && afterKey && beforeKey !== afterKey) return `${before.name || beforeKey} → ${after.name || afterKey}`;
  return "Prescription updated within registered guardrails";
}

export function explainProgramAdjustment(adjustment = {}) {
  const reasonCode = String(adjustment.reason_code || adjustment.reasonCode || "").trim();
  const adjustmentType = String(adjustment.adjustment_type || adjustment.adjustmentType || "change").trim();
  const confidence = finite(adjustment.decision_confidence ?? adjustment.decisionConfidence);
  const evidenceLevel = String(adjustment.evidence_level || adjustment.evidenceLevel || "heuristic").toLowerCase();
  const createdAt = adjustment.created_at || adjustment.createdAt || null;
  const rules = array(adjustment.evidence_rule_keys ?? adjustment.evidenceRuleKeys).map(String);
  const claims = array(adjustment.evidence_claim_ids ?? adjustment.evidenceClaimIds).map(String);
  const why = WHY[reasonCode] || String(adjustment.reason_text || adjustment.reasonText || "TrainSync changed the next prescription because the deterministic adaptation rules found a confirmed performance signal.");
  return {
    title:TITLES[adjustmentType] || adjustmentType.replace(/_/g, " ").toUpperCase(),
    why,
    change:summarizePrescriptionChange(adjustment.before_state ?? adjustment.beforeState, adjustment.after_state ?? adjustment.afterState),
    confidencePct:confidence == null ? null : Math.round(Math.max(0, Math.min(1, confidence)) * 100),
    evidenceLevel,
    scienceVersion:adjustment.science_version || adjustment.scienceVersion || null,
    decisionSource:adjustment.decision_source || adjustment.decisionSource || "deterministic",
    reasonCode:reasonCode || null,
    reasonText:String(adjustment.reason_text || adjustment.reasonText || "").trim() || null,
    rules,
    claims,
    createdAt,
  };
}
