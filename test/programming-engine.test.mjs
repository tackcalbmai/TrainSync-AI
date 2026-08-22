import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyExercisePerformance,
  fractionalMuscleVolume,
  validateProgram,
  validateProgramSession,
} from "../lib/programming-engine.mjs";

const bench = (sets = 4) => ({
  name: "Barbell Bench Press",
  role: "primary_strength",
  primaryMuscles: ["chest"],
  secondaryMuscles: ["triceps", "front delts"],
  sets: Array.from({ length: sets }, () => ({ minReps: 4, maxReps: 6, targetRir: 2, restSec: 180 })),
});

test("fractional muscle sets distinguish direct and indirect work", () => {
  const dose = fractionalMuscleVolume([bench(4)]);
  assert.equal(dose.direct.chest, 4);
  assert.equal(dose.indirect.triceps, 4);
  assert.equal(dose.fractional.triceps, 2);
  assert.equal(dose.fractional.front_delts, 2);
});

test("session validator warns on concentrated muscle volume but does not invent a hard scientific cap", () => {
  const result = validateProgramSession({
    title: "Chest specialization",
    estimatedDurationMinutes: 75,
    exercises: [bench(6), { ...bench(6), name: "Incline Bench Press" }],
  });
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((item) => item.code === "HIGH_SESSION_MUSCLE_VOLUME"));
  assert.ok(!result.errors.some((item) => item.code === "HIGH_SESSION_MUSCLE_VOLUME"));
});

test("program validator protects declared priorities", () => {
  const result = validateProgram({
    title: "Strength block",
    goal: "strength",
    durationWeeks: 1,
    daysPerWeek: 2,
    priority: { muscles: ["chest"] },
  }, [{
    id: "s1",
    weekIndex: 1,
    title: "Pull only",
    exercises: [{
      name: "Pulldown",
      role: "hypertrophy_compound",
      primaryMuscles: ["lats"],
      secondaryMuscles: ["biceps"],
      sets: [{ minReps: 8, maxReps: 12, targetRir: 2, restSec: 120 }],
    }],
  }]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.code === "PRIORITY_MUSCLE_MISSING"));
});

test("performance classifier does not progress after missed reps at very high effort", () => {
  const result = classifyExercisePerformance({
    targetSets: [
      { minReps: 5, maxReps: 5 },
      { minReps: 5, maxReps: 5 },
      { minReps: 5, maxReps: 5 },
    ],
    actualSets: [
      { reps: 5, rpe: 9 },
      { reps: 4, rpe: 9.5 },
      { reps: 3, rpe: 10 },
    ],
  });
  assert.equal(result.state, "fatigue_signal");
});

test("performance classifier identifies controlled overperformance", () => {
  const result = classifyExercisePerformance({
    targetSets: [
      { minReps: 8, maxReps: 10 },
      { minReps: 8, maxReps: 10 },
    ],
    actualSets: [
      { reps: 11, rpe: 8 },
      { reps: 10, rpe: 8 },
    ],
  });
  assert.equal(result.state, "overperformed");
});
