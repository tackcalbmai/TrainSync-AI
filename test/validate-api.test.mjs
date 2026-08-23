import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/validate.js";

function responseCapture() {
  return {
    statusCode:null,
    body:null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function workout(exerciseKey, set) {
  return {
    id:`wrk_${exerciseKey}`,
    revision:1,
    title:"Validate API Test",
    sport:"strength",
    scheduledDate:"2026-08-24",
    estimatedDurationMinutes:20,
    totalSets:1,
    status:"draft",
    exercises:[{ exerciseKey, name:exerciseKey, sets:[set] }],
  };
}

const exact = { metricType:"reps", minReps:8, maxReps:8, targetReps:8, restSec:90 };

test("validation API reports exact mapped workout as Garmin ready", async () => {
  const res = responseCapture();
  await handler({ method:"POST", body:{ workout:workout("push_up", exact) } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.valid, true);
  assert.equal(res.body.garmin.ready, true);
  assert.equal(res.body.garmin.reasonCode, "FIT_PROJECTION_READY");
});

test("validation API explains unresolved range instead of calling it Garmin ready", async () => {
  const res = responseCapture();
  await handler({ method:"POST", body:{ workout:workout("push_up", { metricType:"reps", minReps:8, maxReps:10, targetReps:null, restSec:90 }) } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.valid, true);
  assert.equal(res.body.garmin.ready, false);
  assert.equal(res.body.garmin.reasonCode, "TARGET_RANGE_PROVIDER_POLICY_REQUIRED");
});

test("validation API explains missing reviewed mapping", async () => {
  const res = responseCapture();
  await handler({ method:"POST", body:{ workout:workout("hollow_body_hold", { metricType:"duration_seconds", minDurationSeconds:20, maxDurationSeconds:20, targetDurationSeconds:20, restSec:45 }) } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.valid, true);
  assert.equal(res.body.garmin.ready, false);
  assert.equal(res.body.garmin.reasonCode, "GARMIN_EXERCISE_MAPPING_REQUIRED");
});

test("validation API preserves method boundary", async () => {
  const res = responseCapture();
  await handler({ method:"GET", body:{} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.error, "METHOD_NOT_ALLOWED");
});
