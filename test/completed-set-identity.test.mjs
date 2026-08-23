import test from "node:test";
import assert from "node:assert/strict";
import { completedSetExerciseKey } from "../lib/completed-set-identity.mjs";

test("manual completed set preserves explicit canonical exercise key", () => {
  assert.equal(completedSetExerciseKey({ exerciseKey:"barbell_bench_press", exerciseName:"Barbell Bench Press" }), "barbell_bench_press");
});

test("known display name resolves back to canonical catalog identity", () => {
  assert.equal(completedSetExerciseKey({ exerciseName:"Bench Press" }), "barbell_bench_press");
  assert.equal(completedSetExerciseKey({ exerciseName:"One-Arm Dumbbell Row" }), "dumbbell_one_arm_row");
});

test("legacy unknown exercise keeps explicit stored key rather than replacing it from display text", () => {
  assert.equal(completedSetExerciseKey({ exerciseKey:"legacy_custom_press", exerciseName:"Custom Press" }), "legacy_custom_press");
});

test("unknown exercise with no explicit key falls back to the existing stable history normalization", () => {
  assert.equal(completedSetExerciseKey({ exerciseName:"Custom Cable Thing" }), "custom-cable-thing");
});
