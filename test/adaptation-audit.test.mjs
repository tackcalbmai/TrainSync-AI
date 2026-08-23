import test from "node:test";
import assert from "node:assert/strict";
import { buildProgramAdjustmentAudit, derivedEvidence, SCIENTIFIC_AUDIT_VERSION, validateProgramAdjustmentAudit } from "../lib/adaptation-audit.mjs";
import { SCIENCE_VERSION } from "../lib/scientific-framework.mjs";
import { ADAPTATION_SCIENCE_VERSION } from "../lib/adaptation-evidence.mjs";

test("audit derives evidence level and claims from registered rule keys", () => {
  const row = buildProgramAdjustmentAudit({
    adjustmentType: "superset_repair",
    reasonCode: "COMPETING_SUPERSET",
    reasonText: "Separated a competing superset to preserve priority performance.",
    ruleKeys: ["competingSuperset"],
    beforeState: { group: "A" },
    afterState: { group: null },
    metricsSnapshot: { estimatedMinutes: 42 },
    decisionConfidence: 0.82,
  });
  assert.equal(row.evidence_level, "moderate");
  assert.equal(row.science_version, SCIENTIFIC_AUDIT_VERSION);
  assert.equal(row.metrics_snapshot.scienceVersions.programming, SCIENCE_VERSION);
  assert.equal(row.metrics_snapshot.scienceVersions.adaptation, ADAPTATION_SCIENCE_VERSION);
  assert.ok(row.evidence_claim_ids.includes("supersets_time_efficiency_tradeoff"));
  assert.deepEqual(row.evidence_rule_keys, ["competingSuperset"]);
  assert.equal(validateProgramAdjustmentAudit(row).valid, true);
});

test("programming and adaptation evidence versions are independently traceable", () => {
  assert.match(SCIENTIFIC_AUDIT_VERSION, new RegExp(`^${SCIENCE_VERSION.replaceAll(".", "\\.")}\\+adapt:`));
  assert.ok(SCIENTIFIC_AUDIT_VERSION.endsWith(ADAPTATION_SCIENCE_VERSION));
});

test("weakest evidence level wins when a decision mixes evidence and heuristic rules", () => {
  const evidence = derivedEvidence(["competingSuperset", "sharedFatigueSuperset"]);
  assert.equal(evidence.level, "heuristic");
});

test("manual or unbound decisions are honestly heuristic", () => {
  const row = buildProgramAdjustmentAudit({
    adjustmentType: "manual_override",
    reasonCode: "USER_EDIT",
    reasonText: "User manually changed the planned exercise.",
    decisionSource: "manual",
  });
  assert.equal(row.evidence_level, "heuristic");
  assert.deepEqual(row.evidence_claim_ids, []);
  assert.equal(validateProgramAdjustmentAudit(row).valid, true);
});

test("AI cannot invent scientific rule keys or evidence claims", () => {
  assert.throws(() => buildProgramAdjustmentAudit({
    adjustmentType: "load_change",
    reasonCode: "AI_DECISION",
    reasonText: "Increase load.",
    ruleKeys: ["ai_says_so"],
    decisionSource: "ai_assisted",
  }), /Unknown scientific rule key/);
});

test("tampering with derived evidence is detected", () => {
  const row = buildProgramAdjustmentAudit({
    adjustmentType: "rest_change",
    reasonCode: "REST_QUALITY",
    reasonText: "Increase rest for priority strength work.",
    ruleKeys: ["heavyCompoundMinRestSec"],
  });
  row.evidence_level = "high";
  row.evidence_claim_ids = ["progressive_rt_effective"];
  const audit = validateProgramAdjustmentAudit(row);
  assert.equal(audit.valid, false);
  assert.ok(audit.errors.some((item) => item.includes("evidence_level")));
  assert.ok(audit.errors.some((item) => item.includes("evidence_claim_ids")));
});
