import test from "node:test";
import assert from "node:assert/strict";
import { bundleAdaptationProposals } from "../lib/adaptation-bundle.mjs";

const payload = {
  exercises:[
    { exerciseKey:"push_up", sets:[{ minReps:8, maxReps:10 }] },
    { exerciseKey:"pull_up", sets:[{ minReps:5, maxReps:8 }] },
  ],
};

test("multiple exercise changes for one future session become one atomic bundle", () => {
  const proposals = [
    {
      applied:true,
      exerciseKey:"push_up",
      targetProgramSessionId:"ps-next",
      expectedRevision:3,
      newPayload:{ exercises:[{ exerciseKey:"push_up", sets:[{ minReps:9, maxReps:11 }] }, payload.exercises[1]] },
      audit:{ adjustment_type:"progress_reps", reason_code:"A", reason_text:"A", evidence_level:"heuristic", before_state:payload.exercises[0], after_state:{ exerciseKey:"push_up", sets:[{ minReps:9, maxReps:11 }] }, science_version:"2026-08-23.1", evidence_claim_ids:[], evidence_rule_keys:["repTargetIncrement"], decision_confidence:0.7, metrics_snapshot:{}, decision_source:"deterministic" },
    },
    {
      applied:true,
      exerciseKey:"pull_up",
      targetProgramSessionId:"ps-next",
      expectedRevision:3,
      newPayload:{ exercises:[payload.exercises[0], { exerciseKey:"pull_up", sets:[{ minReps:6, maxReps:9 }] }] },
      audit:{ adjustment_type:"progress_reps", reason_code:"B", reason_text:"B", evidence_level:"heuristic", before_state:payload.exercises[1], after_state:{ exerciseKey:"pull_up", sets:[{ minReps:6, maxReps:9 }] }, science_version:"2026-08-23.1", evidence_claim_ids:[], evidence_rule_keys:["repTargetIncrement"], decision_confidence:0.7, metrics_snapshot:{}, decision_source:"deterministic" },
    },
  ];
  const bundles = bundleAdaptationProposals(proposals);
  assert.equal(bundles.length, 1);
  assert.equal(bundles[0].expectedRevision, 3);
  assert.equal(bundles[0].adjustments.length, 2);
  assert.equal(bundles[0].newPayload.exercises[0].sets[0].minReps, 9);
  assert.equal(bundles[0].newPayload.exercises[1].sets[0].minReps, 6);
});

test("different future sessions stay in separate transactions", () => {
  const proposals = [
    { applied:true, exerciseKey:"push_up", targetProgramSessionId:"a", expectedRevision:1, newPayload:payload, audit:{ after_state:payload.exercises[0] } },
    { applied:true, exerciseKey:"pull_up", targetProgramSessionId:"b", expectedRevision:1, newPayload:payload, audit:{ after_state:payload.exercises[1] } },
  ];
  assert.equal(bundleAdaptationProposals(proposals).length, 2);
});
