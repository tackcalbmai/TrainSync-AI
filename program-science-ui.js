import { currentUser } from "./lib/supabase-client.js";
import { listProgramAdjustments, listPrograms } from "./lib/program-client.js";
import { CLAIMS, SOURCES } from "./lib/scientific-framework.mjs";
import { ADAPTATION_CLAIMS, ADAPTATION_SOURCES } from "./lib/adaptation-evidence.mjs";

const ALL_CLAIMS = { ...CLAIMS, ...ADAPTATION_CLAIMS };
const ALL_SOURCES = { ...SOURCES, ...ADAPTATION_SOURCES };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char]));
}
function titleCase(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
function evidenceLabel(item) {
  const claims = Array.isArray(item?.evidence_claim_ids) ? item.evidence_claim_ids : [];
  if (item?.evidence_level === "heuristic") return claims.length ? "EVIDENCE-INFORMED HEURISTIC" : "PRODUCT HEURISTIC";
  return `${String(item?.evidence_level || "unknown").toUpperCase()} EVIDENCE`;
}
function sourceList(claimIds = []) {
  const ids = new Set();
  for (const claimId of claimIds) {
    const claim = ALL_CLAIMS[claimId];
    for (const sourceId of claim?.sourceIds || []) ids.add(sourceId);
  }
  return [...ids].map((id) => ({ id, ...ALL_SOURCES[id] })).filter((item) => item.title);
}
function confidenceLabel(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}% DECISION CONFIDENCE` : "CONFIDENCE NOT SCORED";
}
function traceMarkup(item) {
  const claimIds = Array.isArray(item.evidence_claim_ids) ? item.evidence_claim_ids : [];
  const ruleKeys = Array.isArray(item.evidence_rule_keys) ? item.evidence_rule_keys : [];
  const sources = sourceList(claimIds);
  const claims = claimIds.map((id) => ALL_CLAIMS[id]).filter(Boolean);
  const sourceMarkup = sources.length
    ? sources.slice(0, 5).map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(String(source.year || ""))} · ${escapeHtml(source.type || "source")}</small></a>`).join("")
    : '<div class="science-empty">No external evidence claim is attached to this exact rule. It is a product guardrail.</div>';
  const claimMarkup = claims.length
    ? claims.map((claim) => `<li>${escapeHtml(claim.statement)}</li>`).join("")
    : '<li>This exact implementation is intentionally classified as a product heuristic.</li>';
  return `<div class="science-trace-main">
    <div class="science-trace-badges"><span>${escapeHtml(evidenceLabel(item))}</span><span>${escapeHtml(confidenceLabel(item.decision_confidence))}</span></div>
    <strong>${escapeHtml(titleCase(item.adjustment_type))}</strong>
    <p>${escapeHtml(item.reason_text)}</p>
    <details class="science-trace-details">
      <summary>WHY THIS CHANGED</summary>
      <dl>
        <div><dt>Decision source</dt><dd>${escapeHtml(titleCase(item.decision_source || "deterministic"))}</dd></div>
        <div><dt>Science contract</dt><dd>${escapeHtml(item.science_version || "legacy")}</dd></div>
        <div><dt>Rule</dt><dd>${escapeHtml(ruleKeys.length ? ruleKeys.map(titleCase).join(" · ") : "Unbound / manual")}</dd></div>
      </dl>
      <div class="science-trace-claims"><b>WHAT THE EVIDENCE ACTUALLY SUPPORTS</b><ul>${claimMarkup}</ul></div>
      <div class="science-trace-sources"><b>SOURCES</b>${sourceMarkup}</div>
    </details>
  </div>`;
}

async function loadScienceTrace() {
  const side = document.querySelector(".program-side");
  if (!side || !currentUser()) return;
  try {
    const programs = await listPrograms(20);
    const program = programs.find((item) => item.status === "active") || programs.find((item) => item.status === "draft") || programs[0];
    if (!program) return;
    const adjustments = await listProgramAdjustments(program.id, 20);
    const latest = adjustments?.[0];
    if (!latest) return;
    let card = document.querySelector("#scienceTraceCard");
    if (!card) {
      card = document.createElement("article");
      card.id = "scienceTraceCard";
      card.className = "side-program-card science-trace-card";
      const philosophy = side.querySelector(".philosophy-card");
      side.insertBefore(card, philosophy || null);
    }
    card.innerHTML = `<div class="mini-head"><span>SCIENCE TRACE</span><span>LATEST CHANGE</span></div>${traceMarkup(latest)}`;
  } catch {
    // Science trace is explanatory UI only; it must never block the Program workspace.
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(loadScienceTrace, 250));
else setTimeout(loadScienceTrace, 250);
