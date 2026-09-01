import { RULES } from "../lib/programming-engine.mjs";
import { validateScientificFramework } from "../lib/scientific-framework.mjs";
import { ADAPTATION_SCIENCE_VERSION, validateAdaptationEvidence } from "../lib/adaptation-evidence.mjs";
import { buildProgramAdjustmentAudit, SCIENTIFIC_AUDIT_VERSION, validateProgramAdjustmentAudit } from "../lib/adaptation-audit.mjs";
import { buildAdaptationAudit, decideExerciseAdaptation } from "../lib/adaptation-policy.mjs";
import { applyAdaptationDecision, mergeDecisionAndMutationRuleKeys } from "../lib/prescription-mutation.mjs";
import { methodNotAllowed } from "../lib/http.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const framework = validateScientificFramework(RULES);
  const adaptationEvidence = validateAdaptationEvidence();
  const sampleAdjustment = buildProgramAdjustmentAudit({
    adjustmentType: "health_check",
    reasonCode: "SCIENTIFIC_AUDIT",
    reasonText: "Verify evidence-derived adjustment provenance.",
    ruleKeys: ["competingSuperset"],
    decisionConfidence: 0.8,
  });
  const adjustmentAudit = validateProgramAdjustmentAudit(sampleAdjustment);
  const observedPatternAdjustment = buildProgramAdjustmentAudit({
    adjustmentType: "reduce_or_review",
    reasonCode: "REPEATED_HIGH_EFFORT_UNDERPERFORMANCE",
    reasonText: "Verify performance-triggered volume adaptation remains evidence-informed without diagnosing the cause of the observed pattern.",
    ruleKeys: ["reduceAfterRepeatedHighEffortUnderperformance"],
    decisionConfidence: 0.78,
    metricsSnapshot: { recentPerformance:[{ state:"high_effort_underperformance" }] },
  });
  const observedPatternAudit = validateProgramAdjustmentAudit(observedPatternAdjustment);
  const observedPatternAuditReady = observedPatternAudit.valid
    && observedPatternAdjustment.evidence_level === "heuristic"
    && observedPatternAdjustment.evidence_claim_ids.includes("volume_is_a_plausible_fatigue_management_lever")
    && observedPatternAdjustment.metrics_snapshot?.recentPerformance?.[0]?.state === "high_effort_underperformance";
  const adaptationDecision = decideExerciseAdaptation({
    progressionMode: "reps_only",
    recentPerformances: [
      { state: "overperformed", confidence: 0.82 },
      { state: "overperformed", confidence: 0.79 },
    ],
  });
  const adaptationAudit = validateProgramAdjustmentAudit(buildAdaptationAudit(adaptationDecision));
  const adaptationPolicyReady = adaptationDecision.action === "progress_reps" && adaptationAudit.valid;
  const sampleExercise = {
    exerciseKey: "kettlebell_floor_press",
    name: "Kettlebell Floor Press",
    role: "hypertrophy_compound",
    progressionMode: "double_progression",
    sets: [{ metricType: "reps", minReps: 8, maxReps: 10, targetRir: 2, restSec: 120, weightKg: 20 }],
  };
  const sampleMutation = applyAdaptationDecision({ exercise: sampleExercise, decision: adaptationDecision });
  const mutationAudit = sampleMutation.applied ? validateProgramAdjustmentAudit(buildProgramAdjustmentAudit({
    adjustmentType: adaptationDecision.action,
    reasonCode: adaptationDecision.reasonCode,
    reasonText: adaptationDecision.reasonText,
    ruleKeys: mergeDecisionAndMutationRuleKeys(adaptationDecision, sampleMutation),
    beforeState: sampleExercise,
    afterState: sampleMutation.exercise,
    decisionConfidence: adaptationDecision.confidence,
  })) : { valid: false, errors: [sampleMutation.reasonCode || "MUTATION_FAILED"] };
  const prescriptionMutationReady = sampleMutation.applied && sampleMutation.exercise?.sets?.[0]?.minReps === 9 && mutationAudit.valid;
  const ok = framework.valid && adaptationEvidence.valid && adjustmentAudit.valid && observedPatternAuditReady && adaptationPolicyReady && prescriptionMutationReady;
  const payload = {
    ok,
    scienceVersion: framework.scienceVersion,
    adaptationScienceVersion: ADAPTATION_SCIENCE_VERSION,
    scientificAuditVersion: SCIENTIFIC_AUDIT_VERSION,
    sourceCount: framework.sourceCount,
    claimCount: framework.claimCount,
    ruleBindingCount: framework.ruleBindingCount,
    adaptationSourceCount: adaptationEvidence.sourceCount,
    adaptationClaimCount: adaptationEvidence.claimCount,
    adaptationRuleBindingCount: adaptationEvidence.ruleBindingCount,
    adjustmentAuditReady: adjustmentAudit.valid,
    observedPatternAuditReady,
    adaptationPolicyReady,
    prescriptionMutationReady,
  };
  if (!ok) return res.status(500).json({
    ...payload,
    error: "SCIENTIFIC_FRAMEWORK_INVALID",
    issues: [...framework.errors, ...adaptationEvidence.errors, ...adjustmentAudit.errors, ...observedPatternAudit.errors, ...adaptationAudit.errors, ...mutationAudit.errors],
  });
  return res.status(200).json(payload);
}
