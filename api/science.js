import { RULES } from "../lib/programming-engine.mjs";
import { validateScientificFramework } from "../lib/scientific-framework.mjs";
import { buildProgramAdjustmentAudit, validateProgramAdjustmentAudit } from "../lib/adaptation-audit.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  const framework = validateScientificFramework(RULES);
  const sampleAdjustment = buildProgramAdjustmentAudit({
    adjustmentType: "health_check",
    reasonCode: "SCIENTIFIC_AUDIT",
    reasonText: "Verify evidence-derived adjustment provenance.",
    ruleKeys: ["competingSuperset"],
    decisionConfidence: 0.8,
  });
  const adjustmentAudit = validateProgramAdjustmentAudit(sampleAdjustment);
  const ok = framework.valid && adjustmentAudit.valid;
  const payload = {
    ok,
    scienceVersion: framework.scienceVersion,
    sourceCount: framework.sourceCount,
    claimCount: framework.claimCount,
    ruleBindingCount: framework.ruleBindingCount,
    adjustmentAuditReady: adjustmentAudit.valid,
  };
  if (!ok) return res.status(500).json({ ...payload, error: "SCIENTIFIC_FRAMEWORK_INVALID", issues: [...framework.errors, ...adjustmentAudit.errors] });
  return res.status(200).json(payload);
}
