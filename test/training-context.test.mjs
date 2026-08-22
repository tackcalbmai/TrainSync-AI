import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTrainingContext, trainingContextInstructions } from "../lib/training-context.mjs";

test("successful recent weighted sets allow conservative progression signal", () => {
  const sets = [
    { exercise_name: "Bench Press", exercise_key: "bench-press", reps: 8, target_reps: 8, weight_kg: 80, rpe: 8, is_warmup: false, completed_at: "2026-08-20T18:00:00Z" },
    { exercise_name: "Bench Press", exercise_key: "bench-press", reps: 8, target_reps: 8, weight_kg: 80, rpe: 8.5, is_warmup: false, completed_at: "2026-08-20T17:55:00Z" },
  ];
  const context = summarizeTrainingContext(sets, [], { now: "2026-08-22T12:00:00Z" });
  assert.equal(context.hasData, true);
  assert.equal(context.exercises[0].progressionEligible, true);
  assert.equal(context.exercises[0].bestWeightKg, 80);
  assert.ok(context.exercises[0].bestE1rmKg > 100);
});

test("missed reps and very high RPE block progression signal", () => {
  const sets = [
    { exercise_name: "Back Squat", exercise_key: "back-squat", reps: 4, target_reps: 5, weight_kg: 120, rpe: 10, is_warmup: false, completed_at: "2026-08-21T18:00:00Z" },
    { exercise_name: "Back Squat", exercise_key: "back-squat", reps: 5, target_reps: 5, weight_kg: 120, rpe: 9.5, is_warmup: false, completed_at: "2026-08-21T17:55:00Z" },
  ];
  const context = summarizeTrainingContext(sets, [], { now: "2026-08-22T12:00:00Z" });
  assert.equal(context.exercises[0].progressionEligible, false);
  assert.equal(context.exercises[0].latestSucceeded, false);
  assert.match(trainingContextInstructions(context).join(" "), /do not increase/i);
});

test("no history produces no adaptive instructions", () => {
  const context = summarizeTrainingContext([], []);
  assert.equal(context.hasData, false);
  assert.deepEqual(trainingContextInstructions(context), []);
});
