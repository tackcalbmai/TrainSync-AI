import test from "node:test";
import assert from "node:assert/strict";
import { garminFitProjectionReadiness } from "../lib/garmin-workout-projection.mjs";
import { encodeGarminFitWorkout, GarminFitEncoderError } from "../lib/garmin-fit-encoder.mjs";

function workout(exerciseKey, set) {
  return {
    id:`wrk_${exerciseKey}`,
    revision:1,
    title:"Readiness Test",
    sport:"strength",
    scheduledDate:"2026-08-24",
    estimatedDurationMinutes:20,
    totalSets:1,
    status:"draft",
    exercises:[{ exerciseKey, name:exerciseKey, sets:[set] }],
  };
}

const exactReps = { metricType:"reps", minReps:8, maxReps:8, targetReps:8, restSec:90 };

test("exact canonical mapped workout is Garmin projection ready and binary encodable", () => {
  const input = workout("push_up", exactReps);
  const readiness = garminFitProjectionReadiness(input);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.publishReady, true);
  assert.equal(readiness.reasonCode, "GARMIN_EXACT_TARGET_READY");
  assert.deepEqual(readiness.checks, { exactTargetsReady:true, canonicalReady:true, mappedReady:true });
  assert.doesNotThrow(() => encodeGarminFitWorkout(input, { timeCreated:"2026-08-23T18:00:00Z" }));
});

test("canonical but unmapped workout is not Garmin ready and encoder agrees", () => {
  const input = workout("hollow_body_hold", {
    metricType:"duration_seconds",
    minDurationSeconds:20,
    maxDurationSeconds:20,
    targetDurationSeconds:20,
    restSec:45,
  });
  const readiness = garminFitProjectionReadiness(input);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reasonCode, "GARMIN_EXERCISE_MAPPING_REQUIRED");
  assert.equal(readiness.checks.canonicalReady, true);
  assert.equal(readiness.checks.mappedReady, false);
  assert.throws(() => encodeGarminFitWorkout(input), (error) => {
    assert.ok(error instanceof GarminFitEncoderError);
    assert.equal(error.code, "FIT_EXERCISE_MAPPING_REQUIRED");
    return true;
  });
});

test("rep range is not Garmin ready and encoder agrees", () => {
  const input = workout("push_up", { metricType:"reps", minReps:8, maxReps:10, targetReps:null, targetRir:2, restSec:90 });
  const readiness = garminFitProjectionReadiness(input);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.publishReady, false);
  assert.equal(readiness.reasonCode, "GARMIN_RANGE_DEVICE_VERIFICATION_REQUIRED");
  assert.equal(readiness.rangePreviewAvailable, true);
  assert.equal(readiness.deviceVerificationRequired, true);
  assert.equal(readiness.checks.exactTargetsReady, false);
  assert.throws(() => encodeGarminFitWorkout(input), (error) => {
    assert.equal(error.code, "GARMIN_RANGE_DEVICE_VERIFICATION_REQUIRED");
    assert.equal(error.details.targetPolicy.deviceVerificationRequired, true);
    return true;
  });
});

test("unknown non-canonical exercise is not Garmin ready", () => {
  const input = workout("mystery_press", exactReps);
  input.exercises[0].name = "Mystery Press";
  const readiness = garminFitProjectionReadiness(input);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reasonCode, "CANONICAL_EXERCISE_REQUIRED");
  assert.equal(readiness.checks.canonicalReady, false);
  assert.equal(readiness.checks.mappedReady, false);
});
