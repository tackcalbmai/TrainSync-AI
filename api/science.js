import { RULES } from "../lib/programming-engine.mjs";
import { validateScientificFramework } from "../lib/scientific-framework.mjs";
import { validateAdaptationEvidence } from "../lib/adaptation-evidence.mjs";
import { buildProgramAdjustmentAudit, validateProgramAdjustmentAudit } from "../lib/adaptation-audit.mjs";
import { buildAdaptationAudit, decideExerciseAdaptation } from "../lib/adaptation-policy.mjs";
import { applyAdaptationDecision, mergeDecisionAndMutationRuleKeys } from "../lib/prescription-mutation.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
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
  const ok = framework.valid && adaptationEvidence.valid && adjustmentAudit.valid && adaptationPolicyReady && prescriptionMutationReady;
  const payload = {
    ok,
    scienceVersion: framework.scienceVersion,
    sourceCount: framework.sourceCount,
    claimCount: framework.claimCount,
    ruleBindingCount: framework.ruleBindingCount,
    adaptationSourceCount: adaptationEvidence.sourceCount,
    adaptationClaimCount: adaptationEvidence.claimCount,
    adaptationRuleBindingCount: adaptationEvidence.ruleBindingCount,
    adjustmentAuditReady: adjustmentAudit.valid,
    adaptationPolicyReady,
    prescriptionMutationReady,
  };
  if (!ok) return res.status(500).json({
    ...payload,
    error: "SCIENTIFIC_FRAMEWORK_INVALID",
    issues: [...framework.errors, ...adaptationEvidence.errors, ...adjustmentAudit.errors, ...adaptationAudit.errors, ...mutationAudit.errors],
  });
  return res.status(200).json(payload);
}
