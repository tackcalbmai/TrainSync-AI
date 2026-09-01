import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkoutDraft, workoutFormatForCatalog } from "../lib/generate-handler.mjs";
import { createWorkoutFromIntent, validateWorkout } from "../lib/workout.mjs";

function draft(exerciseKey = "push_up") {
  return {
    title:"Canonical test",
    scheduledDate:"2026-09-02",
    timezone:"Europe/Riga",
    durationMinutes:30,
    intensity:"moderate",
    instructions:"Use controlled technique.",
    exercises:[{
      exerciseKey,
      notes:"",
      sets:[{
        metricType:"reps",
        targetReps:null,
        minReps:8,
        maxReps:10,
        targetDurationSeconds:null,
        minDurationSeconds:null,
        maxDurationSeconds:null,
        weightKg:null,
        targetRir:2,
        restSec:90,
      }],
    }],
  };
}

test("AI workout schema constrains exercise identity to the server catalog", () => {
  const schema = workoutFormatForCatalog(["push_up", "front_plank"]);
  const exercise = schema.schema.properties.exercises.items;
  assert.deepEqual(exercise.required, ["exerciseKey", "notes", "sets"]);
  assert.deepEqual(exercise.properties.exerciseKey.enum, ["push_up", "front_plank"]);
  assert.equal("name" in exercise.properties, false);
});

test("AI workout normalization hydrates canonical metadata on the server", () => {
  const workout = normalizeWorkoutDraft(draft());
  const exercise = workout.exercises[0];
  assert.equal(workout.exerciseCatalogEnforced, true);
  assert.equal(exercise.exerciseKey, "push_up");
  assert.equal(exercise.name, "Push-Up");
  assert.equal(exercise.movementPattern, "horizontal_push");
  assert.deepEqual(exercise.primaryMuscles, ["chest"]);
  assert.equal(validateWorkout(workout).valid, true);
});

test("AI workout normalization rejects unknown and metric-incompatible selections", () => {
  assert.throws(() => normalizeWorkoutDraft(draft("invented_friday_press")), { code:"EXERCISE_CATALOG_MISS" });
  const timed = draft("front_plank");
  assert.throws(() => normalizeWorkoutDraft(timed), { code:"EXERCISE_METRIC_MISMATCH" });
});

test("anonymous demo workouts also use canonical identities", () => {
  const workout = createWorkoutFromIntent("Create a full-body workout tomorrow.");
  assert.equal(workout.exerciseCatalogEnforced, true);
  assert.ok(workout.exercises.every((exercise) => exercise.exerciseKey && exercise.catalogVersion));
  assert.equal(validateWorkout(workout).valid, true);
});
