import { validateWorkout } from "./workout.mjs";
import {
  GARMIN_FIT_PROFILE_VERSION,
  GARMIN_EXERCISE_MAP_VERSION,
  toGarminWorkoutExercise,
} from "./garmin-exercise-map.mjs";

export const GARMIN_WORKOUT_PROJECTION_VERSION = "fit-21.213.0+trainsync-2026-08-23.1";

export const GARMIN_FIT_ENUMS = Object.freeze({
  sport:Object.freeze({ TRAINING:Object.freeze({ id:10, name:"TRAINING" }) }),
  subSport:Object.freeze({ STRENGTH_TRAINING:Object.freeze({ id:20, name:"STRENGTH_TRAINING" }) }),
  intensity:Object.freeze({
    ACTIVE:Object.freeze({ id:0, name:"ACTIVE" }),
    REST:Object.freeze({ id:1, name:"REST" }),
  }),
  durationType:Object.freeze({
    TIME:Object.freeze({ id:0, name:"TIME" }),
    REPS:Object.freeze({ id:29, name:"REPS" }),
  }),
});

function finite(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveInt(value) {
  const number = finite(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function metricOf(set = {}) {
  return String(set.metricType || set.metric_type || "reps") === "duration_seconds" ? "duration_seconds" : "reps";
}

function targetRange(set = {}) {
  if (metricOf(set) === "duration_seconds") {
    const exact = positiveInt(set.targetDurationSeconds ?? set.durationSeconds);
    const min = positiveInt(set.minDurationSeconds) ?? exact;
    const max = positiveInt(set.maxDurationSeconds) ?? exact;
    return { metricType:"duration_seconds", exact, min, max };
  }
  const exact = positiveInt(set.targetReps ?? set.reps);
  const min = positiveInt(set.minReps) ?? exact;
  const max = positiveInt(set.maxReps) ?? exact;
  return { metricType:"reps", exact, min, max };
}

function rangeIsExact(range) {
  return range.min != null && range.max != null && range.min === range.max;
}

function effortNote(set = {}) {
  const rir = finite(set.targetRir ?? set.target_rir);
  return rir == null ? null : `Target RIR ${rir}`;
}

function rangeNote(range) {
  if (range.min == null || range.max == null || rangeIsExact(range)) return null;
  return range.metricType === "duration_seconds"
    ? `Target ${range.min}-${range.max} sec`
    : `Target ${range.min}-${range.max} reps`;
}

function mergeNotes(...parts) {
  const clean = parts.flat().map((value) => String(value || "").trim()).filter(Boolean);
  return clean.length ? clean.join(" · ") : null;
}

function projectWorkSet({ exercise, set, setIndex, exerciseIndex }) {
  const exerciseProjection = toGarminWorkoutExercise(exercise);
  const range = targetRange(set);
  const exactRange = rangeIsExact(range);
  const warnings = [];

  if (!exerciseProjection.valid) {
    warnings.push({
      code:"UNKNOWN_TRAINSYNC_EXERCISE",
      exerciseIndex,
      setIndex,
      message:`${exercise.name || exercise.exerciseKey || "Exercise"}: no canonical TrainSync exercise identity is available for Garmin projection.`,
    });
  } else if (exerciseProjection.match === "unmapped") {
    warnings.push({
      code:"GARMIN_EXERCISE_UNMAPPED",
      exerciseIndex,
      setIndex,
      exerciseKey:exerciseProjection.exerciseKey,
      message:`${exerciseProjection.wktStepName}: no defensible Garmin exercise enum is registered; preserve the TrainSync step name and do not invent a mapping.`,
    });
  } else if (exerciseProjection.match === "compatible") {
    warnings.push({
      code:"GARMIN_EXERCISE_COMPATIBLE_LOSS",
      exerciseIndex,
      setIndex,
      exerciseKey:exerciseProjection.exerciseKey,
      message:`${exerciseProjection.wktStepName}: Garmin can represent the movement, but some TrainSync detail is not encoded by the selected FIT exercise enum.`,
    });
  }

  if (!exactRange) {
    warnings.push({
      code:range.metricType === "duration_seconds" ? "DURATION_RANGE_REQUIRES_PROVIDER_POLICY" : "REP_RANGE_REQUIRES_PROVIDER_POLICY",
      exerciseIndex,
      setIndex,
      message:`${exercise.name || exercise.exerciseKey || "Exercise"}: FIT workout_step has one duration value for ${range.metricType === "duration_seconds" ? "time" : "repetitions"}; TrainSync will not silently collapse ${range.min ?? "?"}-${range.max ?? "?"} into an exact target.`,
    });
  }

  const duration = range.metricType === "duration_seconds"
    ? {
        type:{ ...GARMIN_FIT_ENUMS.durationType.TIME },
        seconds:exactRange ? range.min : null,
        reps:null,
      }
    : {
        type:{ ...GARMIN_FIT_ENUMS.durationType.REPS },
        seconds:null,
        reps:exactRange ? range.min : null,
      };

  const weightKg = finite(set.weightKg ?? set.targetWeightKg ?? set.target_weight_kg);
  const canonicalName = exerciseProjection.valid ? exerciseProjection.wktStepName : String(exercise.name || exercise.exerciseKey || "Exercise");
  const notes = mergeNotes(
    exercise.notes,
    rangeNote(range),
    effortNote(set),
  );

  return {
    step:{
      kind:"work",
      intensity:{ ...GARMIN_FIT_ENUMS.intensity.ACTIVE },
      wktStepName:canonicalName,
      notes,
      duration,
      exerciseWeightKg:weightKg != null && weightKg > 0 ? weightKg : null,
      exerciseCategory:exerciseProjection.valid ? exerciseProjection.exerciseCategory : null,
      exerciseName:exerciseProjection.valid ? exerciseProjection.exerciseName : null,
      trainSync:{
        exerciseKey:exerciseProjection.valid ? exerciseProjection.exerciseKey : null,
        exerciseIndex,
        setIndex,
        metricType:range.metricType,
        targetMin:range.min,
        targetMax:range.max,
        targetRir:finite(set.targetRir ?? set.target_rir),
        mappingMatch:exerciseProjection.valid ? exerciseProjection.match : "unknown",
      },
    },
    warnings,
    exactTarget:exactRange,
    canonicalExercise:Boolean(exerciseProjection.valid),
    mappedExercise:Boolean(exerciseProjection.valid && exerciseProjection.match !== "unmapped"),
  };
}

function restStep(restSec, exerciseIndex, setIndex) {
  const seconds = positiveInt(restSec);
  if (!seconds) return null;
  return {
    kind:"rest",
    intensity:{ ...GARMIN_FIT_ENUMS.intensity.REST },
    wktStepName:"Rest",
    notes:null,
    duration:{ type:{ ...GARMIN_FIT_ENUMS.durationType.TIME }, seconds, reps:null },
    exerciseWeightKg:null,
    exerciseCategory:null,
    exerciseName:null,
    trainSync:{ exerciseIndex, setIndex },
  };
}

export function projectWorkoutToGarminFit(workout = {}) {
  const validation = validateWorkout(workout);
  if (!validation.valid) {
    return {
      valid:false,
      reasonCode:"WORKOUT_VALIDATION_FAILED",
      errors:validation.errors,
      warnings:validation.warnings,
      projection:null,
    };
  }

  const projected = [];
  const warnings = [...validation.warnings.filter((item) => item.code !== "GARMIN_MAPPING_PENDING")];
  let exactTargetSets = 0;
  let rangeTargetSets = 0;
  let canonicalSets = 0;
  let mappedSets = 0;
  let workSetCount = 0;

  const allSets = (workout.exercises || []).flatMap((exercise, exerciseIndex) =>
    (exercise.sets || []).map((set, setIndex) => ({ exercise, exerciseIndex, set, setIndex })),
  );

  for (let globalIndex = 0; globalIndex < allSets.length; globalIndex += 1) {
    const item = allSets[globalIndex];
    const result = projectWorkSet(item);
    result.step.messageIndex = projected.length;
    projected.push(result.step);
    warnings.push(...result.warnings);
    workSetCount += 1;
    if (result.exactTarget) exactTargetSets += 1;
    else rangeTargetSets += 1;
    if (result.canonicalExercise) canonicalSets += 1;
    if (result.mappedExercise) mappedSets += 1;

    if (globalIndex < allSets.length - 1) {
      const rest = restStep(item.set.restSec, item.exerciseIndex, item.setIndex);
      if (rest) {
        rest.messageIndex = projected.length;
        projected.push(rest);
      }
    }
  }

  const lossy = warnings.some((item) => [
    "GARMIN_EXERCISE_UNMAPPED",
    "GARMIN_EXERCISE_COMPATIBLE_LOSS",
    "REP_RANGE_REQUIRES_PROVIDER_POLICY",
    "DURATION_RANGE_REQUIRES_PROVIDER_POLICY",
    "UNKNOWN_TRAINSYNC_EXERCISE",
  ].includes(item.code));
  const requiresProviderPolicy = rangeTargetSets > 0;

  return {
    valid:true,
    reasonCode:"OK",
    errors:[],
    warnings,
    projection:{
      fitProfileVersion:GARMIN_FIT_PROFILE_VERSION,
      exerciseMapVersion:GARMIN_EXERCISE_MAP_VERSION,
      projectionVersion:GARMIN_WORKOUT_PROJECTION_VERSION,
      workout:{
        wktName:String(workout.title || "Strength Workout").trim(),
        sport:{ ...GARMIN_FIT_ENUMS.sport.TRAINING },
        subSport:{ ...GARMIN_FIT_ENUMS.subSport.STRENGTH_TRAINING },
        numValidSteps:projected.length,
      },
      steps:projected,
      summary:{
        workSetCount,
        stepCount:projected.length,
        exactTargetSets,
        rangeTargetSets,
        canonicalSets,
        mappedSets,
        unmappedOrUnknownSets:workSetCount - mappedSets,
        lossy,
        requiresProviderPolicy,
      },
    },
  };
}

export function garminFitProjectionReadiness(workout = {}) {
  const result = projectWorkoutToGarminFit(workout);
  if (!result.valid) return { ready:false, reasonCode:result.reasonCode, errors:result.errors, warnings:result.warnings };
  const summary = result.projection.summary;
  const exactTargetsReady = summary.rangeTargetSets === 0;
  const canonicalReady = summary.canonicalSets === summary.workSetCount;
  const mappedReady = summary.mappedSets === summary.workSetCount;
  return {
    ready:exactTargetsReady && canonicalReady && mappedReady,
    reasonCode:!exactTargetsReady
      ? "TARGET_RANGE_PROVIDER_POLICY_REQUIRED"
      : !canonicalReady
        ? "CANONICAL_EXERCISE_REQUIRED"
        : !mappedReady
          ? "GARMIN_EXERCISE_MAPPING_REQUIRED"
          : "FIT_PROJECTION_READY",
    fitProfileVersion:GARMIN_FIT_PROFILE_VERSION,
    exerciseMapVersion:GARMIN_EXERCISE_MAP_VERSION,
    projectionVersion:GARMIN_WORKOUT_PROJECTION_VERSION,
    checks:{ exactTargetsReady, canonicalReady, mappedReady },
    summary,
    warnings:result.warnings,
  };
}
