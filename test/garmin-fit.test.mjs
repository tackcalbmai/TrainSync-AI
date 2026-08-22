import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGarminActivity } from "../lib/garmin-fit.mjs";

test("normalizes repetition-based Garmin strength sets", () => {
  const activity = normalizeGarminActivity({
    sessionMesgs: [{ sport: "training", subSport: "strength_training", startTime: "2026-08-22T10:00:00.000Z", timestamp: "2026-08-22T10:45:00.000Z", totalTimerTime: 2700, avgHeartRate: 124, maxHeartRate: 163, totalCalories: 355 }],
    workoutMesgs: [{ wktName: "Upper Strength" }],
    workoutStepMesgs: [{ messageIndex: 0, wktStepName: "Barbell Bench Press" }, { messageIndex: 1, wktStepName: "Bent Over Row" }],
    setMesgs: [
      { setType: "active", repetitions: 5, weight: 80, wktStepIndex: 0, timestamp: "2026-08-22T10:08:00.000Z" },
      { setType: "rest", repetitions: 0, wktStepIndex: 0, timestamp: "2026-08-22T10:10:00.000Z" },
      { setType: "active", repetitions: 5, weight: 80, wktStepIndex: 0, timestamp: "2026-08-22T10:12:00.000Z" },
      { setType: "active", repetitions: 6, weight: 70, wktStepIndex: 1, timestamp: "2026-08-22T10:25:00.000Z" },
    ],
  }, { providerActivityId: "garmin_123", fileHash: "abc123" });
  assert.equal(activity.sets.length, 3);
  assert.equal(activity.sets[0].metricType, "reps");
  assert.equal(activity.sets[0].reps, 5);
  assert.equal(activity.sets[0].durationSeconds, null);
  assert.equal(activity.summary.totalVolumeKg, 1220);
});

test("keeps duration-only Garmin strength sets instead of dropping them", () => {
  const activity = normalizeGarminActivity({
    sessionMesgs: [{ sport: "training", subSport: "strength_training", startTime: "2026-08-22T11:00:00.000Z", timestamp: "2026-08-22T11:20:00.000Z", totalTimerTime: 1200 }],
    workoutStepMesgs: [{ messageIndex: 0, wktStepName: "Hollow Body Hold" }],
    setMesgs: [
      { setType: "active", repetitions: 0, duration: 30, wktStepIndex: 0, timestamp: "2026-08-22T11:05:00.000Z" },
      { setType: "active", duration: 35, wktStepIndex: 0, timestamp: "2026-08-22T11:07:00.000Z" },
    ],
  }, { providerActivityId: "garmin_timed", fileHash: "timed123" });
  assert.equal(activity.sets.length, 2);
  assert.equal(activity.sets[0].exerciseName, "Hollow Body Hold");
  assert.equal(activity.sets[0].metricType, "duration_seconds");
  assert.equal(activity.sets[0].reps, null);
  assert.equal(activity.sets[0].durationSeconds, 30);
  assert.equal(activity.summary.timedSets, 2);
  assert.equal(activity.summary.totalVolumeKg, 0);
});
