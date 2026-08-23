import test from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTATION_CLAIMS,
  ADAPTATION_RULE_BINDINGS,
  validateAdaptationEvidence,
} from "../lib/adaptation-evidence.mjs";
import { buildProgramAdjustmentAudit } from "../lib/adaptation-audit.mjs";

test("adaptation evidence registry is internally valid", () => {
  const audit = validateAdaptationEvidence();
  assert.equal(audit.valid, true, audit.errors.join("\n"));
});

test("progression evidence allows reps or load instead of enforcing one dogma", () => {
  assert.match(ADAPTATION_CLAIMS.repetitions_and_load_are_both_viable_progression_tools.statement, /both/i);
  assert.equal(ADAPTATION_RULE_BINDINGS.progressionModeChoice.level, "moderate");
});

test("repeated-success trigger stays labelled heuristic in its exact timing", () => {
  const binding = ADAPTATION_RULE_BINDINGS.progressionAfterRepeatedSuccess;
  assert.equal(binding.kind, "evidence_informed_heuristic");
  assert.match(binding.note, /exact number of exposures is not established/i);
});

test("performance-triggered volume adjustment is evidence-informed without diagnosing fatigue", () => {
  const claim = ADAPTATION_CLAIMS.volume_is_a_plausible_fatigue_management_lever;
  const binding = ADAPTATION_RULE_BINDINGS.reduceAfterRepeatedHighEffortUnderperformance;
  assert.equal(claim.confidence, "moderate");
  assert.ok(claim.sourceIds.includes("hickmott_2022_autoreg_volume"));
  assert.ok(claim.sourceIds.includes("varela_olalla_2025_fatigue"));
  assert.match(claim.statement, /do not establish that any particular.*was caused by fatigue/i);
  assert.equal(binding.kind, "evidence_informed_heuristic");
  assert.equal(binding.level, "heuristic");
  assert.ok(binding.claimIds.includes("volume_is_a_plausible_fatigue_management_lever"));
  assert.match(binding.note, /not a diagnosis of fatigue/i);
  const row = buildProgramAdjustmentAudit({
    adjustmentType: "reduce_or_review",
    reasonCode: "REPEATED_HIGH_EFFORT_UNDERPERFORMANCE",
    reasonText: "Temporarily reduce one working set after repeated target misses at very high reported effort.",
    ruleKeys: ["reduceAfterRepeatedHighEffortUnderperformance"],
    decisionConfidence: 0.8,
  });
  assert.equal(row.evidence_level, "heuristic");
  assert.ok(row.evidence_claim_ids.includes("volume_is_a_plausible_fatigue_management_lever"));
});

test("legacy fatigue binding remains registered only for historical audit compatibility", () => {
  const binding = ADAPTATION_RULE_BINDINGS.reduceAfterRepeatedFatigue;
  assert.equal(binding.level, "heuristic");
  assert.match(binding.note, /legacy compatibility/i);
});

test("calendar deload is not represented as scientific necessity", () => {
  assert.match(ADAPTATION_CLAIMS.fixed_calendar_deload_is_not_established.statement, /not established/i);
  assert.equal(ADAPTATION_RULE_BINDINGS.noAutomaticCalendarDeload.level, "emerging");
});

test("adaptation audit can derive progression evidence without AI-provided citations", () => {
  const row = buildProgramAdjustmentAudit({
    adjustmentType: "progression",
    reasonCode: "REPEATED_SUCCESS",
    reasonText: "Progress after repeated successful exposures.",
    ruleKeys: ["progressionAfterRepeatedSuccess", "progressionModeChoice"],
    decisionConfidence: 0.8,
  });
  assert.equal(row.evidence_level, "moderate");
  assert.ok(row.evidence_claim_ids.includes("progressive_overload_supports_continued_adaptation"));
  assert.ok(row.evidence_claim_ids.includes("repetitions_and_load_are_both_viable_progression_tools"));
});
