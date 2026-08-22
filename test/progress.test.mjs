import test from "node:test";
import assert from "node:assert/strict";
import { epleyE1rmKg, normalizeExerciseKey, sessionVolumeKg, summarizeProgress } from "../lib/progress.mjs";

test("normalizes exercise names and calculates Epley e1RM", () => {
  assert.equal(normalizeExerciseKey("Barbell Bench Press"), "barbell-bench-press");
  assert.equal(epleyE1rmKg(100, 5), 116.7);
  assert.equal(epleyE1rmKg(100, 15), null);
});

test("calculates session volume from completed weighted sets", () => {
  assert.equal(sessionVolumeKg([
    { reps: 5, weightKg: 100 },
    { reps: 5, weight_kg: 100 },
    { reps: 10, weightKg: null },
  ]), 1000);
});

test("summarizes recent sessions, PRs and exercise performance", () => {
  const now = new Date("2026-08-22T12:00:00Z");
  const sessions = [
    { id: "s1", status: "completed", completed_at: "2026-07-20T10:00:00Z", duration_seconds: 2400 },
    { id: "s2", status: "completed", completed_at: "2026-08-20T10:00:00Z", duration_seconds: 2700 },
  ];
  const sets = [
    { session_id: "s1", exercise_name: "Bench Press", exercise_key: "bench-press", reps: 5, weight_kg: 80, completed_at: "2026-07-20T10:10:00Z" },
    { session_id: "s2", exercise_name: "Bench Press", exercise_key: "bench-press", reps: 5, weight_kg: 90, completed_at: "2026-08-20T10:10:00Z" },
    { session_id: "s2", exercise_name: "Bench Press", exercise_key: "bench-press", reps: 5, weight_kg: 90, completed_at: "2026-08-20T10:15:00Z" },
  ];
  const summary = summarizeProgress(sessions, sets, { now });
  assert.equal(summary.sessions30, 1);
  assert.equal(summary.volume30Kg, 900);
  assert.equal(summary.workSets30, 2);
  assert.equal(summary.recentPrCount, 1);
  assert.equal(summary.exercises[0].bestWeightKg, 90);
  assert.equal(summary.exercises[0].bestE1rmKg, 105);
  assert.equal(summary.hasData, true);
});
