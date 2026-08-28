import test from "node:test";
import assert from "node:assert/strict";
import {
  EXERCISE_SUBSTITUTION_VERSION,
  exerciseSubstitutionCandidates,
  scoreExerciseSubstitution,
  validateExerciseSubstitution,
} from "../lib/exercise-substitution.mjs";

test("bench press substitutions prioritize compatible chest presses with available equipment", () => {
  const candidates = exerciseSubstitutionCandidates("barbell_bench_press", { equipment:["dumbbells","bench","machines","cables","barbell","rack"] });
  const keys = candidates.map((item) => item.exerciseKey);
  assert.ok(keys.includes("dumbbell_bench_press"));
  assert.ok(keys.includes("machine_chest_press"));
  assert.ok(keys.includes("cable_chest_press"));
  assert.ok(candidates.every((item) => item.loadTransferAllowed === false));
});

test("candidate requiring unavailable equipment is rejected", () => {
  const result = scoreExerciseSubstitution("push_up", "machine_chest_press", { equipment:[] });
  assert.equal(result.eligible, false);
  assert.equal(result.reasonCode, "EQUIPMENT_UNAVAILABLE");
});

test("same movement and primary target can be a valid substitution without pretending loads transfer", () => {
  const result = validateExerciseSubstitution("barbell_bench_press", "dumbbell_bench_press", { equipment:["dumbbells","bench"] });
  assert.equal(result.eligible, true);
  assert.equal(result.sameMovement, true);
  assert.equal(result.loadTransferAllowed, false);
  assert.equal(result.prescriptionTransfer.load, false);
  assert.equal(result.prescriptionTransfer.targetRange, true);
  assert.equal(result.prescriptionTransfer.targetRir, true);
  assert.equal(result.policyVersion, EXERCISE_SUBSTITUTION_VERSION);
});

test("unrelated movement is rejected even when equipment is available", () => {
  const result = scoreExerciseSubstitution("barbell_bench_press", "barbell_deadlift", { equipment:["barbell","bench","floor"] });
  assert.equal(result.eligible, false);
  assert.match(result.reasonCode, /MISMATCH|TOO_LOW/);
});

test("different load semantics are exposed as a warning instead of hidden", () => {
  const candidates = exerciseSubstitutionCandidates("barbell_bench_press", { equipment:["barbell","bench","machines"] });
  const machine = candidates.find((item) => item.exerciseKey === "machine_chest_press");
  assert.ok(machine);
  assert.equal(machine.sameLoadType, true);
  assert.equal(machine.loadTransferAllowed, false);
});

test("candidate ordering is deterministic", () => {
  const a = exerciseSubstitutionCandidates("machine_row", { equipment:["machines","cables","dumbbells","bench"] });
  const b = exerciseSubstitutionCandidates("machine_row", { equipment:["machines","cables","dumbbells","bench"] });
  assert.deepEqual(a.map((x) => [x.exerciseKey,x.score]), b.map((x) => [x.exerciseKey,x.score]));
});

test("unknown exercises never receive fuzzy substitutions", () => {
  assert.deepEqual(exerciseSubstitutionCandidates("mystery super row", { equipment:["machines"] }), []);
  assert.throws(() => validateExerciseSubstitution("mystery super row", "machine_row", { equipment:["machines"] }), /EXERCISE_SUBSTITUTION_NOT_ALLOWED/);
});
