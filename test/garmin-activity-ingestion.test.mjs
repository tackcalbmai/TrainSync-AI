import test from "node:test";
import assert from "node:assert/strict";
import { matchGarminActivityToWorkout, targetForGarminSet } from "../lib/garmin-activity-ingestion.mjs";

test("preserves planned rep ranges and canonical identity when mapping Garmin sets", () => {
  const workout = { payload: { exercises: [{ exerciseKey:"push_up", name: "Push-Up", sets: [{ metricType: "reps", minReps: 6, maxReps: 10, weightKg: null }] }] } };
  const target = targetForGarminSet({ exerciseName: "Push-Up", setIndex: 1, metricType: "reps" }, workout);
  assert.equal(target.targetMinReps, 6);
  assert.equal(target.targetMaxReps, 10);
  assert.equal(target.targetReps, null);
  assert.equal(target.plannedExerciseKey, "push_up");
  assert.equal(target.plannedExercise, "Push-Up");
});

test("preserves planned duration ranges for timed Garmin sets", () => {
  const workout = { payload: { exercises: [{ exerciseKey:"hollow_body_hold", name: "Hollow Body Hold", sets: [{ metricType: "duration_seconds", minDurationSeconds: 20, maxDurationSeconds: 35 }] }] } };
  const target = targetForGarminSet({ exerciseName: "Hollow Body Hold", setIndex: 1, metricType: "duration_seconds" }, workout);
  assert.equal(target.metricType, "duration_seconds");
  assert.equal(target.targetMinDurationSeconds, 20);
  assert.equal(target.targetMaxDurationSeconds, 35);
  assert.equal(target.targetReps, null);
  assert.equal(target.plannedExerciseKey, "hollow_body_hold");
});

test("active program-session shaped records can be high-confidence Garmin match candidates", () => {
  const activity = {
    title:"Upper A",
    startedAt:"2026-08-24T16:30:00.000Z",
    completedAt:"2026-08-24T17:00:00.000Z",
    summary:{ totalSets:6 },
    sets:[
      { exerciseName:"Push-Up", setIndex:1 },
      { exerciseName:"Push-Up", setIndex:2 },
      { exerciseName:"Push-Up", setIndex:3 },
      { exerciseName:"Pull-Up", setIndex:1 },
      { exerciseName:"Pull-Up", setIndex:2 },
      { exerciseName:"Pull-Up", setIndex:3 },
    ],
  };
  const session = {
    id:"program-session-1",
    title:"Upper A",
    status:"planned",
    scheduled_date:"2026-08-24",
    timezone:"Europe/Riga",
    sport:"strength",
    payload:{ exercises:[
      { exerciseKey:"push_up", name:"Push-Up", sets:[{},{},{}] },
      { exerciseKey:"pull_up", name:"Pull-Up", sets:[{},{},{}] },
    ] },
  };
  const result = matchGarminActivityToWorkout(activity, [session]);
  assert.equal(result.matched, true);
  assert.equal(result.confidence, "high");
  assert.equal(result.best.workoutId, "program-session-1");
});
