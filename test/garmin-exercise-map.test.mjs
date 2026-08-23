import test from "node:test";
import assert from "node:assert/strict";
import {
  GARMIN_EXERCISE_MAP_VERSION,
  GARMIN_FIT_PROFILE_VERSION,
  garminExerciseMappingCoverage,
  getGarminExerciseMapping,
  reverseGarminExerciseMapping,
  toGarminWorkoutExercise,
  validateGarminExerciseMap,
} from "../lib/garmin-exercise-map.mjs";
import { EXERCISE_CATALOG } from "../lib/exercise-catalog.mjs";

test("Garmin mapping registry is internally valid and pinned to FIT 21.213.0", () => {
  const audit = validateGarminExerciseMap();
  assert.equal(audit.valid, true, audit.errors.join("\n"));
  assert.equal(audit.fitProfileVersion, "21.213.0");
  assert.equal(GARMIN_FIT_PROFILE_VERSION, "21.213.0");
  assert.match(GARMIN_EXERCISE_MAP_VERSION, /^fit-21\.213\.0\+trainsync-/);
});

test("exact mappings use reviewed official category and exercise-name IDs", () => {
  const pushup = getGarminExerciseMapping("push_up");
  assert.equal(pushup.match, "exact");
  assert.deepEqual(pushup.exerciseCategory, { id:22, name:"PUSH_UP" });
  assert.deepEqual(pushup.exerciseName, { id:77, name:"PUSH_UP" });

  const bench = getGarminExerciseMapping("barbell_bench_press");
  assert.equal(bench.match, "exact");
  assert.deepEqual(bench.exerciseCategory, { id:0, name:"BENCH_PRESS" });
  assert.deepEqual(bench.exerciseName, { id:1, name:"BARBELL_BENCH_PRESS" });

  const deadBug = getGarminExerciseMapping("dead_bug");
  assert.equal(deadBug.match, "exact");
  assert.deepEqual(deadBug.exerciseCategory, { id:11, name:"HIP_STABILITY" });
  assert.deepEqual(deadBug.exerciseName, { id:1, name:"DEAD_BUG" });
});

test("compatible mapping never pretends that Garmin preserves lost TrainSync detail", () => {
  const rdl = getGarminExerciseMapping("dumbbell_romanian_deadlift");
  assert.equal(rdl.match, "compatible");
  assert.deepEqual(rdl.exerciseCategory, { id:8, name:"DEADLIFT" });
  assert.deepEqual(rdl.exerciseName, { id:23, name:"ROMANIAN_DEADLIFT" });
  assert.match(rdl.notes, /dumbbell implement/i);

  const projection = toGarminWorkoutExercise({ exerciseKey:"dumbbell_romanian_deadlift" });
  assert.equal(projection.match, "compatible");
  assert.equal(projection.wktStepName, "Dumbbell Romanian Deadlift");
});

test("unmapped exercises preserve TrainSync identity without inventing Garmin enums", () => {
  for (const exerciseKey of ["pseudo_planche_push_up", "leg_extension", "hollow_body_hold", "kettlebell_swing"]) {
    const mapping = getGarminExerciseMapping(exerciseKey);
    assert.equal(mapping.match, "unmapped", exerciseKey);
    assert.equal(mapping.exerciseCategory, null);
    assert.equal(mapping.exerciseName, null);
    const projection = toGarminWorkoutExercise({ exerciseKey });
    assert.equal(projection.valid, true);
    assert.equal(projection.reasonCode, "GARMIN_EXERCISE_UNMAPPED");
    assert.equal(projection.exerciseCategory, null);
    assert.equal(projection.exerciseName, null);
    assert.equal(projection.wktStepName, EXERCISE_CATALOG[exerciseKey].name);
  }
});

test("unknown TrainSync exercise is rejected rather than fuzzily mapped", () => {
  assert.equal(getGarminExerciseMapping("bench_pressish_thing"), null);
  const projection = toGarminWorkoutExercise({ exerciseKey:"bench_pressish_thing" });
  assert.equal(projection.valid, false);
  assert.equal(projection.reasonCode, "UNKNOWN_TRAINSYNC_EXERCISE");
});

test("reverse Garmin mapping returns candidates when one FIT tuple is intentionally ambiguous", () => {
  const candidates = reverseGarminExerciseMapping(28, 37).map((entry) => entry.exerciseKey).sort();
  assert.deepEqual(candidates, ["dumbbell_goblet_squat", "goblet_squat"]);
});

test("mapping coverage accounts for every canonical catalog exercise without demanding fake 100 percent mapping", () => {
  const coverage = garminExerciseMappingCoverage();
  assert.equal(coverage.catalogCount, Object.keys(EXERCISE_CATALOG).length);
  assert.equal(coverage.exactCount + coverage.compatibleCount + coverage.unmappedCount, coverage.catalogCount);
  assert.equal(coverage.mappedCount, coverage.exactCount + coverage.compatibleCount);
  assert.ok(coverage.exactCount > 0);
  assert.ok(coverage.compatibleCount > 0);
  assert.ok(coverage.unmappedCount > 0);
  assert.ok(coverage.unmapped.includes("pseudo_planche_push_up"));
});
