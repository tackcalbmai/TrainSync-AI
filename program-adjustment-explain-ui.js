import { listProgramAdjustments, listPrograms } from "./lib/program-client.js";
import { explainProgramAdjustment } from "./lib/adaptation-explanation.mjs";

const list = document.querySelector("#adjustmentList");
const count = document.querySelector("#adjustmentCount");
let adjustments = [];
let rendering = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char]));
}
function dateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { day:"numeric", month:"short", year:"numeric" }).format(date);
}
function auditDetails(model) {
  const meta = [
    model.scienceVersion ? `SCIENCE ${model.scienceVersion}` : null,
    model.reasonCode ? model.reasonCode.replaceAll("_", " ") : null,
    model.rules.length ? `${model.rules.length} RULE${model.rules.length === 1 ? "" : "S"}` : null,
    model.claims.length ? `${model.claims.length} CLAIM${model.claims.length === 1 ? "" : "S"}` : null,
  ].filter(Boolean).join(" · ");
  return `<details class="adjustment-audit"><summary>SCIENTIFIC AUDIT</summary>${model.reasonText ? `<p>${escapeHtml(model.reasonText)}</p>` : ""}${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</details>`;
}
function card(item) {
  const model = explainProgramAdjustment(item);
  const confidence = model.confidencePct == null ? "CONFIDENCE NOT SCORED" : `${model.confidencePct}% DECISION CONFIDENCE`;
  const meta = [confidence, `${model.evidenceLevel.toUpperCase()} EVIDENCE`, dateLabel(model.createdAt)].filter(Boolean).join(" · ");
  return `<article class="adjustment adjustment-explained">
    <div class="adjustment-head"><strong>${escapeHtml(model.title)}</strong><span>WHY THIS CHANGED</span></div>
    <p>${escapeHtml(model.why)}</p>
    <div class="adjustment-change">${escapeHtml(model.change)}</div>
    <small>${escapeHtml(meta)}</small>
    ${auditDetails(model)}
  </article>`;
}
function render() {
  if (!list || !count) return;
  rendering = true;
  count.textContent = `${adjustments.length} CHANGE${adjustments.length === 1 ? "" : "S"}`;
  list.innerHTML = adjustments.length
    ? adjustments.slice(0, 8).map(card).join("")
    : '<div class="empty-program">No adaptations yet. The program changes after real performance data, not because a calendar page turned.</div>';
  queueMicrotask(() => { rendering = false; });
}
async function refresh() {
  if (!list || !count) return;
  const programs = await listPrograms(20);
  const program = programs.find((item) => item.status === "active") || programs.find((item) => item.status === "draft") || programs[0] || null;
  adjustments = program ? await listProgramAdjustments(program.id, 100).catch(() => []) : [];
  render();
}

if (list) {
  const observer = new MutationObserver(() => {
    if (!rendering && adjustments.length) render();
  });
  observer.observe(list, { childList:true });
}

refresh().catch(() => {});
