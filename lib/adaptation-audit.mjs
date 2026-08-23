import {
  CLAIMS,
  EVIDENCE_LEVELS,
  RULE_EVIDENCE_BINDINGS,
  SCIENCE_VERSION,
} from "./scientific-framework.mjs";
import {
  ADAPTATION_CLAIMS,
  ADAPTATION_RULE_BINDINGS,
  ADAPTATION_SCIENCE_VERSION,
} from "./adaptation-evidence.mjs";

const LEVEL_RANK = Object.freeze({ high: 3, moderate: 2, emerging: 1, heuristic: 0 });
const SOURCES = new Set(["deterministic", "ai_assisted", "manual"]);
const ALL_BINDINGS = Object.freeze({ ...RULE_EVIDENCE_BINDINGS, ...ADAPTATION_RULE_BINDINGS });
const ALL_CLAIMS = Object.freeze({ ...CLAIMS, ...ADAPTATION_CLAIMS });

function uniq(values = []) { return [...new Set(values.filter(Boolean))]; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function boundedConfidence(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error("decision confidence must be between 0 and 1");
  return Math.round(n * 1000) / 1000;
}

export function derivedEvidence(ruleKeys = []) {
  const keys = uniq(ruleKeys);
  if (!keys.length) return { level: "heuristic", ruleKeys: [], claimIds: [] };
  const bindings = keys.map((ruleKey) => {
    const binding = ALL_BINDINGS[ruleKey];
    if (!binding) throw new Error(`Unknown scientific rule key: ${ruleKey}`);
    return { ruleKey, binding };
  });
  const claimIds = uniq(bindings.flatMap(({ binding }) => binding.claimIds || []));
  for (const claimId of claimIds) if (!ALL_CLAIMS[claimId]) throw new Error(`Scientific claim is not registered: ${claimId}`);
  const level = bindings.reduce((weakest, { binding }) => LEVEL_RANK[binding.level] < LEVEL_RANK[weakest] ? binding.level : weakest, "high");
  return { level, ruleKeys: keys, claimIds };
}

export function buildProgramAdjustmentAudit({
  adjustmentType,
  reasonCode,
  reasonText,
  ruleKeys = [],
  beforeState = {},
  afterState = {},
  metricsSnapshot = {},
  decisionConfidence = null,
  decisionSource = "deterministic",
} = {}) {
  if (SCIENCE_VERSION !== ADAPTATION_SCIENCE_VERSION) throw new Error("Scientific framework versions are out of sync");
  if (!String(adjustmentType || "").trim()) throw new Error("adjustmentType is required");
  if (!String(reasonCode || "").trim()) throw new Error("reasonCode is required");
  if (!String(reasonText || "").trim()) throw new Error("reasonText is required");
  if (!SOURCES.has(decisionSource)) throw new Error(`Unsupported decisionSource: ${decisionSource}`);
  const evidence = derivedEvidence(ruleKeys);
  return {
    adjustment_type: String(adjustmentType).trim(),
    reason_code: String(reasonCode).trim(),
    reason_text: String(reasonText).trim(),
    evidence_level: evidence.level,
    before_state: object(beforeState),
    after_state: object(afterState),
    science_version: SCIENCE_VERSION,
    evidence_claim_ids: evidence.claimIds,
    evidence_rule_keys: evidence.ruleKeys,
    decision_confidence: boundedConfidence(decisionConfidence),
    metrics_snapshot: object(metricsSnapshot),
    decision_source: decisionSource,
  };
}

export function validateProgramAdjustmentAudit(row = {}) {
  const errors = [];
  if (SCIENCE_VERSION !== ADAPTATION_SCIENCE_VERSION) errors.push("scientific framework versions are out of sync");
  if (!String(row.adjustment_type || "").trim()) errors.push("adjustment_type missing");
  if (!String(row.reason_code || "").trim()) errors.push("reason_code missing");
  if (!String(row.reason_text || "").trim()) errors.push("reason_text missing");
  if (!EVIDENCE_LEVELS.includes(row.evidence_level)) errors.push("invalid evidence_level");
  if (row.science_version !== SCIENCE_VERSION) errors.push("science_version is not current");
  if (!SOURCES.has(row.decision_source)) errors.push("invalid decision_source");
  try {
    const derived = derivedEvidence(Array.isArray(row.evidence_rule_keys) ? row.evidence_rule_keys : []);
    if (derived.level !== row.evidence_level) errors.push("evidence_level does not match registered rules");
    if (JSON.stringify(derived.claimIds.sort()) !== JSON.stringify([...(row.evidence_claim_ids || [])].sort())) errors.push("evidence_claim_ids do not match registered rules");
  } catch (error) { errors.push(error.message); }
  const confidence = row.decision_confidence;
  if (confidence != null && (!Number.isFinite(Number(confidence)) || Number(confidence) < 0 || Number(confidence) > 1)) errors.push("decision_confidence out of range");
  return { valid: errors.length === 0, errors };
}
