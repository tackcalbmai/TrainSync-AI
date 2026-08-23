import test from "node:test";
import assert from "node:assert/strict";
import { actualSetPayloadFromWorkout } from "../lib/program-session-workout.mjs";

test("program completion payload preserves user-reported actual RIR separately from RPE", () => {
  const workout = { programSessionId:"ps_rir_test" };
  const [set] = actualSetPayloadFromWorkout(workout, [{
    exerciseKey:"barbell_bench_press",
    exerciseName:"Barbell Bench Press",
    exerciseOrder:1,
    setIndex:1,
    reps:8,
    weightKg:80,
    rpe:8.5,
    rir:2,
  }]);
  assert.equal(set.rpe, 8.5);
  assert.equal(set.rir, 2);
});

test("actual RIR accepts zero and rejects values outside the supported 0-6 observation range", () => {
  const workout = { programSessionId:"ps_rir_test" };
  const rows = actualSetPayloadFromWorkout(workout, [
    { exerciseKey:"push_up", exerciseName:"Push-Up", exerciseOrder:1, setIndex:1, reps:10, rir:0 },
    { exerciseKey:"push_up", exerciseName:"Push-Up", exerciseOrder:1, setIndex:2, reps:10, rir:7 },
    { exerciseKey:"push_up", exerciseName:"Push-Up", exerciseOrder:1, setIndex:3, reps:10, rir:-1 },
  ]);
  assert.equal(rows[0].rir, 0);
  assert.equal(rows[1].rir, null);
  assert.equal(rows[2].rir, null);
});

test("missing actual RIR stays null rather than being inferred from RPE", () => {
  const workout = { programSessionId:"ps_rir_test" };
  const [set] = actualSetPayloadFromWorkout(workout, [{
    exerciseKey:"pull_up",
    exerciseName:"Pull-Up",
    exerciseOrder:1,
    setIndex:1,
    reps:8,
    rpe:8,
  }]);
  assert.equal(set.rpe, 8);
  assert.equal(set.rir, null);
});
