import test from "node:test";
import assert from "node:assert/strict";
import { explainProgramAdjustment, summarizePrescriptionChange } from "../lib/adaptation-explanation.mjs";

function sets(count, overrides = {}) {
  return { exerciseKey:"bench_press", name:"Bench Press", sets:Array.from({ length:count }, (_, index) => ({ index:index + 1, metricType:"reps", minReps:8, maxReps:10, targetReps:null, weightKg:50, ...overrides })) };
}

test("volume explanation states the exact reversible set change", () => {
  assert.equal(summarizePrescriptionChange(sets(4), sets(3)), "4 → 3 working sets");
});

test("load explanation states the actual prescribed load change", () => {
  assert.equal(summarizePrescriptionChange(sets(3), sets(3, { weightKg:52.5 })), "50 → 52.5 kg");
});

test("rep explanation preserves ranges instead of collapsing them", () => {
  assert.equal(summarizePrescriptionChange(sets(3), sets(3, { minReps:9, maxReps:10 })), "8–10 reps → 9–10 reps");
});

test("repeated high-effort underperformance is described as an observed pattern, not a diagnosis", () => {
  const model = explainProgramAdjustment({
    adjustment_type:"reduce_volume",
    reason_code:"REPEATED_HIGH_EFFORT_UNDERPERFORMANCE",
    reason_text:"Long-form scientific audit reason.",
    evidence_level:"heuristic",
    decision_confidence:0.82,
    before_state:sets(4),
    after_state:sets(3),
    evidence_rule_keys:["reduceAfterRepeatedHighEffortUnderperformance"],
    evidence_claim_ids:["autoregulationPerformanceSignals"],
    science_version:"2026-08-23.2",
  });
  assert.equal(model.title, "VOLUME REDUCED");
  assert.match(model.why, /Repeated exposures missed the target at very high reported effort/);
  assert.doesNotMatch(model.why, /diagnos/i);
  assert.equal(model.change, "4 → 3 working sets");
  assert.equal(model.confidencePct, 82);
  assert.equal(model.evidenceLevel, "heuristic");
});

test("limited-effort top-range progression says that repeated confirmation was required", () => {
  const model = explainProgramAdjustment({
    adjustment_type:"progress_reps",
    reason_code:"REPEATED_TOP_RANGE_COMPLETION",
    decision_confidence:0.66,
    before_state:sets(3),
    after_state:sets(3, { minReps:9, maxReps:11 }),
  });
  assert.match(model.why, /three consecutive exposures/);
  assert.match(model.why, /direct effort data were limited/);
});

test("unknown historical reason remains explainable without invented science", () => {
  const model = explainProgramAdjustment({
    adjustment_type:"legacy_change",
    reason_code:"LEGACY_REASON",
    reason_text:"Historical audit text.",
    before_state:{},
    after_state:{},
  });
  assert.equal(model.why, "Historical audit text.");
  assert.equal(model.evidenceLevel, "heuristic");
  assert.equal(model.confidencePct, null);
});
