import test from "node:test";
import assert from "node:assert/strict";
import { applyAdaptationDecision, resolveNextAvailableLoad } from "../lib/prescription-mutation.mjs";

const exercise = () => ({
  exerciseKey:"kettlebell_floor_press",
  name:"Kettlebell Floor Press",
  role:"hypertrophy_compound",
  progressionMode:"double_progression",
  sets:[
    { metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:120, weightKg:50 },
    { metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:120, weightKg:50 },
  ],
});

test("chooses the smallest available next resistance", () => {
  const result = resolveNextAvailableLoad({ currentLoadKg:50, availableLoadsKg:[60,52.5,55,50] });
  assert.equal(result.resolved, true);
  assert.equal(result.nextLoadKg, 52.5);
  assert.equal(result.jumpRatio, 0.05);
});

test("does not auto-apply a coarse equipment jump", () => {
  const result = resolveNextAvailableLoad({ currentLoadKg:16, availableLoadsKg:[16,20,24] });
  assert.equal(result.resolved, false);
  assert.equal(result.reasonCode, "LOAD_JUMP_TOO_LARGE_FOR_AUTO_APPLY");
});

test("repetition progression uses one explicit small step", () => {
  const result = applyAdaptationDecision({ exercise:exercise(), decision:{ action:"progress_reps" } });
  assert.equal(result.applied, true);
  assert.equal(result.exercise.sets[0].minReps, 9);
  assert.equal(result.exercise.sets[0].maxReps, 11);
});

test("double progression falls back to reps when no safe higher load is known", () => {
  const current = exercise();
  current.sets.forEach((set) => { set.weightKg = 16; });
  const result = applyAdaptationDecision({
    exercise:current,
    decision:{ action:"progress_load", progressionMode:"double_progression" },
    availableLoadsKg:[16,20,24],
    lastObservedLoadKg:16,
  });
  assert.equal(result.applied, true);
  assert.equal(result.reasonCode, "EQUIPMENT_LIMITED_REP_FALLBACK");
  assert.equal(result.exercise.sets[0].weightKg, 16);
  assert.equal(result.exercise.sets[0].minReps, 9);
  assert.equal(result.mutation.blockedLoadReason, "LOAD_JUMP_TOO_LARGE_FOR_AUTO_APPLY");
  assert.ok(result.ruleKeys.includes("equipmentLimitedRepFallback"));
});

test("load progression does not use a reps fallback when the next load is unknown", () => {
  const current = exercise();
  current.progressionMode = "load_progression";
  current.sets.forEach((set) => { set.weightKg = 50; });
  const result = applyAdaptationDecision({
    exercise:current,
    decision:{ action:"progress_load", progressionMode:"load_progression" },
    availableLoadsKg:[],
    lastObservedLoadKg:50,
  });
  assert.equal(result.applied, false);
  assert.equal(result.reasonCode, "LOAD_INVENTORY_REQUIRED");
});

test("timed progression stays time based", () => {
  const hold = { exerciseKey:"hollow_body_hold", name:"Hollow Body Hold", role:"accessory", progressionMode:"duration_progression", sets:[{ metricType:"duration_seconds", minDurationSeconds:20, maxDurationSeconds:30, restSec:45 }] };
  const result = applyAdaptationDecision({ exercise:hold, decision:{ action:"progress_duration" } });
  assert.equal(result.applied, true);
  assert.equal(result.exercise.sets[0].minDurationSeconds, 25);
  assert.equal(result.exercise.sets[0].maxDurationSeconds, 35);
});

test("variant changes require a registered server transition", () => {
  const incline = { exerciseKey:"incline_push_up", name:"Incline Push-Up", role:"hypertrophy_compound", sets:[{ metricType:"reps", minReps:8, maxReps:12 }] };
  const allowed = applyAdaptationDecision({ exercise:incline, decision:{ action:"progress_variant", nextVariantKey:"push_up" } });
  assert.equal(allowed.applied, true);
  assert.equal(allowed.exercise.exerciseKey, "push_up");
  const other = applyAdaptationDecision({ exercise:incline, decision:{ action:"progress_variant", nextVariantKey:"pseudo_planche_push_up" } });
  assert.equal(other.applied, false);
  assert.equal(other.reasonCode, "VARIANT_TRANSITION_NOT_REGISTERED");
});

test("repeated fatigue can remove exactly one working set while preserving the prescription", () => {
  const current = exercise();
  current.sets.push({ ...current.sets[1] });
  const before = JSON.parse(JSON.stringify(current.sets.slice(0, 2)));
  const result = applyAdaptationDecision({
    exercise:current,
    decision:{ action:"reduce_or_review", reasonCode:"REPEATED_FATIGUE_SIGNAL", ruleKeys:["reduceAfterRepeatedFatigue"] },
  });
  assert.equal(result.applied, true);
  assert.equal(result.reasonCode, "WORKING_SET_REMOVED_FOR_REPEATED_FATIGUE");
  assert.equal(result.exercise.sets.length, 2);
  assert.deepEqual(result.exercise.sets, before);
  assert.equal(result.mutation.removedWorkingSets, 1);
  assert.equal(result.mutation.beforeWorkingSets, 3);
  assert.equal(result.mutation.afterWorkingSets, 2);
  assert.equal(result.mutation.temporary, true);
  assert.ok(result.ruleKeys.includes("reduceAfterRepeatedFatigue"));
});

test("fatigue reduction never pushes an exercise below two working sets", () => {
  const result = applyAdaptationDecision({
    exercise:exercise(),
    decision:{ action:"reduce_or_review", reasonCode:"REPEATED_FATIGUE_SIGNAL", ruleKeys:["reduceAfterRepeatedFatigue"] },
  });
  assert.equal(result.applied, false);
  assert.equal(result.reasonCode, "MINIMUM_WORKING_SETS_REACHED");
  assert.equal(result.beforeWorkingSets, 2);
  assert.equal(result.minimumWorkingSets, 2);
});

test("generic review decisions do not mutate the next prescription", () => {
  const result = applyAdaptationDecision({
    exercise:exercise(),
    decision:{ action:"reduce_or_review", reasonCode:"REPEATED_UNDERPERFORMANCE", ruleKeys:["reduceAfterRepeatedFatigue"] },
  });
  assert.equal(result.applied, false);
  assert.equal(result.reasonCode, "REVIEW_REQUIRED");
  assert.equal(result.exercise.sets.length, 2);
});
