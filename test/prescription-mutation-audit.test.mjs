import test from "node:test";
import assert from "node:assert/strict";
import { buildProgramAdjustmentAudit, validateProgramAdjustmentAudit } from "../lib/adaptation-audit.mjs";
import { applyAdaptationDecision, mergeDecisionAndMutationRuleKeys } from "../lib/prescription-mutation.mjs";

const exercise = {
  exerciseKey:"kettlebell_floor_press",
  name:"Kettlebell Floor Press",
  role:"hypertrophy_compound",
  progressionMode:"double_progression",
  sets:[{ metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:120, weightKg:20 }],
};

test("weight progression applies only a compatible known equipment step", () => {
  const result = applyAdaptationDecision({ exercise, decision:{ action:"progress_load" }, availableLoadsKg:[20,21,22] });
  assert.equal(result.applied, true);
  assert.equal(result.exercise.sets[0].weightKg, 21);
  assert.ok(result.ruleKeys.includes("equipmentAwareLoadIncrement"));
});

test("final audit derives provenance from decision and mutation rules", () => {
  const decision = { action:"progress_reps", ruleKeys:["progressionAfterRepeatedSuccess","progressionModeChoice"], confidence:0.8 };
  const mutation = applyAdaptationDecision({ exercise, decision });
  const row = buildProgramAdjustmentAudit({
    adjustmentType:decision.action,
    reasonCode:"REPEATED_CONTROLLED_OVERPERFORMANCE",
    reasonText:"Repeated successful exposures supported a small repetition-target progression.",
    ruleKeys:mergeDecisionAndMutationRuleKeys(decision, mutation),
    beforeState:exercise,
    afterState:mutation.exercise,
    decisionConfidence:decision.confidence,
  });
  assert.equal(row.evidence_level, "heuristic");
  assert.ok(row.evidence_claim_ids.includes("repetitions_and_load_are_both_viable_progression_tools"));
  assert.ok(row.evidence_rule_keys.includes("repTargetIncrement"));
  assert.equal(validateProgramAdjustmentAudit(row).valid, true);
});

test("primary strength repetition ceiling blocks an inappropriate reps mutation", () => {
  const strength = { ...exercise, role:"primary_strength", sets:[{ metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:180, weightKg:20 }] };
  const result = applyAdaptationDecision({ exercise:strength, decision:{ action:"progress_reps" } });
  assert.equal(result.applied, false);
  assert.equal(result.reasonCode, "REP_CEILING_REACHED");
});
