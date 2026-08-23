import test from "node:test";
import assert from "node:assert/strict";
import { programSessionToWorkout, selectNextProgramSession } from "../lib/program-session-workout.mjs";
import { validateWorkout } from "../lib/workout.mjs";

const program = {
  id:"p1",
  goal:"mixed",
  default_session_minutes:45,
  progression_strategy:"mixed",
};

function session(exercises, overrides = {}) {
  return {
    id:"ps1",
    program_id:"p1",
    week_index:1,
    day_index:1,
    slot_index:1,
    scheduled_date:"2026-08-24",
    title:"Program Session",
    status:"planned",
    revision:3,
    payload:{ estimatedDurationMinutes:45, focus:"Evidence-constrained test session", exercises },
    ...overrides,
  };
}

test("program materialization preserves rep ranges and prescribed RIR", () => {
  const ps = session([{
    exerciseKey:"push_up",
    name:"Push-Up",
    role:"hypertrophy_compound",
    sets:[
      { index:1, metricType:"reps", minReps:8, maxReps:12, targetRir:2, restSec:90, weightKg:null },
      { index:2, metricType:"reps", minReps:8, maxReps:12, targetRir:2, restSec:90, weightKg:null },
    ],
  }]);
  const workout = programSessionToWorkout({ program, programSession:ps, timezone:"Europe/Riga" });
  assert.equal(workout.id, "program:ps1");
  assert.equal(workout.revision, 3);
  assert.equal(workout.programSessionId, "ps1");
  assert.equal(workout.exercises[0].exerciseKey, "push_up");
  assert.equal(workout.exercises[0].sets[0].minReps, 8);
  assert.equal(workout.exercises[0].sets[0].maxReps, 12);
  assert.equal(workout.exercises[0].sets[0].targetReps, null);
  assert.equal(workout.exercises[0].sets[0].targetRir, 2);
  assert.equal(validateWorkout(workout).valid, true);
});

test("timed program set remains duration based instead of becoming fake repetitions", () => {
  const ps = session([{
    exerciseKey:"hollow_body_hold",
    name:"Hollow Body Hold",
    role:"accessory",
    sets:[{ index:1, metricType:"duration_seconds", minDurationSeconds:20, maxDurationSeconds:35, targetRir:2, restSec:45 }],
  }]);
  const workout = programSessionToWorkout({ program, programSession:ps, timezone:"Europe/Riga" });
  const set = workout.exercises[0].sets[0];
  assert.equal(set.metricType, "duration_seconds");
  assert.equal(set.minDurationSeconds, 20);
  assert.equal(set.maxDurationSeconds, 35);
  assert.equal(set.targetReps, null);
  assert.equal(validateWorkout(workout).valid, true);
});

test("stale legacy exercise key is canonicalized from the registered exercise name", () => {
  const ps = session([{
    exerciseKey:"pike_push_up_friday",
    name:"Pike Push-Up",
    role:"hypertrophy_compound",
    sets:[{ index:1, metricType:"reps", minReps:6, maxReps:10, targetRir:2, restSec:120 }],
  }]);
  const workout = programSessionToWorkout({ program, programSession:ps, timezone:"Europe/Riga" });
  assert.equal(workout.exercises[0].exerciseKey, "pike_push_up");
});

test("unknown exercise blocks materialization instead of inventing anatomy", () => {
  const ps = session([{
    exerciseKey:"imaginary_machine_press",
    name:"Imaginary Machine Press",
    sets:[{ index:1, metricType:"reps", minReps:8, maxReps:12, restSec:90 }],
  }]);
  assert.throws(() => programSessionToWorkout({ program, programSession:ps }), /PROGRAM_EXERCISE_NOT_IN_CATALOG/);
});

test("next-session selection ignores completed and overdue sessions", () => {
  const sessions = [
    { id:"overdue", status:"planned", scheduled_date:"2026-08-22", week_index:1, day_index:1, slot_index:1 },
    { id:"done", status:"completed", scheduled_date:"2026-08-23", week_index:1, day_index:2, slot_index:1 },
    { id:"today", status:"generated", scheduled_date:"2026-08-23", week_index:1, day_index:3, slot_index:1 },
    { id:"future", status:"planned", scheduled_date:"2026-08-25", week_index:1, day_index:4, slot_index:1 },
  ];
  assert.equal(selectNextProgramSession(sessions, "2026-08-23")?.id, "today");
  assert.equal(selectNextProgramSession(sessions.filter((row) => row.id !== "today"), "2026-08-23")?.id, "future");
});

test("extended workout validation supports ranges and timed sets while keeping exact-rep compatibility", () => {
  const exact = {
    id:"legacy", title:"Legacy", sport:"strength", scheduledDate:"2026-08-24", intensity:"moderate", estimatedDurationMinutes:30, totalSets:1, status:"draft",
    exercises:[{ name:"Bench Press", garminExerciseKey:null, sets:[{ index:1, targetReps:8, restSec:90, weightKg:null }] }],
  };
  assert.equal(validateWorkout(exact).valid, true);

  const timed = {
    ...exact,
    id:"timed",
    exercises:[{ name:"Hollow Body Hold", garminExerciseKey:null, sets:[{ index:1, metricType:"duration_seconds", minDurationSeconds:20, maxDurationSeconds:30, targetRir:2, restSec:45 }] }],
  };
  assert.equal(validateWorkout(timed).valid, true);
});
