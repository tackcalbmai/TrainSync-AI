import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGarminActivity } from "../lib/garmin-fit.mjs";

test("normalizes Garmin strength sets into TrainSync results", () => {
  const activity = normalizeGarminActivity({
    sessionMesgs: [{
      sport: "training",
      subSport: "strength_training",
      startTime: "2026-08-22T10:00:00.000Z",
      timestamp: "2026-08-22T10:45:00.000Z",
      totalTimerTime: 2700,
      avgHeartRate: 124,
      maxHeartRate: 163,
      totalCalories: 355,
    }],
    workoutMesgs: [{ wktName: "Upper Strength" }],
    workoutStepMesgs: [
      { messageIndex: 0, wktStepName: "Barbell Bench Press" },
      { messageIndex: 1, wktStepName: "Bent Over Row" },
    ],
    setMesgs: [
      { setType: "active", repetitions: 5, weight: 80, wktStepIndex: 0, timestamp: "2026-08-22T10:08:00.000Z" },
      { setType: "rest", repetitions: 0, wktStepIndex: 0, timestamp: "2026-08-22T10:10:00.000Z" },
      { setType: "active", repetitions: 5, weight: 80, wktStepIndex: 0, timestamp: "2026-08-22T10:12:00.000Z" },
      { setType: "active", repetitions: 6, weight: 70, wktStepIndex: 1, timestamp: "2026-08-22T10:25:00.000Z" },
    ],
  }, { providerActivityId: "garmin_123", fileHash: "abc123" });

  assert.equal(activity.providerActivityId, "garmin_123");
  assert.equal(activity.isStrength, true);
  assert.equal(activity.title, "Upper Strength");
  assert.equal(activity.durationSeconds, 2700);
  assert.equal(activity.sets.length, 3);
  assert.equal(activity.sets[0].exerciseName, "Barbell Bench Press");
  assert.equal(activity.sets[0].exerciseOrder, 1);
  assert.equal(activity.sets[1].setIndex, 2);
  assert.equal(activity.sets[2].exerciseName, "Bent Over Row");
  assert.equal(activity.sets[2].exerciseOrder, 2);
  assert.equal(activity.summary.totalVolumeKg, 1220);
  assert.equal(activity.summary.averageHeartRate, 124);
});
