import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGarminOpenRangePreview,
  garminFitProjectionReadiness,
  projectWorkoutToGarminFit,
} from "../lib/garmin-workout-projection.mjs";
import { GARMIN_TARGET_POLICY_VERSION } from "../lib/garmin-target-policy.mjs";

function workout(set, exerciseKey = "push_up", name = "Push-Up") {
  return {
    id:"wrk_garmin_target_policy",
    revision:1,
    title:"Garmin Target Policy",
    sport:"strength",
    scheduledDate:"2026-08-24",
    estimatedDurationMinutes:20,
    totalSets:1,
    status:"draft",
    exercises:[{ exerciseKey, name, sets:[set] }],
  };
}

test("exact repetition target remains strict Garmin publish-ready", () => {
  const value = workout({ metricType:"reps", minReps:8, maxReps:8, targetReps:8, targetRir:2, restSec:90 });
  const readiness = garminFitProjectionReadiness(value);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.publishReady, true);
  assert.equal(readiness.exactReady, true);
  assert.equal(readiness.deviceVerificationRequired, false);
  assert.equal(readiness.reasonCode, "GARMIN_EXACT_TARGET_READY");
  assert.equal(readiness.targetPolicyVersion, GARMIN_TARGET_POLICY_VERSION);
});

test("rep range preserves the target band and RIR without choosing min max or midpoint", () => {
  const value = workout({ metricType:"reps", minReps:8, maxReps:10, targetReps:null, targetRir:2, restSec:90 });
  const projected = projectWorkoutToGarminFit(value);
  const step = projected.projection.steps[0];
  assert.equal(step.duration.reps, null);
  assert.equal(step.trainSync.targetMin, 8);
  assert.equal(step.trainSync.targetMax, 10);
  assert.equal(step.trainSync.targetRir, 2);

  const readiness = garminFitProjectionReadiness(value);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.publishReady, false);
  assert.equal(readiness.rangePreviewAvailable, true);
  assert.equal(readiness.deviceVerificationRequired, true);
  assert.equal(readiness.reasonCode, "GARMIN_RANGE_DEVICE_VERIFICATION_REQUIRED");
  assert.deepEqual(readiness.ranges.map((item) => [item.min, item.max, item.targetRir]), [[8, 10, 2]]);
  assert.deepEqual(readiness.rejectedAutomaticPolicies.map((item) => item.key), ["use_upper_bound", "use_lower_bound", "use_midpoint"]);
});

test("OPEN rep-range preview preserves original instruction but remains explicitly non-publishable", () => {
  const value = workout({ metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:90 });
  const preview = buildGarminOpenRangePreview(value);
  assert.equal(preview.valid, true);
  assert.equal(preview.experimental, true);
  assert.equal(preview.publishReady, false);
  assert.equal(preview.deviceVerificationRequired, true);
  const step = preview.projection.steps[0];
  assert.deepEqual(step.duration.type, { id:5, name:"OPEN" });
  assert.equal(step.duration.reps, null);
  assert.equal(step.duration.seconds, null);
  assert.match(step.notes, /8-10 reps/);
  assert.match(step.notes, /stop ~2 RIR/);
  assert.equal(step.trainSync.targetMin, 8);
  assert.equal(step.trainSync.targetMax, 10);
  assert.equal(step.trainSync.providerTargetPolicy, "open_range_preview_v1");
});

test("duration range receives the same no-coercion and device-verification treatment", () => {
  const value = workout(
    { metricType:"duration_seconds", minDurationSeconds:30, maxDurationSeconds:45, targetRir:2, restSec:45 },
    "front_plank",
    "Front Plank",
  );
  const projected = projectWorkoutToGarminFit(value);
  assert.equal(projected.projection.steps[0].duration.seconds, null);
  const readiness = garminFitProjectionReadiness(value);
  assert.equal(readiness.reasonCode, "GARMIN_RANGE_DEVICE_VERIFICATION_REQUIRED");
  assert.deepEqual(readiness.ranges.map((item) => [item.metricType, item.min, item.max]), [["duration_seconds", 30, 45]]);

  const preview = buildGarminOpenRangePreview(value);
  const step = preview.projection.steps[0];
  assert.deepEqual(step.duration.type, { id:5, name:"OPEN" });
  assert.equal(step.duration.seconds, null);
  assert.match(step.notes, /30-45 sec/);
  assert.match(step.notes, /stop ~2 RIR/);
});
