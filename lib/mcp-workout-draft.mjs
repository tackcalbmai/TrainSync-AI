import {
  EXERCISE_CATALOG_VERSION,
  canonicalizeExerciseSelection,
} from "./exercise-catalog.mjs";
import { stableHash } from "./workout.mjs";

function normalizeSet(set, index, expectedMetric) {
  if (set.metricType !== expectedMetric) {
    throw new Error(
      `Set ${index + 1} uses ${set.metricType || "an unspecified metric"}; ${expectedMetric} is required for this exercise.`,
    );
  }

  const shared = {
    index:index + 1,
    metricType:expectedMetric,
    weightKg:set.weightKg ?? null,
    targetRir:set.targetRir ?? null,
    restSec:set.restSec,
  };

  if (expectedMetric === "duration_seconds") {
    return {
      ...shared,
      targetDurationSeconds:set.targetDurationSeconds,
      minDurationSeconds:set.targetDurationSeconds,
      maxDurationSeconds:set.targetDurationSeconds,
    };
  }

  return {
    ...shared,
    targetReps:set.targetReps,
    minReps:set.targetReps,
    maxReps:set.targetReps,
  };
}

export function normalizeMcpWorkoutDraft(args, { now = new Date() } = {}) {
  const exercises = args.exercises.map((item) => {
    const canonical = canonicalizeExerciseSelection({
      exerciseKey:item.exerciseKey,
      notes:item.notes?.trim?.() || "",
    });
    if (!canonical) throw new Error(`Unknown canonical exercise key: ${item.exerciseKey}`);

    return {
      ...canonical,
      group:canonical.primaryMuscles.join(" + "),
      sets:item.sets.map((set, index) => normalizeSet(set, index, canonical.setMetric)),
    };
  });

  const title = args.title.trim();
  const instructions = args.instructions?.trim?.() || "Use controlled form. Stop the set if technique breaks down.";
  const totalSets = exercises.reduce((sum, item) => sum + item.sets.length, 0);
  const identity = JSON.stringify({
    title,
    scheduledDate:args.scheduledDate,
    intensity:args.intensity,
    durationMinutes:args.durationMinutes,
    exercises,
  });

  return {
    id:`wrk_${stableHash(identity)}`,
    revision:1,
    title,
    sport:"strength",
    intensity:args.intensity,
    source:"chatgpt_mcp",
    exerciseCatalogEnforced:true,
    exerciseCatalogVersion:EXERCISE_CATALOG_VERSION,
    scheduledDate:args.scheduledDate,
    timezone:args.timezone,
    estimatedDurationMinutes:args.durationMinutes,
    totalSets,
    status:"draft",
    instructions,
    exercises,
    createdAt:now.toISOString(),
  };
}
