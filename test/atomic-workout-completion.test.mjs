import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { freeWorkoutCompletionPayload } from "../lib/supabase-client.js";

const sql = readFileSync(new URL("../supabase/migrations/20260901114553_atomic_free_workout_completion.sql", import.meta.url), "utf8");
const completionId = "11111111-1111-4111-8111-111111111111";
const workoutId = "22222222-2222-4222-8222-222222222222";

function args(overrides = {}) {
  return {
    completionId,
    workoutDbId:workoutId,
    startedAt:"2026-09-01T10:00:00.000Z",
    completedAt:"2026-09-01T10:30:00.000Z",
    durationSeconds:1800,
    notes:"Stable retry",
    sets:[{
      exerciseName:"Push-Up",
      exerciseKey:"push_up",
      exerciseOrder:1,
      setIndex:1,
      metricType:"reps",
      reps:10,
      weightKg:null,
      rir:2,
      rpe:null,
      isWarmup:false,
    }],
    ...overrides,
  };
}

test("client sends one stable RPC payload without direct multi-table writes", () => {
  const payload = freeWorkoutCompletionPayload(args());
  assert.equal(payload.p_completion_key, completionId);
  assert.equal(payload.p_workout_id, workoutId);
  assert.equal(payload.p_actual_sets.length, 1);
  assert.deepEqual(payload.p_actual_sets[0], {
    exerciseName:"Push-Up", exerciseKey:"push_up", exerciseOrder:1, setIndex:1,
    metricType:"reps", reps:10, durationSeconds:null, weightKg:null, rpe:null, rir:2, isWarmup:false,
  });
});

test("client rejects invalid effort, time and set identity instead of silently coercing it", () => {
  assert.throws(() => freeWorkoutCompletionPayload(args({ sets:[{ ...args().sets[0], rpe:11 }] })), { message:"ACTUAL_RPE_INVALID" });
  assert.throws(() => freeWorkoutCompletionPayload(args({ sets:[{ ...args().sets[0], exerciseOrder:0 }] })), { message:"SET_POSITION_INVALID" });
  assert.throws(() => freeWorkoutCompletionPayload(args({ completedAt:"2026-09-01T09:59:00.000Z" })), { message:"SESSION_TIME_INVALID" });
});

test("database completion is atomic, user-scoped and concurrency-safe", () => {
  assert.match(sql, /create or replace function public\.complete_workout_session/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /workout_sessions_user_completion_key_uidx/i);
  assert.match(sql, /insert into public\.workout_sessions[\s\S]*insert into public\.set_results[\s\S]*update public\.workouts/i);
});

test("exact retry is a no-op while a changed replay conflicts", () => {
  const duplicateCheck = sql.indexOf("v_existing_fingerprint is distinct from v_fingerprint");
  const sessionInsert = sql.indexOf("insert into public.workout_sessions");
  assert.ok(duplicateCheck > 0 && duplicateCheck < sessionInsert);
  assert.match(sql, /COMPLETION_REPLAY_CONFLICT/);
  assert.match(sql, /return query select v_existing_id, true/);
});

test("server derives planned identity and prescription from the stored workout", () => {
  assert.match(sql, /v_plan_exercise := v_workout\.payload->'exercises'/i);
  assert.match(sql, /v_plan_set := v_plan_exercise->'sets'/i);
  assert.match(sql, /EXERCISE_IDENTITY_MISMATCH/);
  assert.match(sql, /planned_exercise_key[\s\S]*v_exercise_key, v_exercise_key/i);
  assert.match(sql, /DUPLICATE_ACTUAL_SET_POSITION/);
});
