import { RULES } from "../lib/programming-engine.mjs";
import { validateScientificFramework } from "../lib/scientific-framework.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  const audit = validateScientificFramework(RULES);
  const payload = {
    ok: audit.valid,
    scienceVersion: audit.scienceVersion,
    sourceCount: audit.sourceCount,
    claimCount: audit.claimCount,
    ruleBindingCount: audit.ruleBindingCount,
  };
  if (!audit.valid) return res.status(500).json({ ...payload, error: "SCIENTIFIC_FRAMEWORK_INVALID", issues: audit.errors });
  return res.status(200).json(payload);
}
