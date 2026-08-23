import test from "node:test";
import assert from "node:assert/strict";
import {
  equipmentSupportsExercise,
  isRegisteredVariantTransition,
  resolveRegisteredVariantTransition,
} from "../lib/variant-progression.mjs";
import { applyAdaptationDecision } from "../lib/prescription-mutation.mjs";

function pushup() {
  return {
    exerciseKey:"push_up",
    name:"Push-Up",
    role:"hypertrophy_compound",
    progressionMode:"variant_progression",
    sets:[
      { metricType:"reps", minReps:8, maxReps:12, targetRir:2, restSec:90 },
      { metricType:"reps", minReps:8, maxReps:12, targetRir:2, restSec:90 },
    ],
  };
}

test("registered variant transitions are explicit rather than inferred from family membership", () => {
  assert.equal(isRegisteredVariantTransition("incline_push_up", "push_up"), true);
  assert.equal(isRegisteredVariantTransition("push_up", "decline_push_up"), true);
  assert.equal(isRegisteredVariantTransition("push_up", "archer_push_up"), false);
  assert.equal(isRegisteredVariantTransition("push_up", "pseudo_planche_push_up"), false);
});

test("always-available floor variants do not require profile equipment", () => {
  assert.equal(equipmentSupportsExercise("push_up", []), true);
  const transition = resolveRegisteredVariantTransition("incline_push_up", []);
  assert.equal(transition.resolved, true);
  assert.equal(transition.nextExerciseKey, "push_up");
});

test("decline push-up transition is unavailable without a bench", () => {
  const transition = resolveRegisteredVariantTransition("push_up", []);
  assert.equal(transition.resolved, false);
  assert.equal(transition.reasonCode, "VARIANT_EQUIPMENT_UNAVAILABLE");
  assert.ok(transition.requiredEquipment.includes("bench"));

  const mutation = applyAdaptationDecision({
    exercise:pushup(),
    decision:{ action:"progress_variant", nextVariantKey:"decline_push_up" },
    allowedEquipment:[],
  });
  assert.equal(mutation.applied, false);
  assert.equal(mutation.reasonCode, "VARIANT_EQUIPMENT_UNAVAILABLE");
});

test("decline push-up transition can apply when bench is confirmed", () => {
  const transition = resolveRegisteredVariantTransition("push_up", ["bench"]);
  assert.equal(transition.resolved, true);
  assert.equal(transition.nextExerciseKey, "decline_push_up");

  const mutation = applyAdaptationDecision({
    exercise:pushup(),
    decision:{ action:"progress_variant", nextVariantKey:"decline_push_up" },
    allowedEquipment:["bench"],
  });
  assert.equal(mutation.applied, true);
  assert.equal(mutation.exercise.exerciseKey, "decline_push_up");
  assert.deepEqual(mutation.exercise.requiredEquipment, ["bodyweight", "bench"]);
});
