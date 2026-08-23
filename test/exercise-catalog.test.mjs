import test from "node:test";
import assert from "node:assert/strict";
import {
  EXERCISE_CATALOG_VERSION,
  canonicalizeExerciseSelection,
  catalogCoverageForEquipment,
  catalogCoverageGaps,
  exerciseKeysForEquipment,
  getExerciseDefinition,
} from "../lib/exercise-catalog.mjs";

const CORE_CAPABILITIES = ["upperPush","upperPull","kneeDominant","hinge","calves","core"];
const MAJOR_MUSCLES = ["chest","lats","upper_back","front_delts","side_delts","rear_delts","biceps","triceps","quads","hamstrings","glutes","calves"];

test("catalog resolves aliases to one stable exercise identity", () => {
  const a = getExerciseDefinition("Pike Push-Up");
  const b = getExerciseDefinition("pike pushup");
  const c = canonicalizeExerciseSelection({ exerciseKey: "pike_push_up_friday", name: "Pike Push-Up" });
  assert.equal(a?.key, "pike_push_up");
  assert.equal(b?.key, "pike_push_up");
  assert.equal(c?.exerciseKey, "pike_push_up");
  assert.equal(c?.primaryMuscles?.[0], "front_delts");
  assert.equal(c?.catalogVersion, EXERCISE_CATALOG_VERSION);
});

test("catalog equipment filter never offers unavailable support", () => {
  const keys = exerciseKeysForEquipment(["pull_up_bar", "kettlebells"]);
  assert.ok(keys.includes("pull_up"));
  assert.ok(keys.includes("goblet_squat"));
  assert.ok(keys.includes("kettlebell_floor_press"));
  assert.ok(!keys.includes("barbell_bench_press"));
  assert.ok(!keys.includes("bulgarian_split_squat"));
  assert.ok(!keys.includes("dumbbell_romanian_deadlift"));
});

test("catalog owns anatomy instead of trusting model metadata", () => {
  const canonical = canonicalizeExerciseSelection({
    exerciseKey: "push_up",
    name: "Push-Up",
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["chest"],
    movementPattern: "other",
    loadType: "external_weight",
    requiredEquipment: ["barbell"],
    progressionMode: "load_progression",
    setMetric: "duration_seconds",
  });
  assert.deepEqual(canonical.primaryMuscles, ["chest"]);
  assert.ok(canonical.secondaryMuscles.includes("triceps"));
  assert.ok(!canonical.secondaryMuscles.includes("abs"));
  assert.ok(canonical.fatigueTags.includes("core_bracing"));
  assert.equal(canonical.movementPattern, "horizontal_push");
  assert.equal(canonical.loadType, "bodyweight");
  assert.deepEqual(canonical.requiredEquipment, ["bodyweight", "floor"]);
  assert.equal(canonical.progressionMode, "variant_progression");
  assert.equal(canonical.setMetric, "reps");
});

test("stabilizer fatigue is preserved without inflating muscle dose metadata", () => {
  const rdl = canonicalizeExerciseSelection({ exerciseKey: "kettlebell_rdl", setMetric: "duration_seconds" });
  assert.deepEqual(rdl.primaryMuscles, ["hamstrings", "glutes"]);
  assert.deepEqual(rdl.secondaryMuscles, ["adductors"]);
  assert.ok(rdl.fatigueTags.includes("grip"));
  assert.ok(rdl.fatigueTags.includes("spinal_bracing"));
  assert.ok(rdl.fatigueTags.includes("hinge"));
  assert.equal(rdl.setMetric, "reps");
});

test("overhead pressing does not falsely count upper-back hypertrophy volume", () => {
  for (const key of ["pike_push_up","handstand_push_up_wall","kettlebell_overhead_press","barbell_overhead_press","dumbbell_overhead_press"]) {
    const exercise = getExerciseDefinition(key);
    assert.ok(exercise, key);
    assert.ok(!exercise.secondaryMuscles.includes("upper_back"), `${key} should not count upper_back as fractional training dose`);
    assert.ok(exercise.fatigueTags.includes("shoulder_girdle_stability") || key === "dumbbell_overhead_press");
  }
});

test("timed versus rep metric is owned by the catalog", () => {
  const pushup = canonicalizeExerciseSelection({ exerciseKey: "push_up", setMetric: "duration_seconds" });
  const hollow = canonicalizeExerciseSelection({ exerciseKey: "hollow_body_hold", setMetric: "reps" });
  assert.equal(pushup.setMetric, "reps");
  assert.equal(hollow.setMetric, "duration_seconds");
});

test("dumbbells plus bench can support a balanced general strength program", () => {
  const gaps = catalogCoverageGaps(["dumbbells","bench"], { requiredCapabilities:CORE_CAPABILITIES, requiredPrimaryMuscles:MAJOR_MUSCLES });
  assert.deepEqual(gaps.missingCapabilities, []);
  assert.deepEqual(gaps.missingPrimaryMuscles, []);
  assert.ok(gaps.coverage.exerciseKeys.includes("dumbbell_romanian_deadlift"));
  assert.ok(gaps.coverage.exerciseKeys.includes("dumbbell_overhead_press"));
  assert.ok(gaps.coverage.exerciseKeys.includes("dumbbell_chest_supported_rear_delt_fly"));
});

test("machines plus cables can support a balanced full-body program without free weights", () => {
  const gaps = catalogCoverageGaps(["machines","cables"], { requiredCapabilities:CORE_CAPABILITIES, requiredPrimaryMuscles:MAJOR_MUSCLES });
  assert.deepEqual(gaps.missingCapabilities, []);
  assert.deepEqual(gaps.missingPrimaryMuscles, []);
  assert.ok(gaps.coverage.exerciseKeys.includes("machine_chest_press"));
  assert.ok(gaps.coverage.exerciseKeys.includes("cable_pull_through"));
  assert.ok(gaps.coverage.exerciseKeys.includes("machine_calf_raise"));
});

test("coverage audit reports real gaps instead of inflating exercise count", () => {
  const coverage = catalogCoverageForEquipment([]);
  assert.equal(typeof coverage.exerciseCount, "number");
  const gaps = catalogCoverageGaps([], { requiredCapabilities:["upperPull"], requiredPrimaryMuscles:["lats"] });
  assert.ok(gaps.missingCapabilities.includes("upperPull"));
  assert.ok(gaps.missingPrimaryMuscles.includes("lats"));
});
