import { buildProgramAdjustmentAudit } from "./adaptation-audit.mjs";

const PROGRESSION_MODES = new Set(["load_progression", "double_progression", "reps_only", "duration_progression", "variant_progression"]);
const PERFORMANCE_STATES = new Set(["insufficient_data", "fatigue_signal", "underperformed", "on_target", "top_range_completed", "overperformed"]);

function cleanPerformance(value) {
  if (!value || !PERFORMANCE_STATES.has(value.state)) return null;
  const confidence = Number(value.confidence);
  return {
    state:value.state,
    confidence:Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    reasons:Array.isArray(value.reasons) ? value.reasons : [],
    effortObserved:Boolean(value.effortObserved),
    effortMatchedTarget:Boolean(value.effortMatchedTarget),
    effortComparedSets:Number.isFinite(Number(value.effortComparedSets)) ? Number(value.effortComparedSets) : 0,
  };
}
function recent(values = [], limit = 3) { return values.map(cleanPerformance).filter(Boolean).slice(0, limit); }
function minConfidence(values, fallback = 0.5) { return values.length ? Math.round(Math.min(...values.map((x) => x.confidence)) * 1000) / 1000 : fallback; }
function decision(action, reasonCode, reasonText, ruleKeys, performances, details = {}) {
  return { action, reasonCode, reasonText, ruleKeys, confidence:minConfidence(performances), ...details };
}
function progressDecision(mode, performances, { reasonCode, reasonText, ruleKeys, nextVariantKey }) {
  if (mode === "load_progression" || mode === "double_progression") {
    return decision("progress_load", reasonCode, `${reasonText} The actual load increment must come from known equipment and a separate increment guardrail.`, ruleKeys, performances, { progressionMode:mode });
  }
  if (mode === "reps_only") return decision("progress_reps", reasonCode, `${reasonText} Progress using repetitions.`, ruleKeys, performances, { progressionMode:mode });
  if (mode === "duration_progression") return decision("progress_duration", reasonCode, `${reasonText} Progress the timed target.`, ruleKeys, performances, { progressionMode:mode });
  if (mode === "variant_progression") {
    if (!nextVariantKey) return decision("hold", "VARIANT_LADDER_REQUIRED", "Progression is indicated, but TrainSync needs a registered next exercise variant before changing the movement.", ruleKeys, performances, { progressionMode:mode, needsVariant:true });
    return decision("progress_variant", reasonCode, `${reasonText} Move only to the next registered bodyweight variation.`, ruleKeys, performances, { progressionMode:mode, nextVariantKey });
  }
  return decision("hold", "UNSUPPORTED_PROGRESSION_MODE", "Hold until the progression mode can be resolved safely.", ["holdAfterSingleMiss"], performances, { progressionMode:mode });
}

export function decideExerciseAdaptation({ progressionMode, recentPerformances = [], nextVariantKey = null } = {}) {
  const mode = PROGRESSION_MODES.has(progressionMode) ? progressionMode : null;
  const history = recent(recentPerformances);
  if (!mode || !history.length || history[0].state === "insufficient_data") {
    return decision("hold", "INSUFFICIENT_DATA", "Hold the prescription until there is usable execution data.", ["holdAfterSingleMiss"], history, { progressionMode:mode });
  }

  const latest = history[0];
  const lastTwo = history.slice(0, 2);
  const lastThree = history.slice(0, 3);
  const repeatedFatigue = lastTwo.length >= 2 && lastTwo.every((x) => x.state === "fatigue_signal");
  const repeatedProblems = lastTwo.length >= 2 && lastTwo.every((x) => ["fatigue_signal", "underperformed"].includes(x.state));

  if (repeatedFatigue) {
    return decision("reduce_or_review", "REPEATED_FATIGUE_SIGNAL", "Repeated target misses at very high effort justify a conservative reduction or exercise-level review.", ["reduceAfterRepeatedFatigue"], lastTwo, { progressionMode:mode });
  }
  if (repeatedProblems) {
    return decision("reduce_or_review", "REPEATED_UNDERPERFORMANCE", "Repeated underperformance is stronger evidence than one bad session; review load, volume, recovery and exercise fit before progressing.", ["reduceAfterRepeatedFatigue"], lastTwo, { progressionMode:mode });
  }
  if (["fatigue_signal", "underperformed"].includes(latest.state)) {
    return decision("hold", "SINGLE_POOR_EXPOSURE", "One poor exposure is not enough evidence to rewrite the prescription.", ["holdAfterSingleMiss"], [latest], { progressionMode:mode });
  }
  if (latest.state === "on_target") {
    return decision("hold", "TARGET_MET", "The target was met; keep the prescription stable until there is a clearer progression signal.", ["progressionModeChoice"], [latest], { progressionMode:mode });
  }

  const lastTwoOver = lastTwo.length >= 2 && lastTwo.every((x) => x.state === "overperformed");
  if (lastTwoOver) {
    const effortConfirmed = lastTwo.every((x) => x.effortMatchedTarget && x.effortComparedSets > 0);
    return progressDecision(mode, lastTwo, {
      reasonCode:effortConfirmed ? "REPEATED_EFFORT_CONFIRMED_TOP_RANGE" : "REPEATED_CONTROLLED_OVERPERFORMANCE",
      reasonText:effortConfirmed
        ? "The top of the prescribed range was reached repeatedly while reported effort stayed within the prescribed RIR tolerance."
        : "Repeated top-range overperformance supports progression.",
      ruleKeys:["progressionAfterRepeatedSuccess", ...(effortConfirmed ? ["progressionAfterRepeatedEffortConfirmedTopRange"] : []), "progressionModeChoice"],
      nextVariantKey,
    });
  }

  const repeatedTopRange = lastThree.length >= 3 && lastThree.every((x) => ["top_range_completed","overperformed"].includes(x.state) && x.confidence >= 0.6);
  if (repeatedTopRange) {
    return progressDecision(mode, lastThree, {
      reasonCode:"REPEATED_TOP_RANGE_COMPLETION",
      reasonText:"The top of the prescribed range was completed across three consecutive exposures; this is a conservative TrainSync progression trigger when direct effort data are limited.",
      ruleKeys:["progressionAfterRepeatedTopRangeCompletion", "progressionModeChoice"],
      nextVariantKey,
    });
  }

  if (latest.state === "top_range_completed") {
    return decision("hold", "TOP_RANGE_NEEDS_CONFIRMATION", "The top of the range was completed, but limited effort data make one or two exposures insufficient for an automatic change.", ["progressionAfterRepeatedTopRangeCompletion"], [latest], { progressionMode:mode });
  }
  return decision("hold", "SINGLE_OVERPERFORMANCE", "One progression-capable exposure is promising but is not enough to force progression.", ["progressionAfterRepeatedSuccess", ...(latest.effortMatchedTarget ? ["progressionAfterRepeatedEffortConfirmedTopRange"] : [])], [latest], { progressionMode:mode });
}

export function buildAdaptationAudit(decisionResult, { beforeState = {}, afterState = {}, metricsSnapshot = {}, decisionSource = "deterministic" } = {}) {
  if (!decisionResult?.action) throw new Error("adaptation decision is required");
  return buildProgramAdjustmentAudit({
    adjustmentType:decisionResult.action,
    reasonCode:decisionResult.reasonCode,
    reasonText:decisionResult.reasonText,
    ruleKeys:decisionResult.ruleKeys || [],
    beforeState,
    afterState,
    metricsSnapshot:{ ...metricsSnapshot, adaptationAction:decisionResult.action, progressionMode:decisionResult.progressionMode || null },
    decisionConfidence:decisionResult.confidence,
    decisionSource,
  });
}

export function calendarDeloadPolicy() {
  return {
    automatic:false,
    action:"none",
    reasonCode:"NO_AUTOMATIC_CALENDAR_DELOAD",
    reasonText:"TrainSync does not reduce training solely because a block reached a fixed calendar week.",
    ruleKeys:["noAutomaticCalendarDeload"],
  };
}
