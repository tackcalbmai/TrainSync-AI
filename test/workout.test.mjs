import test from "node:test";
import assert from "node:assert/strict";
import { createWorkoutFromIntent, validateWorkout } from "../lib/workout.mjs";
import { publishWorkoutMock } from "../lib/mock-garmin.mjs";

test("creates a strength workout from natural language", () => {
  const workout = createWorkoutFromIntent("Create a 45-minute push workout tomorrow, heavy intensity.");
  assert.equal(workout.sport, "strength");
  assert.equal(workout.title, "Push Strength");
  assert.equal(workout.estimatedDurationMinutes, 45);
  assert.equal(workout.intensity, "heavy");
  assert.ok(workout.exercises.length >= 5);
  assert.equal(validateWorkout(workout).valid, true);
});

test("mock publication is deterministic for the same revision", () => {
  const workout = createWorkoutFromIntent("Create a full body workout tomorrow.");
  const first = publishWorkoutMock(workout);
  const second = publishWorkoutMock(workout);
  assert.equal(first.providerResourceId, second.providerResourceId);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
});

test("validation catches malformed sets", () => {
  const workout = createWorkoutFromIntent("Upper body tomorrow");
  workout.exercises[0].sets[0].targetReps = 0;
  const validation = validateWorkout(workout);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.code === "INVALID_REPS"));
});
