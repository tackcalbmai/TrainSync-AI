import test from "node:test";
import assert from "node:assert/strict";
import { classifyExercisePerformance, estimateSessionMinutes, fractionalMuscleVolume, validateProgram, validateProgramSession } from "../lib/programming-engine.mjs";

const bench = (sets = 4) => ({
  name: "Barbell Bench Press", role: "primary_strength", movementPattern: "horizontal_push", loadType: "external_weight", progressionMode: "load_progression",
  primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "front delts"],
  sets: Array.from({ length: sets }, () => ({ metricType: "reps", minReps: 4, maxReps: 6, targetRir: 2, restSec: 180 })),
});

test("fractional muscle sets distinguish direct and indirect work", () => {
  const dose = fractionalMuscleVolume([bench(4)]);
  assert.equal(dose.direct.chest, 4); assert.equal(dose.indirect.triceps, 4); assert.equal(dose.fractional.triceps, 2); assert.equal(dose.fractional.front_delts, 2);
});

test("session validator warns on concentrated volume without inventing a hard cap", () => {
  const result = validateProgramSession({ title: "Chest specialization", estimatedDurationMinutes: 75, exercises: [bench(6), { ...bench(6), name: "Incline Bench Press" }] });
  assert.equal(result.valid, true); assert.ok(result.warnings.some((item) => item.code === "HIGH_SESSION_MUSCLE_VOLUME"));
});

test("non-competing supersets reduce estimated session time", () => {
  const press = { name: "Dumbbell Press", role: "hypertrophy_compound", movementPattern: "horizontal_push", loadType: "external_weight", progressionMode: "double_progression", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"], sets: Array.from({ length: 3 }, () => ({ metricType: "reps", minReps: 8, maxReps: 10, targetRir: 2, restSec: 120 })) };
  const row = { name: "Cable Row", role: "hypertrophy_compound", movementPattern: "horizontal_pull", loadType: "external_weight", progressionMode: "double_progression", primaryMuscles: ["upper_back"], secondaryMuscles: ["biceps"], sets: Array.from({ length: 3 }, () => ({ metricType: "reps", minReps: 8, maxReps: 10, targetRir: 2, restSec: 120 })) };
  assert.ok(estimateSessionMinutes({ exercises: [{ ...press, supersetGroup: "A" }, { ...row, supersetGroup: "A" }] }) < estimateSessionMinutes({ exercises: [press, row] }));
});

test("validator catches direct and shared-limiter superset competition", () => {
  const first = { ...bench(3), role: "hypertrophy_compound", supersetGroup: "A" };
  const second = { ...bench(3), name: "Incline Dumbbell Press", role: "hypertrophy_compound", supersetGroup: "A" };
  assert.ok(validateProgramSession({ title: "Competing pair", exercises: [first, second] }).warnings.some((item) => item.code === "COMPETING_SUPERSET"));
  const rdl = { name: "Kettlebell Romanian Deadlift", role: "hypertrophy_compound", movementPattern: "hinge", loadType: "external_weight", progressionMode: "double_progression", supersetGroup: "C", primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes", "spinal_erectors", "forearms"], sets: Array.from({ length: 3 }, () => ({ metricType: "reps", minReps: 8, maxReps: 12, targetRir: 2, restSec: 90 })) };
  const fly = { name: "Bent-Over Kettlebell Reverse Fly", role: "isolation", movementPattern: "horizontal_pull", loadType: "external_weight", progressionMode: "double_progression", supersetGroup: "C", primaryMuscles: ["rear_delts"], secondaryMuscles: ["upper_back", "forearms"], sets: Array.from({ length: 2 }, () => ({ metricType: "reps", minReps: 12, maxReps: 20, targetRir: 2, restSec: 60 })) };
  assert.ok(validateProgramSession({ title: "Bad hinge pair", exercises: [rdl, fly] }).warnings.some((item) => item.code === "SHARED_LIMITER_SUPERSET"));
});

test("validator warns when primary strength uses a high rep ceiling", () => {
  const pushup = { name: "Strict Push-Up", role: "primary_strength", movementPattern: "horizontal_push", loadType: "bodyweight", progressionMode: "variant_progression", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "front_delts"], sets: Array.from({ length: 4 }, () => ({ metricType: "reps", minReps: 6, maxReps: 15, targetRir: 2, restSec: 120 })) };
  assert.ok(validateProgramSession({ title: "Push-up strength", exercises: [pushup] }).warnings.some((item) => item.code === "PRIMARY_STRENGTH_REP_RANGE_BROAD"));
});

test("timed isometrics validate as seconds and contribute realistic duration", () => {
  const hold = { name: "Hollow Body Hold", role: "accessory", movementPattern: "core", loadType: "bodyweight", progressionMode: "duration_progression", setMetric: "duration_seconds", primaryMuscles: ["abs"], secondaryMuscles: [], sets: [
    { metricType: "duration_seconds", minDurationSeconds: 20, maxDurationSeconds: 35, targetRir: null, restSec: 45 },
    { metricType: "duration_seconds", minDurationSeconds: 20, maxDurationSeconds: 35, targetRir: null, restSec: 45 },
  ] };
  const result = validateProgramSession({ title: "Core", estimatedDurationMinutes: 8, exercises: [hold] });
  assert.equal(result.valid, true);
  assert.ok(!result.errors.some((item) => item.code === "REP_RANGE_INVALID"));
  assert.ok(result.dose.estimatedMinutes >= 6);
});

test("timed performance is compared against duration targets", () => {
  const result = classifyExercisePerformance({
    targetSets: [{ metricType: "duration_seconds", minDurationSeconds: 20, maxDurationSeconds: 30 }, { metricType: "duration_seconds", minDurationSeconds: 20, maxDurationSeconds: 30 }],
    actualSets: [{ metricType: "duration_seconds", durationSeconds: 32 }, { metricType: "duration_seconds", durationSeconds: 30 }],
  });
  assert.equal(result.state, "overperformed");
});

test("program validator protects priorities and mixed movement coverage", () => {
  const missingPriority = validateProgram({ title: "Strength block", goal: "strength", durationWeeks: 1, daysPerWeek: 1, priority: { muscles: ["chest"] } }, [{ weekIndex: 1, title: "Pull only", exercises: [{ name: "Pulldown", role: "hypertrophy_compound", movementPattern: "vertical_pull", loadType: "external_weight", progressionMode: "double_progression", primaryMuscles: ["lats"], secondaryMuscles: ["biceps"], sets: [{ metricType: "reps", minReps: 8, maxReps: 12, targetRir: 2, restSec: 120 }] }] }]);
  assert.equal(missingPriority.valid, false); assert.ok(missingPriority.errors.some((item) => item.code === "PRIORITY_MUSCLE_MISSING"));
  const mixed = validateProgram({ title: "Mixed", goal: "mixed", durationWeeks: 1, daysPerWeek: 1 }, [{ weekIndex: 1, title: "Upper only", exercises: [bench(3)] }]);
  assert.ok(mixed.warnings.some((item) => item.code === "MOVEMENT_COVERAGE_GAP"));
});

test("performance classifier does not progress after missed reps at high effort", () => {
  const result = classifyExercisePerformance({ targetSets: [{ minReps: 5, maxReps: 5 }, { minReps: 5, maxReps: 5 }, { minReps: 5, maxReps: 5 }], actualSets: [{ reps: 5, rpe: 9 }, { reps: 4, rpe: 9.5 }, { reps: 3, rpe: 10 }] });
  assert.equal(result.state, "fatigue_signal");
});

test("performance classifier identifies controlled overperformance", () => {
  const result = classifyExercisePerformance({ targetSets: [{ minReps: 8, maxReps: 10 }, { minReps: 8, maxReps: 10 }], actualSets: [{ reps: 11, rpe: 8 }, { reps: 10, rpe: 8 }] });
  assert.equal(result.state, "overperformed");
});
