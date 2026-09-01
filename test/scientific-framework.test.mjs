import test from "node:test";
import assert from "node:assert/strict";
import { RULES } from "../lib/programming-engine.mjs";
import {
  CLAIMS,
  RULE_EVIDENCE_BINDINGS,
  SCIENCE_VERSION,
  SOURCES,
  evidenceForRule,
  validateScientificFramework,
} from "../lib/scientific-framework.mjs";

test("every deterministic programming rule is scientifically bound or explicitly heuristic", () => {
  const audit = validateScientificFramework(RULES);
  assert.equal(audit.valid, true, audit.errors.join("\n"));
  assert.equal(audit.ruleBindingCount, Object.keys(RULES).length);
});

test("scientific claims always resolve to real registered sources", () => {
  for (const [claimId, claim] of Object.entries(CLAIMS)) {
    assert.ok(claim.statement.length > 30, `${claimId} needs a substantive statement`);
    assert.ok(claim.applicability.length > 20, `${claimId} needs applicability limits`);
    assert.ok(claim.sourceIds.length > 0, `${claimId} needs sources`);
    for (const sourceId of claim.sourceIds) {
      assert.ok(SOURCES[sourceId], `${claimId} references unknown source ${sourceId}`);
      assert.match(SOURCES[sourceId].url, /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//);
    }
  }
});

test("heuristic thresholds cannot masquerade as high-confidence evidence rules", () => {
  const heuristicRules = ["fractionalSecondarySet", "accessoryMinRestSec", "samePriorityMuscleMinGapHours", "minimumPriorityFractionalSets", "durationToleranceRatio"];
  for (const ruleKey of heuristicRules) {
    const binding = RULE_EVIDENCE_BINDINGS[ruleKey];
    assert.ok(binding, `${ruleKey} missing scientific binding`);
    assert.notEqual(binding.kind, "evidence_backed");
    assert.notEqual(binding.level, "high");
  }
});

test("secondary-set fraction stays an evidence-informed model rather than an exact physiological law", () => {
  const claim = CLAIMS.fractional_direct_indirect_sets;
  const binding = RULE_EVIDENCE_BINDINGS.fractionalSecondarySet;
  assert.equal(claim.confidence, "moderate");
  assert.equal(binding.kind, "evidence_informed_heuristic");
  assert.equal(binding.level, "moderate");
  assert.match(claim.applicability, /does not establish.*exactly one-half/i);
  assert.match(binding.note, /not a universal/i);
});

test("evidence retrieval returns claims and source provenance for explainability", () => {
  const evidence = evidenceForRule("competingSuperset");
  assert.equal(evidence.scienceVersion, SCIENCE_VERSION);
  assert.ok(evidence.claims.some((claim) => claim.id === "supersets_time_efficiency_tradeoff"));
  assert.ok(evidence.sources.some((source) => source.id === "superset_2025_meta"));
});

test("framework preserves nuanced conclusions instead of fitness dogma", () => {
  assert.match(CLAIMS.periodization_contextual_tool.statement, /not a mandatory/i);
  assert.match(CLAIMS.failure_not_required.statement, /not required/i);
  assert.match(CLAIMS.volume_positive_diminishing_returns.applicability, /does not establish one universal/i);
  assert.match(CLAIMS.split_fullbody_equivalent_when_volume_equated.statement, /similar/i);
});
