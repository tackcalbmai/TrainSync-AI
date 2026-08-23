import { RULES } from "../lib/programming-engine.mjs";
import { validateScientificFramework } from "../lib/scientific-framework.mjs";
import { ADAPTATION_SCIENCE_VERSION, validateAdaptationEvidence } from "../lib/adaptation-evidence.mjs";
import { buildProgramAdjustmentAudit, SCIENTIFIC_AUDIT_VERSION, validateProgramAdjustmentAudit } from "../lib/adaptation-audit.mjs";
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
  const fatigueAdjustment = buildProgramAdjustmentAudit({
    adjustmentType: "reduce_or_review",
    reasonCode: "REPEATED_FATIGUE_SIGNAL",
    reasonText: "Verify fatigue-volume adaptation remains evidence-informed without overstating the exact threshold.",
    ruleKeys: ["reduceAfterRepeatedFatigue"],
    decisionConfidence: 0.78,
  });
  const fatigueAudit = validateProgramAdjustmentAudit(fatigueAdjustment);
  const fatigueAuditReady = fatigueAudit.valid
    && fatigueAdjustment.evidence_level === "heuristic"
    && fatigueAdjustment.evidence_claim_ids.includes("volume_is_a_plausible_fatigue_management_lever");
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
  const ok = framework.valid && adaptationEvidence.valid && adjustmentAudit.valid && fatigueAuditReady && adaptationPolicyReady && prescriptionMutationReady;
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
    fatigueAuditReady,
    adaptationPolicyReady,
    prescriptionMutationReady,
  };
  if (!ok) return res.status(500).json({
    ...payload,
    error: "SCIENTIFIC_FRAMEWORK_INVALID",
    issues: [...framework.errors, ...adaptationEvidence.errors, ...adjustmentAudit.errors, ...fatigueAudit.errors, ...adaptationAudit.errors, ...mutationAudit.errors],
  });
  return res.status(200).json(payload);
}
