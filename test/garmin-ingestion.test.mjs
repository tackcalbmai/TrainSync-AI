import test from "node:test";
import assert from "node:assert/strict";
import { matchGarminActivityToWorkout, scoreGarminWorkoutMatch, targetForGarminSet } from "../lib/garmin-activity-ingestion.mjs";

const workout = {
  id: "w1",
  title: "Heavy Upper Body Strength",
  sport: "strength",
  status: "draft",
  scheduled_date: "2026-08-23",
  timezone: "Europe/Riga",
  payload: {
    title: "Heavy Upper Body Strength",
    timezone: "Europe/Riga",
    totalSets: 7,
    exercises: [
      { name: "Barbell Bench Press", sets: [{ targetReps: 5, weightKg: 80 }, { targetReps: 5, weightKg: 80 }, { targetReps: 5, weightKg: 80 }, { targetReps: 5, weightKg: 80 }] },
      { name: "Barbell Bent-Over Row", sets: [{ targetReps: 6, weightKg: 70 }, { targetReps: 6, weightKg: 70 }, { targetReps: 6, weightKg: 70 }] },
    ],
  },
};

const activity = {
  title: "Heavy Upper Body Strength",
  startedAt: "2026-08-23T08:00:00.000Z",
  completedAt: "2026-08-23T08:45:00.000Z",
  sets: [
    { exerciseName: "Barbell Bench Press", setIndex: 1, reps: 5, weightKg: 80 },
    { exerciseName: "Barbell Bench Press", setIndex: 2, reps: 5, weightKg: 80 },
    { exerciseName: "Barbell Bench Press", setIndex: 3, reps: 5, weightKg: 80 },
    { exerciseName: "Barbell Bench Press", setIndex: 4, reps: 5, weightKg: 80 },
    { exerciseName: "Barbell Bent Over Row", setIndex: 1, reps: 6, weightKg: 70 },
    { exerciseName: "Barbell Bent Over Row", setIndex: 2, reps: 6, weightKg: 70 },
    { exerciseName: "Barbell Bent Over Row", setIndex: 3, reps: 6, weightKg: 70 },
  ],
  summary: { totalSets: 7 },
};

test("confidently matches same-day Garmin strength result to planned workout", () => {
  const match = matchGarminActivityToWorkout(activity, [workout]);
  assert.equal(match.matched, true);
  assert.equal(match.confidence, "high");
  assert.equal(match.best.workoutId, "w1");
  assert.ok(match.best.score >= 0.8);
});

test("does not auto-link an ambiguous same-day workout", () => {
  const other = {
    ...workout,
    id: "w2",
    title: "Leg Day",
    payload: {
      ...workout.payload,
      title: "Leg Day",
      exercises: [{ name: "Back Squat", sets: Array.from({ length: 7 }, () => ({ targetReps: 5, weightKg: 100 })) }],
    },
  };
  const match = matchGarminActivityToWorkout({ ...activity, title: "Strength Training", sets: [{ exerciseName: "Unknown Machine", setIndex: 1, reps: 10 }], summary: { totalSets: 1 } }, [workout, other]);
  assert.equal(match.matched, false);
});

test("maps Garmin actual set back to planned target", () => {
  const target = targetForGarminSet({ exerciseName: "Barbell Bent Over Row", setIndex: 2 }, workout);
  assert.equal(target.plannedExercise, "Barbell Bent-Over Row");
  assert.equal(target.targetReps, 6);
  assert.equal(target.targetWeightKg, 70);
});

test("date mismatch lowers confidence", () => {
  const result = scoreGarminWorkoutMatch({ ...activity, startedAt: "2026-08-28T08:00:00.000Z" }, workout);
  assert.equal(result.highConfidence, false);
});
