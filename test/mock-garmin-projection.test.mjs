import test from "node:test";
import assert from "node:assert/strict";
import { publishWorkoutMock } from "../lib/mock-garmin.mjs";

function workout() {
  return {
    id:"wrk_mock_projection",
    revision:2,
    title:"Mock Garmin Projection",
    sport:"strength",
    scheduledDate:"2026-08-24",
    estimatedDurationMinutes:25,
    totalSets:2,
    status:"draft",
    exercises:[{
      exerciseKey:"push_up",
      name:"Push-Up",
      sets:[
        { metricType:"reps", minReps:8, maxReps:8, targetReps:8, targetRir:2, restSec:90 },
        { metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:90 },
      ],
    }],
  };
}

test("mock publish remains mock-only but exercises the real Garmin projection layer", () => {
  const result = publishWorkoutMock(workout());
  assert.equal(result.success, true);
  assert.equal(result.provider, "garmin");
  assert.equal(result.mode, "mock");
  assert.match(result.providerResourceId, /^gmn_mock_/);
  assert.equal(result.fitProjection.valid, true);
  assert.equal(result.fitProjection.fitProfileVersion, "21.213.0");
  assert.equal(result.fitProjection.summary.workSetCount, 2);
  assert.equal(result.fitProjection.summary.mappedSets, 2);
  assert.equal(result.fitProjection.summary.rangeTargetSets, 1);
  assert.equal(result.fitProjection.summary.requiresProviderPolicy, true);
  assert.ok(result.fitProjection.warnings.some((item) => item.code === "REP_RANGE_REQUIRES_PROVIDER_POLICY"));
});
