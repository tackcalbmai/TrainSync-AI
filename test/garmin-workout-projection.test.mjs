import test from "node:test";
import assert from "node:assert/strict";
import {
  GARMIN_FIT_ENUMS,
  garminFitProjectionReadiness,
  projectWorkoutToGarminFit,
} from "../lib/garmin-workout-projection.mjs";

function workout(exercise, title = "Projection Test") {
  return {
    id:"wrk_projection_test",
    revision:1,
    title,
    sport:"strength",
    scheduledDate:"2026-08-24",
    estimatedDurationMinutes:30,
    totalSets:exercise.sets.length,
    status:"draft",
    exercises:[exercise],
  };
}

function repsExercise(overrides = {}) {
  return {
    exerciseKey:"push_up",
    name:"Push-Up",
    sets:[
      { metricType:"reps", minReps:8, maxReps:8, targetReps:8, targetRir:2, restSec:90, weightKg:null },
      { metricType:"reps", minReps:8, maxReps:8, targetReps:8, targetRir:2, restSec:90, weightKg:null },
      { metricType:"reps", minReps:8, maxReps:8, targetReps:8, targetRir:2, restSec:90, weightKg:null },
    ],
    ...overrides,
  };
}

test("strength workout projection pins official FIT sport, sub-sport and duration enums", () => {
  const result = projectWorkoutToGarminFit(workout(repsExercise()));
  assert.equal(result.valid, true);
  assert.deepEqual(result.projection.workout.sport, { id:10, name:"TRAINING" });
  assert.deepEqual(result.projection.workout.subSport, { id:20, name:"STRENGTH_TRAINING" });
  assert.deepEqual(GARMIN_FIT_ENUMS.durationType.REPS, { id:29, name:"REPS" });
  assert.deepEqual(GARMIN_FIT_ENUMS.durationType.TIME, { id:0, name:"TIME" });
});

test("exact rep sets become active FIT steps with explicit rests and reviewed exercise enums", () => {
  const result = projectWorkoutToGarminFit(workout(repsExercise()));
  assert.equal(result.valid, true);
  assert.equal(result.projection.summary.workSetCount, 3);
  assert.equal(result.projection.summary.stepCount, 5);
  assert.equal(result.projection.workout.numValidSteps, 5);

  const first = result.projection.steps[0];
  assert.equal(first.kind, "work");
  assert.equal(first.messageIndex, 0);
  assert.deepEqual(first.intensity, { id:0, name:"ACTIVE" });
  assert.deepEqual(first.duration.type, { id:29, name:"REPS" });
  assert.equal(first.duration.reps, 8);
  assert.deepEqual(first.exerciseCategory, { id:22, name:"PUSH_UP" });
  assert.deepEqual(first.exerciseName, { id:77, name:"PUSH_UP" });
  assert.equal(first.trainSync.mappingMatch, "exact");
  assert.match(first.notes, /Target RIR 2/);

  const rest = result.projection.steps[1];
  assert.equal(rest.kind, "rest");
  assert.deepEqual(rest.intensity, { id:1, name:"REST" });
  assert.deepEqual(rest.duration.type, { id:0, name:"TIME" });
  assert.equal(rest.duration.seconds, 90);
});

test("rep ranges are preserved as TrainSync metadata and never silently collapsed to one Garmin rep target", () => {
  const exercise = repsExercise();
  exercise.sets = [{ metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:90 }];
  const result = projectWorkoutToGarminFit(workout(exercise));
  assert.equal(result.valid, true);
  const step = result.projection.steps[0];
  assert.equal(step.duration.reps, null);
  assert.equal(step.trainSync.targetMin, 8);
  assert.equal(step.trainSync.targetMax, 10);
  assert.match(step.notes, /8-10 reps/);
  assert.ok(result.warnings.some((item) => item.code === "REP_RANGE_REQUIRES_PROVIDER_POLICY"));
  assert.equal(result.projection.summary.requiresProviderPolicy, true);

  const readiness = garminFitProjectionReadiness(workout(exercise));
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reasonCode, "TARGET_RANGE_PROVIDER_POLICY_REQUIRED");
});

test("exact timed holds use FIT TIME without converting them into repetitions", () => {
  const exercise = {
    exerciseKey:"front_plank",
    name:"Front Plank",
    sets:[{ metricType:"duration_seconds", minDurationSeconds:30, maxDurationSeconds:30, targetDurationSeconds:30, restSec:45 }],
  };
  const result = projectWorkoutToGarminFit(workout(exercise));
  const step = result.projection.steps[0];
  assert.deepEqual(step.duration.type, { id:0, name:"TIME" });
  assert.equal(step.duration.seconds, 30);
  assert.equal(step.duration.reps, null);
  assert.deepEqual(step.exerciseCategory, { id:19, name:"PLANK" });
  assert.deepEqual(step.exerciseName, { id:43, name:"PLANK" });
});

test("compatible exercise mapping keeps canonical TrainSync step identity and emits a loss warning", () => {
  const exercise = {
    exerciseKey:"dumbbell_romanian_deadlift",
    name:"Dumbbell Romanian Deadlift",
    sets:[{ metricType:"reps", minReps:8, maxReps:8, targetReps:8, restSec:120, weightKg:20 }],
  };
  const result = projectWorkoutToGarminFit(workout(exercise));
  const step = result.projection.steps[0];
  assert.equal(step.wktStepName, "Dumbbell Romanian Deadlift");
  assert.equal(step.trainSync.mappingMatch, "compatible");
  assert.deepEqual(step.exerciseCategory, { id:8, name:"DEADLIFT" });
  assert.deepEqual(step.exerciseName, { id:23, name:"ROMANIAN_DEADLIFT" });
  assert.equal(step.exerciseWeightKg, 20);
  assert.ok(result.warnings.some((item) => item.code === "GARMIN_EXERCISE_COMPATIBLE_LOSS"));
});

test("canonical but unmapped exercise remains named and never receives invented Garmin exercise enums", () => {
  const exercise = {
    exerciseKey:"hollow_body_hold",
    name:"Hollow Body Hold",
    sets:[{ metricType:"duration_seconds", minDurationSeconds:20, maxDurationSeconds:20, targetDurationSeconds:20, restSec:45 }],
  };
  const result = projectWorkoutToGarminFit(workout(exercise));
  const step = result.projection.steps[0];
  assert.equal(step.wktStepName, "Hollow Body Hold");
  assert.equal(step.exerciseCategory, null);
  assert.equal(step.exerciseName, null);
  assert.equal(step.trainSync.mappingMatch, "unmapped");
  assert.ok(result.warnings.some((item) => item.code === "GARMIN_EXERCISE_UNMAPPED"));
  assert.equal(result.projection.summary.mappedSets, 0);
});

test("unknown non-canonical exercise cannot be declared projection-ready", () => {
  const exercise = {
    name:"Mystery Press Thing",
    sets:[{ metricType:"reps", minReps:8, maxReps:8, targetReps:8, restSec:60 }],
  };
  const result = projectWorkoutToGarminFit(workout(exercise));
  assert.equal(result.valid, true);
  assert.equal(result.projection.steps[0].exerciseCategory, null);
  assert.ok(result.warnings.some((item) => item.code === "UNKNOWN_TRAINSYNC_EXERCISE"));
  const readiness = garminFitProjectionReadiness(workout(exercise));
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reasonCode, "CANONICAL_EXERCISE_REQUIRED");
});
