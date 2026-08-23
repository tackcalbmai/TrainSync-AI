import { getExerciseDefinition } from "./exercise-catalog.mjs";
import { normalizeExerciseKey } from "./progress.mjs";

export function completedSetExerciseKey(set = {}) {
  const explicit = String(set.exerciseKey || set.exercise_key || "").trim();
  const name = String(set.exerciseName || set.exercise_name || "").trim();
  const canonical = getExerciseDefinition(explicit) || getExerciseDefinition(name);
  if (canonical?.key) return canonical.key;
  if (explicit) return explicit;
  return normalizeExerciseKey(name || "exercise");
}
