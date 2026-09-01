import { EXERCISE_CATALOG, getExerciseDefinition } from "./exercise-catalog.mjs";

export const GARMIN_FIT_PROFILE_VERSION = "21.214.0";
export const GARMIN_EXERCISE_MAP_VERSION = "fit-21.214.0+trainsync-2026-09-01.1";

export const GARMIN_EXERCISE_CATEGORIES = Object.freeze({
  BENCH_PRESS:Object.freeze({ id:0, name:"BENCH_PRESS" }),
  CALF_RAISE:Object.freeze({ id:1, name:"CALF_RAISE" }),
  CORE:Object.freeze({ id:5, name:"CORE" }),
  CRUNCH:Object.freeze({ id:6, name:"CRUNCH" }),
  CURL:Object.freeze({ id:7, name:"CURL" }),
  DEADLIFT:Object.freeze({ id:8, name:"DEADLIFT" }),
  FLYE:Object.freeze({ id:9, name:"FLYE" }),
  HIP_STABILITY:Object.freeze({ id:11, name:"HIP_STABILITY" }),
  HIP_SWING:Object.freeze({ id:12, name:"HIP_SWING" }),
  LATERAL_RAISE:Object.freeze({ id:14, name:"LATERAL_RAISE" }),
  LEG_CURL:Object.freeze({ id:15, name:"LEG_CURL" }),
  LUNGE:Object.freeze({ id:17, name:"LUNGE" }),
  PLANK:Object.freeze({ id:19, name:"PLANK" }),
  PULL_UP:Object.freeze({ id:21, name:"PULL_UP" }),
  PUSH_UP:Object.freeze({ id:22, name:"PUSH_UP" }),
  ROW:Object.freeze({ id:23, name:"ROW" }),
  SHOULDER_PRESS:Object.freeze({ id:24, name:"SHOULDER_PRESS" }),
  SQUAT:Object.freeze({ id:28, name:"SQUAT" }),
  TRICEPS_EXTENSION:Object.freeze({ id:30, name:"TRICEPS_EXTENSION" }),
});

function category(name) {
  const value = GARMIN_EXERCISE_CATEGORIES[name];
  if (!value) throw new Error(`Unknown Garmin exercise category: ${name}`);
  return value;
}

function mapping(exerciseKey, categoryName, exerciseNameId, exerciseName, match, notes = "") {
  return Object.freeze({
    exerciseKey,
    fitProfileVersion:GARMIN_FIT_PROFILE_VERSION,
    exerciseCategory:category(categoryName),
    exerciseName:Object.freeze({ id:exerciseNameId, name:exerciseName }),
    match,
    notes,
  });
}

// IDs/names are pinned to Garmin FIT Profile 21.214.0. A TrainSync exercise is mapped only
// when the official FIT profile provides a defensible representation. "compatible" means
// Garmin loses a meaningful TrainSync detail; it must never be used to rewrite canonical identity.
const MAPPINGS = [
  mapping("push_up", "PUSH_UP", 77, "PUSH_UP", "exact"),
  mapping("incline_push_up", "PUSH_UP", 27, "INCLINE_PUSH_UP", "exact"),
  mapping("decline_push_up", "PUSH_UP", 13, "DECLINE_PUSH_UP", "exact"),
  mapping("diamond_push_up", "PUSH_UP", 15, "DIAMOND_PUSH_UP", "exact"),
  mapping("pike_push_up", "PUSH_UP", 84, "PIKE_PUSH_UP", "exact"),
  mapping("handstand_push_up_wall", "PUSH_UP", 25, "HANDSTAND_PUSH_UP", "compatible", "Garmin identifies the handstand push-up but does not preserve TrainSync's wall-support detail."),

  mapping("pull_up", "PULL_UP", 38, "PULL_UP", "exact"),
  mapping("chin_up", "PULL_UP", 39, "CHIN_UP", "exact"),
  mapping("lat_pulldown", "PULL_UP", 13, "LAT_PULLDOWN", "exact"),

  mapping("goblet_squat", "SQUAT", 37, "GOBLET_SQUAT", "compatible", "Garmin preserves the goblet-squat movement but not the kettlebell implement in the exercise name."),
  mapping("kettlebell_front_squat", "SQUAT", 38, "KETTLEBELL_SQUAT", "compatible", "Garmin preserves kettlebell squat but not TrainSync's front-squat detail."),
  mapping("barbell_back_squat", "SQUAT", 6, "BARBELL_BACK_SQUAT", "exact"),
  mapping("leg_press", "SQUAT", 0, "LEG_PRESS", "exact"),
  mapping("dumbbell_goblet_squat", "SQUAT", 37, "GOBLET_SQUAT", "compatible", "Garmin preserves goblet squat but not the dumbbell implement."),

  mapping("dumbbell_reverse_lunge", "LUNGE", 82, "DUMBBELL_REVERSE_LUNGE", "exact"),

  mapping("barbell_deadlift", "DEADLIFT", 0, "BARBELL_DEADLIFT", "exact"),
  mapping("barbell_romanian_deadlift", "DEADLIFT", 23, "ROMANIAN_DEADLIFT", "compatible", "Garmin preserves Romanian deadlift but not the barbell implement in this enum."),
  mapping("dumbbell_romanian_deadlift", "DEADLIFT", 23, "ROMANIAN_DEADLIFT", "compatible", "Garmin preserves Romanian deadlift but not the dumbbell implement in this enum."),
  mapping("kettlebell_rdl", "DEADLIFT", 23, "ROMANIAN_DEADLIFT", "compatible", "Garmin preserves Romanian deadlift but not the kettlebell implement in this enum."),

  mapping("barbell_bench_press", "BENCH_PRESS", 1, "BARBELL_BENCH_PRESS", "exact"),
  mapping("dumbbell_bench_press", "BENCH_PRESS", 6, "DUMBBELL_BENCH_PRESS", "exact"),
  mapping("kettlebell_floor_press", "BENCH_PRESS", 12, "KETTLEBELL_CHEST_PRESS", "compatible", "Garmin preserves kettlebell chest press but not TrainSync's floor-press detail."),

  mapping("barbell_overhead_press", "SHOULDER_PRESS", 14, "OVERHEAD_BARBELL_PRESS", "exact"),
  mapping("dumbbell_overhead_press", "SHOULDER_PRESS", 15, "OVERHEAD_DUMBBELL_PRESS", "exact"),

  mapping("barbell_bent_over_row", "ROW", 46, "BENT_OVER_ROW_WITH_BARBELL", "exact"),
  mapping("dumbbell_one_arm_row", "ROW", 13, "ONE_ARM_BENT_OVER_ROW", "compatible", "Garmin preserves the one-arm bent-over row but the enum name does not encode the dumbbell implement."),
  mapping("kettlebell_one_arm_row", "ROW", 9, "KETTLEBELL_ROW", "compatible", "Garmin preserves kettlebell row but not TrainSync's one-arm detail."),
  mapping("seated_cable_row", "ROW", 18, "SEATED_CABLE_ROW", "exact"),
  mapping("cable_face_pull", "ROW", 5, "FACE_PULL", "exact"),
  mapping("machine_row", "ROW", 36, "ROW", "compatible", "Garmin provides a generic row enum; TrainSync's machine support detail is preserved only in the step name."),

  mapping("dumbbell_lateral_raise", "LATERAL_RAISE", 34, "DUMBBELL_LATERAL_RAISE", "exact"),
  mapping("cable_lateral_raise", "LATERAL_RAISE", 14, "ONE_ARM_CABLE_LATERAL_RAISE", "compatible", "TrainSync's generic cable lateral raise does not assert unilateral execution; Garmin's closest official enum is one-arm."),

  mapping("kettlebell_curl", "CURL", 24, "KETTLEBELL_BICEPS_CURL", "exact"),
  mapping("dumbbell_curl", "CURL", 46, "DUMBBELL_BICEPS_CURL", "exact"),
  mapping("cable_biceps_curl", "CURL", 8, "CABLE_BICEPS_CURL", "exact"),

  mapping("dumbbell_overhead_triceps_extension", "TRICEPS_EXTENSION", 15, "OVERHEAD_DUMBBELL_TRICEPS_EXTENSION", "exact"),
  mapping("cable_triceps_pressdown", "TRICEPS_EXTENSION", 39, "TRICEPS_PRESSDOWN", "exact"),

  mapping("dumbbell_chest_supported_rear_delt_fly", "FLYE", 10, "FACE_DOWN_INCLINE_REVERSE_FLYE", "compatible", "Garmin represents the supported reverse-fly pattern but not TrainSync's exact bench/support wording."),

  mapping("front_plank", "PLANK", 43, "PLANK", "exact"),
  mapping("side_plank", "PLANK", 66, "SIDE_PLANK", "exact"),
  mapping("dead_bug", "HIP_STABILITY", 1, "DEAD_BUG", "exact"),

  mapping("standing_calf_raise", "CALF_RAISE", 18, "STANDING_CALF_RAISE", "exact"),
  mapping("dumbbell_calf_raise", "CALF_RAISE", 20, "STANDING_DUMBBELL_CALF_RAISE", "exact"),

  mapping("seated_leg_curl", "LEG_CURL", 0, "LEG_CURL", "compatible", "Garmin's generic leg-curl enum does not preserve the seated-machine detail."),
];

export const GARMIN_EXERCISE_MAP = Object.freeze(Object.fromEntries(MAPPINGS.map((entry) => [entry.exerciseKey, entry])));

export function getGarminExerciseMapping(exerciseKey) {
  const definition = getExerciseDefinition(exerciseKey);
  if (!definition) return null;
  return GARMIN_EXERCISE_MAP[definition.key] || Object.freeze({
    exerciseKey:definition.key,
    fitProfileVersion:GARMIN_FIT_PROFILE_VERSION,
    exerciseCategory:null,
    exerciseName:null,
    match:"unmapped",
    notes:"No defensible Garmin FIT Profile 21.214.0 exercise mapping is registered. Preserve the TrainSync step name and do not invent an exercise_category/exercise_name pair.",
  });
}

export function reverseGarminExerciseMapping(exerciseCategoryId, exerciseNameId) {
  const categoryId = Number(exerciseCategoryId);
  const nameId = Number(exerciseNameId);
  if (!Number.isFinite(categoryId) || !Number.isFinite(nameId)) return [];
  return Object.values(GARMIN_EXERCISE_MAP).filter((entry) => entry.exerciseCategory.id === categoryId && entry.exerciseName.id === nameId);
}

export function toGarminWorkoutExercise(exercise = {}) {
  const definition = getExerciseDefinition(exercise.exerciseKey) || getExerciseDefinition(exercise.name);
  if (!definition) return { valid:false, reasonCode:"UNKNOWN_TRAINSYNC_EXERCISE", mapping:null };
  const mappingEntry = getGarminExerciseMapping(definition.key);
  const projection = {
    valid:true,
    exerciseKey:definition.key,
    wktStepName:definition.name,
    fitProfileVersion:GARMIN_FIT_PROFILE_VERSION,
    mappingVersion:GARMIN_EXERCISE_MAP_VERSION,
    match:mappingEntry.match,
  };
  if (mappingEntry.match === "unmapped") return { ...projection, exerciseCategory:null, exerciseName:null, reasonCode:"GARMIN_EXERCISE_UNMAPPED" };
  return {
    ...projection,
    exerciseCategory:{ ...mappingEntry.exerciseCategory },
    exerciseName:{ ...mappingEntry.exerciseName },
    reasonCode:null,
  };
}

export function garminExerciseMappingCoverage() {
  const catalogKeys = Object.keys(EXERCISE_CATALOG).sort();
  const exact = [], compatible = [], unmapped = [];
  for (const exerciseKey of catalogKeys) {
    const entry = getGarminExerciseMapping(exerciseKey);
    if (entry.match === "exact") exact.push(exerciseKey);
    else if (entry.match === "compatible") compatible.push(exerciseKey);
    else unmapped.push(exerciseKey);
  }
  return {
    fitProfileVersion:GARMIN_FIT_PROFILE_VERSION,
    mappingVersion:GARMIN_EXERCISE_MAP_VERSION,
    catalogCount:catalogKeys.length,
    mappedCount:exact.length + compatible.length,
    exactCount:exact.length,
    compatibleCount:compatible.length,
    unmappedCount:unmapped.length,
    exact,
    compatible,
    unmapped,
  };
}

export function validateGarminExerciseMap() {
  const errors = [];
  const allowedMatches = new Set(["exact", "compatible"]);
  const categoryById = new Map(Object.values(GARMIN_EXERCISE_CATEGORIES).map((item) => [item.id, item.name]));
  for (const [exerciseKey, entry] of Object.entries(GARMIN_EXERCISE_MAP)) {
    if (!EXERCISE_CATALOG[exerciseKey]) errors.push(`Garmin mapping references unknown TrainSync exercise: ${exerciseKey}`);
    if (!allowedMatches.has(entry.match)) errors.push(`Garmin mapping ${exerciseKey} has invalid match type: ${entry.match}`);
    if (entry.fitProfileVersion !== GARMIN_FIT_PROFILE_VERSION) errors.push(`Garmin mapping ${exerciseKey} has stale FIT profile version.`);
    if (categoryById.get(entry.exerciseCategory?.id) !== entry.exerciseCategory?.name) errors.push(`Garmin mapping ${exerciseKey} has invalid category id/name pair.`);
    if (!Number.isInteger(entry.exerciseName?.id) || entry.exerciseName.id < 0 || !String(entry.exerciseName?.name || "").trim()) errors.push(`Garmin mapping ${exerciseKey} has invalid exercise name.`);
  }
  return { valid:errors.length === 0, errors, ...garminExerciseMappingCoverage() };
}
