import test from "node:test";
import assert from "node:assert/strict";
import { buildAdaptationAudit, calendarDeloadPolicy, decideExerciseAdaptation } from "../lib/adaptation-policy.mjs";

test("one poor session does not trigger an automatic reduction", () => {
  const result = decideExerciseAdaptation({ progressionMode:"double_progression", recentPerformances:[{ state:"underperformed", confidence:0.8 }] });
  assert.equal(result.action, "hold");
  assert.equal(result.reasonCode, "SINGLE_POOR_EXPOSURE");
});

test("repeated fatigue triggers reduction or review rather than progression", () => {
  const result = decideExerciseAdaptation({ progressionMode:"load_progression", recentPerformances:[
    { state:"fatigue_signal", confidence:0.9 },
    { state:"fatigue_signal", confidence:0.8 },
  ] });
  assert.equal(result.action, "reduce_or_review");
  assert.equal(result.reasonCode, "REPEATED_FATIGUE_SIGNAL");
});

test("single controlled overperformance is held for confirmation", () => {
  const result = decideExerciseAdaptation({ progressionMode:"load_progression", recentPerformances:[{ state:"overperformed", confidence:0.8 }] });
  assert.equal(result.action, "hold");
  assert.equal(result.reasonCode, "SINGLE_OVERPERFORMANCE");
});

test("two controlled overperformances progress according to exercise progression mode", () => {
  const history = [{ state:"overperformed", confidence:0.82 }, { state:"overperformed", confidence:0.78 }];
  assert.equal(decideExerciseAdaptation({ progressionMode:"load_progression", recentPerformances:history }).action, "progress_load");
  assert.equal(decideExerciseAdaptation({ progressionMode:"reps_only", recentPerformances:history }).action, "progress_reps");
  assert.equal(decideExerciseAdaptation({ progressionMode:"duration_progression", recentPerformances:history }).action, "progress_duration");
});

test("two top-range completions without direct effort data are not enough to progress", () => {
  const history = [
    { state:"top_range_completed", confidence:0.62 },
    { state:"top_range_completed", confidence:0.62 },
  ];
  const result = decideExerciseAdaptation({ progressionMode:"double_progression", recentPerformances:history });
  assert.equal(result.action, "hold");
  assert.equal(result.reasonCode, "TOP_RANGE_NEEDS_CONFIRMATION");
});

test("three consecutive top-range completions can trigger conservative progression", () => {
  const history = [
    { state:"top_range_completed", confidence:0.62 },
    { state:"top_range_completed", confidence:0.62 },
    { state:"top_range_completed", confidence:0.62 },
  ];
  const result = decideExerciseAdaptation({ progressionMode:"reps_only", recentPerformances:history });
  assert.equal(result.action, "progress_reps");
  assert.equal(result.reasonCode, "REPEATED_TOP_RANGE_COMPLETION");
  assert.ok(result.ruleKeys.includes("progressionAfterRepeatedTopRangeCompletion"));
});

test("bodyweight variant progression refuses to invent the next movement", () => {
  const history = [{ state:"overperformed", confidence:0.8 }, { state:"overperformed", confidence:0.8 }];
  const missing = decideExerciseAdaptation({ progressionMode:"variant_progression", recentPerformances:history });
  assert.equal(missing.action, "hold");
  assert.equal(missing.reasonCode, "VARIANT_LADDER_REQUIRED");
  const registered = decideExerciseAdaptation({ progressionMode:"variant_progression", recentPerformances:history, nextVariantKey:"archer_push_up" });
  assert.equal(registered.action, "progress_variant");
  assert.equal(registered.nextVariantKey, "archer_push_up");
});

test("adaptation decisions create science-versioned audit payloads", () => {
  const decision = decideExerciseAdaptation({ progressionMode:"reps_only", recentPerformances:[
    { state:"overperformed", confidence:0.84 },
    { state:"overperformed", confidence:0.79 },
  ] });
  const audit = buildAdaptationAudit(decision, { beforeState:{ maxReps:10 }, afterState:{ maxReps:11 }, metricsSnapshot:{ completedSets:3 } });
  assert.equal(audit.adjustment_type, "progress_reps");
  assert.equal(audit.evidence_level, "moderate");
  assert.ok(audit.evidence_claim_ids.includes("repetitions_and_load_are_both_viable_progression_tools"));
  assert.equal(audit.metrics_snapshot.completedSets, 3);
});

test("top-range heuristic stays labeled heuristic in scientific audit", () => {
  const decision = decideExerciseAdaptation({ progressionMode:"reps_only", recentPerformances:[
    { state:"top_range_completed", confidence:0.62 },
    { state:"top_range_completed", confidence:0.62 },
    { state:"top_range_completed", confidence:0.62 },
  ] });
  const audit = buildAdaptationAudit(decision, { beforeState:{ maxReps:10 }, afterState:{ maxReps:11 } });
  assert.equal(audit.evidence_level, "heuristic");
  assert.ok(audit.evidence_rule_keys.includes("progressionAfterRepeatedTopRangeCompletion"));
});

test("calendar week alone never forces a deload", () => {
  const policy = calendarDeloadPolicy();
  assert.equal(policy.automatic, false);
  assert.equal(policy.action, "none");
  assert.ok(policy.ruleKeys.includes("noAutomaticCalendarDeload"));
});
