import test from "node:test";
import assert from "node:assert/strict";
import {
  GARMIN_FIT_ENCODER_VERSION,
  GarminFitEncoderError,
  encodeAndInspectGarminFitWorkout,
  encodeGarminFitWorkout,
  inspectGarminFitWorkout,
} from "../lib/garmin-fit-encoder.mjs";

function makeWorkout(exercises, title = "FIT Binary Test") {
  return {
    id:"wrk_fit_binary_test",
    revision:3,
    title,
    sport:"strength",
    scheduledDate:"2026-08-24",
    estimatedDurationMinutes:30,
    totalSets:exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    status:"draft",
    exercises,
  };
}

function exactPushUp() {
  return {
    exerciseKey:"push_up",
    name:"Push-Up",
    sets:[
      { metricType:"reps", minReps:8, maxReps:8, targetReps:8, targetRir:2, restSec:90 },
      { metricType:"reps", minReps:8, maxReps:8, targetReps:8, targetRir:2, restSec:90 },
    ],
  };
}

function decoded(encoded) {
  const inspected = inspectGarminFitWorkout(encoded.bytes);
  assert.equal(inspected.isFit, true);
  assert.equal(inspected.integrity, true);
  assert.deepEqual(inspected.errors, []);
  return inspected.messages;
}

test("official FIT SDK encodes a CRC-valid strength workout binary", () => {
  const encoded = encodeGarminFitWorkout(makeWorkout([exactPushUp()]), {
    timeCreated:"2026-08-23T18:00:00.000Z",
    serialNumber:123456,
  });
  assert.ok(encoded.bytes instanceof Uint8Array);
  assert.ok(encoded.bytes.length > 16);
  assert.equal(encoded.encoderVersion, GARMIN_FIT_ENCODER_VERSION);
  assert.equal(encoded.serialNumber, 123456);
  assert.equal(encoded.fileName, "fit-binary-test.fit");
  assert.equal(encoded.targetPolicy, "strict_exact_v1");
  assert.match(encoded.targetPolicyVersion, /^2026-08-23\./);

  const messages = decoded(encoded);
  assert.equal(messages.fileIdMesgs.length, 1);
  assert.equal(messages.workoutMesgs.length, 1);
  assert.equal(messages.workoutStepMesgs.length, 3);
  assert.equal(messages.workoutMesgs[0].sport, 10);
  assert.equal(messages.workoutMesgs[0].subSport, 20);
  assert.equal(messages.workoutMesgs[0].numValidSteps, 3);
});

test("exact reps, rests, effort notes and reviewed exercise ids survive FIT round trip", () => {
  const result = encodeAndInspectGarminFitWorkout(makeWorkout([exactPushUp()]), {
    timeCreated:"2026-08-23T18:00:00.000Z",
  });
  const steps = result.inspection.messages.workoutStepMesgs;
  const work = steps[0];
  const rest = steps[1];

  assert.equal(work.messageIndex, 0);
  assert.equal(work.durationType, 29);
  assert.equal(work.durationReps ?? work.durationValue, 8);
  assert.equal(work.intensity, 0);
  assert.equal(work.exerciseCategory, 22);
  assert.equal(work.exerciseName, 77);
  assert.match(work.notes, /Target RIR 2/);

  assert.equal(rest.messageIndex, 1);
  assert.equal(rest.durationType, 0);
  assert.equal(rest.durationTime ?? (rest.durationValue / 1000), 90);
  assert.equal(rest.intensity, 1);
});

test("timed plank remains time rather than repetitions after FIT round trip", () => {
  const workout = makeWorkout([{
    exerciseKey:"front_plank",
    name:"Front Plank",
    sets:[{ metricType:"duration_seconds", minDurationSeconds:30, maxDurationSeconds:30, targetDurationSeconds:30, restSec:45 }],
  }]);
  const result = encodeAndInspectGarminFitWorkout(workout, { timeCreated:"2026-08-23T18:00:00.000Z" });
  const step = result.inspection.messages.workoutStepMesgs[0];
  assert.equal(step.durationType, 0);
  assert.equal(step.durationTime ?? (step.durationValue / 1000), 30);
  assert.equal(step.exerciseCategory, 19);
  assert.equal(step.exerciseName, 43);
});

test("physical exercise weight survives FIT profile scaling", () => {
  const workout = makeWorkout([{
    exerciseKey:"dumbbell_romanian_deadlift",
    name:"Dumbbell Romanian Deadlift",
    sets:[{ metricType:"reps", minReps:8, maxReps:8, targetReps:8, restSec:120, weightKg:20 }],
  }]);
  const result = encodeAndInspectGarminFitWorkout(workout, { timeCreated:"2026-08-23T18:00:00.000Z" });
  const step = result.inspection.messages.workoutStepMesgs[0];
  assert.equal(step.exerciseCategory, 8);
  assert.equal(step.exerciseName, 23);
  assert.equal(step.exerciseWeight, 20);
});

test("unresolved rep ranges are blocked before FIT binary creation with device-verification metadata", () => {
  const exercise = exactPushUp();
  exercise.sets = [{ metricType:"reps", minReps:8, maxReps:10, targetReps:null, targetRir:2, restSec:90 }];
  assert.throws(
    () => encodeGarminFitWorkout(makeWorkout([exercise])),
    (error) => {
      assert.ok(error instanceof GarminFitEncoderError);
      assert.equal(error.code, "GARMIN_RANGE_DEVICE_VERIFICATION_REQUIRED");
      assert.equal(error.details.targetPolicy.publishReady, false);
      assert.equal(error.details.targetPolicy.deviceVerificationRequired, true);
      assert.equal(error.details.targetPolicy.candidatePolicy.key, "open_range_preview_v1");
      assert.deepEqual(error.details.targetPolicy.ranges.map((item) => [item.min, item.max, item.targetRir]), [[8, 10, 2]]);
      return true;
    },
  );
});

test("unresolved duration ranges are also blocked rather than coerced into one time target", () => {
  const workout = makeWorkout([{
    exerciseKey:"front_plank",
    name:"Front Plank",
    sets:[{ metricType:"duration_seconds", minDurationSeconds:30, maxDurationSeconds:45, targetDurationSeconds:null, restSec:45 }],
  }]);
  assert.throws(
    () => encodeGarminFitWorkout(workout),
    (error) => {
      assert.ok(error instanceof GarminFitEncoderError);
      assert.equal(error.code, "GARMIN_RANGE_DEVICE_VERIFICATION_REQUIRED");
      assert.equal(error.details.targetPolicy.ranges[0].metricType, "duration_seconds");
      return true;
    },
  );
});

test("canonical but unmapped exercise is blocked from strict FIT workout encoding", () => {
  const workout = makeWorkout([{
    exerciseKey:"hollow_body_hold",
    name:"Hollow Body Hold",
    sets:[{ metricType:"duration_seconds", minDurationSeconds:20, maxDurationSeconds:20, targetDurationSeconds:20, restSec:45 }],
  }]);
  assert.throws(
    () => encodeGarminFitWorkout(workout),
    (error) => {
      assert.ok(error instanceof GarminFitEncoderError);
      assert.equal(error.code, "FIT_EXERCISE_MAPPING_REQUIRED");
      return true;
    },
  );
});

test("binary inspector rejects arbitrary non-FIT bytes", () => {
  const inspected = inspectGarminFitWorkout(new Uint8Array([1,2,3,4,5,6,7,8]));
  assert.equal(inspected.isFit, false);
  assert.equal(inspected.integrity, false);
  assert.ok(inspected.errors.length > 0);
});
