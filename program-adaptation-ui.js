import { listAdaptationRequests, listPrograms, resolveAdaptationInput } from "./lib/program-client.js";

const $ = (selector) => document.querySelector(selector);
const card = $("#adaptationNeedsCard");
const list = $("#adaptationNeedsList");
const count = $("#adaptationNeedCount");
const toast = $("#toast");
let pendingRequests = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char]));
}
function titleCase(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
function showToast(message, success = false) {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show${success ? " success" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = "toast"; }, 4000);
}
function parseLoads(value) {
  return [...new Set(String(value || "").split(/[;,\s]+/).map(Number).filter((number) => Number.isFinite(number) && number > 0))].sort((a,b) => a-b);
}
function currentLoadHint(request) {
  const current = Number(request?.payload?.currentLoadKg);
  const candidate = Number(request?.payload?.candidateLoadKg);
  if (Number.isFinite(candidate) && candidate > 0 && Number.isFinite(current) && current > 0) return `Current ${current} kg · next observed candidate ${candidate} kg`;
  if (Number.isFinite(current) && current > 0) return `Current ${current} kg`;
  return "Enter the loads you can actually select for this exercise.";
}
function render() {
  if (!card || !list || !count) return;
  card.hidden = pendingRequests.length === 0;
  count.textContent = `${pendingRequests.length} OPEN`;
  if (!pendingRequests.length) { list.innerHTML = ""; return; }
  list.innerHTML = pendingRequests.map((request) => {
    const exercise = titleCase(request.exercise_key);
    const message = request.payload?.message || "TrainSync needs one equipment detail before it can safely change this prescription.";
    return `<form class="adaptation-request" data-request-id="${escapeHtml(request.id)}">
      <div class="adaptation-request-head"><strong>${escapeHtml(exercise)}</strong><span>LOAD OPTIONS</span></div>
      <p>${escapeHtml(message)}</p>
      <small>${escapeHtml(currentLoadHint(request))}</small>
      <div class="adaptation-input-row">
        <input name="loads" inputmode="decimal" autocomplete="off" placeholder="e.g. 50, 52.5, 55" aria-label="Available loads in kilograms for ${escapeHtml(exercise)}" />
        <button type="submit">SAVE & APPLY</button>
      </div>
      <em>KG · only for this exercise</em>
    </form>`;
  }).join("");
}

async function refresh() {
  const programs = await listPrograms(20);
  const program = programs.find((item) => item.status === "active") || programs.find((item) => item.status === "draft") || programs[0] || null;
  pendingRequests = program ? await listAdaptationRequests(program.id, "pending").catch(() => []) : [];
  render();
}

list?.addEventListener("submit", async (event) => {
  const form = event.target.closest(".adaptation-request");
  if (!form) return;
  event.preventDefault();
  const loads = parseLoads(new FormData(form).get("loads"));
  if (!loads.length) return showToast("Enter at least one real available weight in kg.");
  const button = form.querySelector("button");
  button.disabled = true;
  button.textContent = "CHECKING…";
  try {
    const result = await resolveAdaptationInput(form.dataset.requestId, loads);
    const status = result?.adaptation?.status;
    if (status === "applied" || status === "partial") {
      showToast("Load options saved. Next prescription updated ✓", true);
      setTimeout(() => location.reload(), 500);
      return;
    }
    await refresh();
    if (status === "needs_input") showToast("Saved. TrainSync still needs one detail before changing the prescription.");
    else if (status === "no_change") showToast("Saved. Current prescription remains the better choice.", true);
    else showToast("Load options saved. No unsafe change was applied.", true);
  } catch (error) {
    showToast(error.message || "Could not save load options.");
  } finally {
    button.disabled = false;
    button.textContent = "SAVE & APPLY";
  }
});

refresh().catch(() => { if (card) card.hidden = true; });
