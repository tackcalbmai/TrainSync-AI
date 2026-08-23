import { Decoder, Encoder, Stream } from "@garmin/fitsdk";
import { projectWorkoutToGarminFit } from "./garmin-workout-projection.mjs";
import { stableHash } from "./workout.mjs";

export const GARMIN_FIT_ENCODER_VERSION = "fit-21.213.0+trainsync-2026-08-23.1";

const MESG_NUM = Object.freeze({ FILE_ID:0, WORKOUT:26, WORKOUT_STEP:27 });

export class GarminFitEncoderError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "GarminFitEncoderError";
    this.code = code;
    this.details = details;
  }
}

function stableSerialNumber(workout) {
  const parsed = Number.parseInt(stableHash(`${workout?.id || "workout"}:r${workout?.revision || 1}`), 36) >>> 0;
  return parsed || 1;
}

function normalizeCreatedAt(value) {
  if (value == null) return new Date();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new GarminFitEncoderError("FIT_TIME_CREATED_INVALID", "FIT workout timeCreated must be a valid date.");
  }
  return date;
}

function strictProjection(workout) {
  const result = projectWorkoutToGarminFit(workout);
  if (!result.valid || !result.projection) {
    throw new GarminFitEncoderError(
      result.reasonCode || "FIT_PROJECTION_FAILED",
      "Workout cannot be projected to a Garmin FIT workout.",
      { errors:result.errors || [], warnings:result.warnings || [] },
    );
  }
  const summary = result.projection.summary;
  if (summary.rangeTargetSets > 0) {
    throw new GarminFitEncoderError(
      "FIT_TARGET_RANGE_POLICY_REQUIRED",
      "FIT binary encoding is blocked for unresolved repetition or duration ranges.",
      { summary, warnings:result.warnings || [] },
    );
  }
  if (summary.canonicalSets !== summary.workSetCount) {
    throw new GarminFitEncoderError(
      "FIT_CANONICAL_EXERCISE_REQUIRED",
      "Every encoded work set must have canonical TrainSync exercise identity.",
      { summary, warnings:result.warnings || [] },
    );
  }
  if (summary.mappedSets !== summary.workSetCount) {
    throw new GarminFitEncoderError(
      "FIT_EXERCISE_MAPPING_REQUIRED",
      "Every encoded work set must have a reviewed Garmin FIT exercise mapping.",
      { summary, warnings:result.warnings || [] },
    );
  }
  return result;
}

function durationFields(step) {
  if (step?.duration?.type?.name === "REPS") {
    const reps = Number(step.duration.reps);
    if (!Number.isInteger(reps) || reps <= 0) {
      throw new GarminFitEncoderError("FIT_REPS_REQUIRED", "FIT REPS step requires a positive integer repetition count.", { step });
    }
    return { durationType:"reps", durationValue:reps };
  }
  if (step?.duration?.type?.name === "TIME") {
    const seconds = Number(step.duration.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new GarminFitEncoderError("FIT_TIME_REQUIRED", "FIT TIME step requires a positive duration in seconds.", { step });
    }
    return { durationType:"time", durationValue:Math.round(seconds * 1000) };
  }
  throw new GarminFitEncoderError("FIT_DURATION_TYPE_UNSUPPORTED", "Unsupported FIT workout step duration type.", { step });
}

function stepMessage(step) {
  const duration = durationFields(step);
  const message = {
    messageIndex:Number(step.messageIndex),
    wktStepName:String(step.wktStepName || (step.kind === "rest" ? "Rest" : "Strength set")),
    durationType:duration.durationType,
    durationValue:duration.durationValue,
    intensity:step.kind === "rest" ? "rest" : "active",
  };
  if (step.notes) message.notes = String(step.notes);
  if (step.kind === "work") {
    if (!Number.isInteger(step.exerciseCategory?.id) || !Number.isInteger(step.exerciseName?.id)) {
      throw new GarminFitEncoderError("FIT_EXERCISE_MAPPING_REQUIRED", "Work step is missing reviewed Garmin exercise category/name ids.", { step });
    }
    message.exerciseCategory = step.exerciseCategory.id;
    message.exerciseName = step.exerciseName.id;
    if (Number.isFinite(Number(step.exerciseWeightKg)) && Number(step.exerciseWeightKg) > 0) {
      message.exerciseWeight = Number(step.exerciseWeightKg);
    }
  }
  return message;
}

export function encodeGarminFitWorkout(workout, options = {}) {
  const result = strictProjection(workout);
  const projection = result.projection;
  const encoder = new Encoder();
  const timeCreated = normalizeCreatedAt(options.timeCreated);
  const serialNumber = Number.isInteger(options.serialNumber) && options.serialNumber > 0
    ? options.serialNumber >>> 0
    : stableSerialNumber(workout);

  encoder.onMesg(MESG_NUM.FILE_ID, {
    type:"workout",
    manufacturer:"development",
    product:1,
    serialNumber,
    timeCreated,
  });
  encoder.onMesg(MESG_NUM.WORKOUT, {
    wktName:projection.workout.wktName,
    sport:"training",
    subSport:"strengthTraining",
    numValidSteps:projection.steps.length,
  });
  for (const step of projection.steps) encoder.onMesg(MESG_NUM.WORKOUT_STEP, stepMessage(step));

  const bytes = encoder.close();
  if (!(bytes instanceof Uint8Array) || bytes.length < 16) {
    throw new GarminFitEncoderError("FIT_ENCODER_OUTPUT_INVALID", "Garmin FIT SDK did not return a valid workout byte array.");
  }
  return {
    bytes,
    contentType:"application/octet-stream",
    fileName:`${String(workout.title || "strength-workout").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "strength-workout"}.fit`,
    encoderVersion:GARMIN_FIT_ENCODER_VERSION,
    fitProfileVersion:projection.fitProfileVersion,
    projectionVersion:projection.projectionVersion,
    exerciseMapVersion:projection.exerciseMapVersion,
    serialNumber,
    timeCreated:timeCreated.toISOString(),
    summary:{ ...projection.summary },
    warnings:[...(result.warnings || [])],
  };
}

function byteArray(value) {
  if (value instanceof Uint8Array) return Array.from(value);
  if (Buffer.isBuffer(value)) return Array.from(value.values());
  if (Array.isArray(value)) return value;
  throw new GarminFitEncoderError("FIT_BYTES_REQUIRED", "A FIT Uint8Array, Buffer, or byte array is required.");
}

export function inspectGarminFitWorkout(value) {
  const bytes = byteArray(value);
  const fitStream = Stream.fromByteArray(bytes);
  const isFit = Decoder.isFIT(fitStream);
  const integrity = isFit ? new Decoder(Stream.fromByteArray(bytes)).checkIntegrity() : false;
  if (!isFit || !integrity) {
    return { isFit, integrity, errors:["FIT file header or CRC integrity check failed."], messages:null };
  }
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  const { messages, errors } = decoder.read({
    applyScaleAndOffset:true,
    expandSubFields:true,
    expandComponents:true,
    convertTypesToStrings:false,
    convertDateTimesToDates:true,
    includeUnknownData:false,
    mergeHeartRates:false,
    decodeMemoGlobs:false,
    skipHeader:false,
    dataOnly:false,
    legacyArrayMode:false,
  });
  return { isFit, integrity, errors:errors || [], messages };
}

export function encodeAndInspectGarminFitWorkout(workout, options = {}) {
  const encoded = encodeGarminFitWorkout(workout, options);
  const inspection = inspectGarminFitWorkout(encoded.bytes);
  if (!inspection.isFit || !inspection.integrity || inspection.errors.length) {
    throw new GarminFitEncoderError("FIT_ROUND_TRIP_FAILED", "Encoded Garmin FIT workout failed SDK round-trip validation.", inspection);
  }
  return { ...encoded, inspection };
}
