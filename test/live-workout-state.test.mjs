import test from "node:test";
import assert from "node:assert/strict";
import {
  adjustLiveRest,
  completeCurrentLiveSet,
  completedActualSets,
  createLiveWorkoutState,
  currentLiveSet,
  finishLiveWorkoutState,
  liveRestRemainingSeconds,
  liveWorkoutElapsedSeconds,
  liveWorkoutProgress,
  skipCurrentLiveSet,
  skipLiveRest,
  updateCompletedLiveSet,
} from "../lib/live-workout-state.mjs";

function workout() {
  return {
    title:"Upper A",
    programSessionId:"ps-1",
    estimatedDurationMinutes:45,
    exercises:[
      {
        exerciseKey:"barbell_bench_press",
        name:"Barbell Bench Press",
        group:"chest",
        setMetric:"reps",
        sets:[
          { minReps:6, maxReps:8, weightKg:80, targetRir:2, restSec:120 },
          { minReps:6, maxReps:8, weightKg:80, targetRir:2, restSec:120 },
        ],
      },
      {
        exerciseKey:"front_plank",
        name:"Front Plank",
        group:"abs",
        setMetric:"duration_seconds",
        sets:[{ targetDurationSeconds:45, targetRir:3, restSec:60 }],
      },
    ],
  };
}

test("creates resumable deterministic queue from workout", () => {
  const state = createLiveWorkoutState({ workout:workout(), workoutDbId:"w-1", startedAt:"2026-08-28T05:00:00.000Z" });
  assert.equal(state.queue.length, 3);
  assert.equal(state.workoutDbId, "w-1");
  assert.equal(currentLiveSet(state).exerciseKey, "barbell_bench_press");
  assert.deepEqual(liveWorkoutProgress(state), { total:3, completed:0, skipped:0, pending:3, handled:0, percent:0 });
});

test("completing a set records direct RIR and starts prescribed rest", () => {
  const state = createLiveWorkoutState({ workout:workout(), startedAt:"2026-08-28T05:00:00.000Z" });
  const next = completeCurrentLiveSet(state, { reps:8, weightKg:80, rir:2, rpe:8 }, "2026-08-28T05:01:00.000Z");
  assert.equal(next.queue[0].status, "completed");
  assert.equal(next.queue[0].actual.rir, 2);
  assert.equal(next.queue[0].actual.rpe, 8);
  assert.equal(liveRestRemainingSeconds(next, "2026-08-28T05:01:30.000Z"), 90);
  assert.equal(currentLiveSet(next).setNumber, 2);
});

test("RIR and RPE remain optional and are never inferred", () => {
  const state = createLiveWorkoutState({ workout:workout() });
  const next = completeCurrentLiveSet(state, { reps:7, weightKg:80 });
  assert.equal(next.queue[0].actual.rir, null);
  assert.equal(next.queue[0].actual.rpe, null);
});

test("skipped set advances without fabricating actual performance", () => {
  const state = createLiveWorkoutState({ workout:workout() });
  const next = skipCurrentLiveSet(state, "2026-08-28T05:00:30.000Z");
  assert.equal(next.queue[0].status, "skipped");
  assert.equal(next.queue[0].actual, null);
  assert.equal(currentLiveSet(next).setNumber, 2);
  assert.equal(next.restEndsAt, null);
});

test("completed sets can be corrected before upload", () => {
  const state = createLiveWorkoutState({ workout:workout() });
  const completed = completeCurrentLiveSet(state, { reps:8, weightKg:80, rir:2 });
  const edited = updateCompletedLiveSet(completed, 0, { reps:7, weightKg:82.5, rir:1.5 });
  assert.equal(edited.queue[0].actual.reps, 7);
  assert.equal(edited.queue[0].actual.weightKg, 82.5);
  assert.equal(edited.queue[0].actual.rir, 1.5);
});

test("rest timer survives reload semantics and supports adjustment", () => {
  const state = createLiveWorkoutState({ workout:workout() });
  const completed = completeCurrentLiveSet(state, { reps:8 }, "2026-08-28T05:00:00.000Z");
  const plusThirty = adjustLiveRest(completed, 30, "2026-08-28T05:00:15.000Z");
  assert.equal(liveRestRemainingSeconds(plusThirty, "2026-08-28T05:00:15.000Z"), 135);
  const skipped = skipLiveRest(plusThirty, "2026-08-28T05:00:20.000Z");
  assert.equal(liveRestRemainingSeconds(skipped, "2026-08-28T05:00:20.000Z"), 0);
});

test("completed actual payload preserves canonical identity and target RIR", () => {
  let state = createLiveWorkoutState({ workout:workout() });
  state = completeCurrentLiveSet(state, { reps:8, weightKg:80, rir:2 });
  state = skipLiveRest(state);
  state = completeCurrentLiveSet(state, { reps:7, weightKg:80, rir:1.5 });
  const rows = completedActualSets(state);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].exerciseKey, "barbell_bench_press");
  assert.equal(rows[0].targetMinReps, 6);
  assert.equal(rows[0].targetMaxReps, 8);
  assert.equal(rows[0].targetRir, 2);
  assert.equal(rows[0].rir, 2);
});

test("timed sets require duration, not repetitions", () => {
  let state = createLiveWorkoutState({ workout:workout() });
  state = skipCurrentLiveSet(state);
  state = skipCurrentLiveSet(state);
  assert.equal(currentLiveSet(state).metricType, "duration_seconds");
  assert.throws(() => completeCurrentLiveSet(state, { reps:45 }), /LIVE_SET_DURATION_REQUIRED/);
  const done = completeCurrentLiveSet(state, { durationSeconds:50, rir:3 });
  assert.equal(done.queue[2].actual.durationSeconds, 50);
});

test("finish requires at least one completed set and marks pending upload", () => {
  const empty = createLiveWorkoutState({ workout:workout() });
  assert.throws(() => finishLiveWorkoutState(empty), /LIVE_WORKOUT_COMPLETED_SET_REQUIRED/);
  const partial = completeCurrentLiveSet(empty, { reps:8 }, "2026-08-28T05:02:00.000Z");
  const finished = finishLiveWorkoutState(partial, "2026-08-28T05:03:00.000Z");
  assert.equal(finished.uploadState, "pending");
  assert.equal(finished.finishedAt, "2026-08-28T05:03:00.000Z");
  assert.equal(liveWorkoutElapsedSeconds(finished), 180);
});
