import test from "node:test";
import assert from "node:assert/strict";
import {
  EXERCISE_CATALOG_VERSION,
  canonicalizeExerciseSelection,
  exerciseKeysForEquipment,
  getExerciseDefinition,
} from "../lib/exercise-catalog.mjs";

test("catalog resolves aliases to one stable exercise identity", () => {
  const a = getExerciseDefinition("Pike Push-Up");
  const b = getExerciseDefinition("pike pushup");
  const c = canonicalizeExerciseSelection({ exerciseKey: "pike_push_up_friday", name: "Pike Push-Up" });
  assert.equal(a?.key, "pike_push_up");
  assert.equal(b?.key, "pike_push_up");
  assert.equal(c?.exerciseKey, "pike_push_up");
  assert.equal(c?.primaryMuscles?.[0], "front_delts");
  assert.equal(c?.catalogVersion, EXERCISE_CATALOG_VERSION);
});

test("catalog equipment filter never offers unavailable support", () => {
  const keys = exerciseKeysForEquipment(["pull_up_bar", "kettlebells"]);
  assert.ok(keys.includes("pull_up"));
  assert.ok(keys.includes("goblet_squat"));
  assert.ok(keys.includes("kettlebell_floor_press"));
  assert.ok(!keys.includes("barbell_bench_press"));
  assert.ok(!keys.includes("bulgarian_split_squat"));
});

test("catalog owns anatomy instead of trusting model metadata", () => {
  const canonical = canonicalizeExerciseSelection({
    exerciseKey: "push_up",
    name: "Push-Up",
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["chest"],
    movementPattern: "other",
    loadType: "external_weight",
    requiredEquipment: ["barbell"],
    progressionMode: "load_progression",
    setMetric: "reps",
  });
  assert.deepEqual(canonical.primaryMuscles, ["chest"]);
  assert.ok(canonical.secondaryMuscles.includes("triceps"));
  assert.equal(canonical.movementPattern, "horizontal_push");
  assert.equal(canonical.loadType, "bodyweight");
  assert.deepEqual(canonical.requiredEquipment, ["bodyweight", "floor"]);
  assert.equal(canonical.progressionMode, "variant_progression");
});
