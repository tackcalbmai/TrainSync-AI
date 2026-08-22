import test from "node:test";
import assert from "node:assert/strict";
import { targetForGarminSet } from "../lib/garmin-activity-ingestion.mjs";

test("preserves planned rep ranges when mapping Garmin sets", () => {
  const workout = { payload: { exercises: [{ name: "Push-Up", sets: [{ metricType: "reps", minReps: 6, maxReps: 10, weightKg: null }] }] } };
  const target = targetForGarminSet({ exerciseName: "Push-Up", setIndex: 1, metricType: "reps" }, workout);
  assert.equal(target.targetMinReps, 6);
  assert.equal(target.targetMaxReps, 10);
  assert.equal(target.targetReps, null);
});

test("preserves planned duration ranges for timed Garmin sets", () => {
  const workout = { payload: { exercises: [{ name: "Hollow Body Hold", sets: [{ metricType: "duration_seconds", minDurationSeconds: 20, maxDurationSeconds: 35 }] }] } };
  const target = targetForGarminSet({ exerciseName: "Hollow Body Hold", setIndex: 1, metricType: "duration_seconds" }, workout);
  assert.equal(target.metricType, "duration_seconds");
  assert.equal(target.targetMinDurationSeconds, 20);
  assert.equal(target.targetMaxDurationSeconds, 35);
  assert.equal(target.targetReps, null);
});
