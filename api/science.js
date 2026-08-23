import { RULES } from "../lib/programming-engine.mjs";
import { validateScientificFramework } from "../lib/scientific-framework.mjs";
import { validateAdaptationEvidence } from "../lib/adaptation-evidence.mjs";
import { buildProgramAdjustmentAudit, validateProgramAdjustmentAudit } from "../lib/adaptation-audit.mjs";
import { buildAdaptationAudit, decideExerciseAdaptation } from "../lib/adaptation-policy.mjs";

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
  const ok = framework.valid && adaptationEvidence.valid && adjustmentAudit.valid && adaptationPolicyReady;
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
  };
  if (!ok) return res.status(500).json({
    ...payload,
    error: "SCIENTIFIC_FRAMEWORK_INVALID",
    issues: [...framework.errors, ...adaptationEvidence.errors, ...adjustmentAudit.errors, ...adaptationAudit.errors],
  });
  return res.status(200).json(payload);
}
