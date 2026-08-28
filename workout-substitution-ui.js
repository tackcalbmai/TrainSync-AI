import { getProfile, getSession } from "./lib/supabase-client.js";
import { currentLiveSet, substitutePendingExercise } from "./lib/live-workout-state.mjs";
import { exerciseSubstitutionCandidates } from "./lib/exercise-substitution.mjs";

const ACTIVE_KEY = "trainsync:live-workout:v1";
const $ = (selector) => document.querySelector(selector);
let profile = null;
let state = null;
let candidates = [];

function readState() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null"); } catch { return null; }
}
function writeState(value) { localStorage.setItem(ACTIVE_KEY, JSON.stringify(value)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char])); }
function showToast(message, success = false) {
  const toast = $("#toast"); if (!toast) return;
  toast.textContent = message; toast.className = `toast show${success ? " success" : ""}`;
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { toast.className = "toast"; }, 3600);
}
async function api(payload) {
  const session = getSession();
  if (!session?.access_token) throw new Error("SIGN_IN_REQUIRED");
  const response = await fetch("/api/adapt-session", { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${session.access_token}` }, body:JSON.stringify(payload) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.message || data?.error || "Substitution request failed."), { data });
  return data;
}
function injectUi() {
  const current = $(".current-exercise");
  if (current && !$("#replaceExercise")) {
    const button = document.createElement("button");
    button.id = "replaceExercise"; button.className = "substitute-button"; button.type = "button"; button.textContent = "REPLACE EXERCISE";
    current.appendChild(button);
    button.addEventListener("click", openSubstitution);
  }
  if (!$("#substitutionOverlay")) {
    document.body.insertAdjacentHTML("beforeend", `<div class="substitution-overlay" id="substitutionOverlay" hidden><div class="substitution-card"><button class="substitution-close" id="substitutionClose" type="button">×</button><div class="eyebrow"><span></span> EXERCISE SUBSTITUTE</div><h2 id="substitutionTitle">Replace exercise</h2><p id="substitutionIntro">Choose the closest useful replacement available in your equipment profile.</p><label class="substitution-reason">WHY ARE YOU REPLACING IT?<select id="substitutionReason"><option value="equipment_busy">Equipment is busy</option><option value="equipment_unavailable">Equipment unavailable</option><option value="preference">Prefer another exercise today</option><option value="temporary_substitution">Temporary substitution</option></select></label><div id="substitutionList" class="substitution-list"></div><div class="substitution-rule">TrainSync preserves set count, rep/time target, RIR and rest only when the movement is compatible. Prescribed load is never copied between exercises. The original planned exercise remains recorded separately from what you actually performed.</div></div></div>`);
    $("#substitutionClose").addEventListener("click", closeSubstitution);
    $("#substitutionOverlay").addEventListener("click", (event) => { if (event.target.id === "substitutionOverlay") closeSubstitution(); });
  }
}
function substitutionBadge() {
  state = readState();
  const item = currentLiveSet(state);
  const old = $("#substitutionBadge"); if (old) old.remove();
  if (!item?.substitution) return;
  const heading = $("#exerciseName");
  if (!heading) return;
  const badge = document.createElement("div");
  badge.id = "substitutionBadge"; badge.className = "substitution-badge";
  badge.innerHTML = `SUBSTITUTED <small>planned ${escapeHtml(item.plannedExerciseName || item.plannedExerciseKey)}</small>`;
  heading.insertAdjacentElement("afterend", badge);
}
function renderCandidates() {
  const list = $("#substitutionList");
  if (!candidates.length) { list.innerHTML = '<div class="substitution-empty">No sufficiently compatible replacement is available with the equipment in your profile. TrainSync will not invent a weak match just to fill the list.</div>'; return; }
  list.innerHTML = candidates.map((item) => {
    const reasons = (item.reasons || []).join(" · ");
    const warning = (item.warnings || []).length ? `<small>Trade-offs: ${escapeHtml(item.warnings.map((x) => x.replaceAll("_"," ")).join(" · "))}</small>` : "";
    return `<button class="substitution-option" type="button" data-key="${escapeHtml(item.exerciseKey)}"><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(reasons)}</p>${warning}</div><div class="substitution-score"><b>${item.score}</b><span>${escapeHtml(String(item.tier || "match").toUpperCase())}</span></div></button>`;
  }).join("");
  for (const button of list.querySelectorAll(".substitution-option")) button.addEventListener("click", () => chooseSubstitution(button.dataset.key, button));
}
async function openSubstitution() {
  state = readState();
  const item = currentLiveSet(state);
  if (!item) return showToast("No pending set to replace.");
  profile ||= await getProfile().catch(() => null);
  $("#substitutionTitle").textContent = `Replace ${item.exerciseName}`;
  $("#substitutionList").innerHTML = '<div class="substitution-empty">Checking compatible movements…</div>';
  $("#substitutionOverlay").hidden = false;
  try {
    if (state.workout?.programSessionId) {
      const result = await api({ action:"substitution_candidates", programSessionId:state.workout.programSessionId, exerciseOrder:item.exerciseOrder, exerciseKey:item.plannedExerciseKey || item.exerciseKey });
      candidates = result.candidates || [];
    } else {
      candidates = exerciseSubstitutionCandidates(item.plannedExerciseKey || item.exerciseKey, { equipment:Array.isArray(profile?.equipment) ? profile.equipment : [], limit:8 });
    }
    renderCandidates();
  } catch (error) {
    $("#substitutionList").innerHTML = `<div class="substitution-empty">${escapeHtml(error.message)}</div>`;
  }
}
function closeSubstitution() { const overlay=$("#substitutionOverlay"); if(overlay) overlay.hidden=true; }
async function chooseSubstitution(key, button) {
  state = readState();
  const item = currentLiveSet(state);
  if (!item) return;
  const candidate = candidates.find((entry) => entry.exerciseKey === key);
  if (!candidate) return;
  for (const el of $("#substitutionList").querySelectorAll("button")) el.disabled = true;
  button.textContent = "APPLYING…";
  try {
    let replacement = candidate;
    let assessment = candidate;
    let approvalId = null;
    const reason = $("#substitutionReason").value;
    if (state.workout?.programSessionId) {
      const result = await api({ action:"approve_substitution", programSessionId:state.workout.programSessionId, exerciseOrder:item.exerciseOrder, exerciseKey:item.plannedExerciseKey || item.exerciseKey, replacementExerciseKey:key, reason });
      replacement = result.replacement;
      assessment = result.assessment;
      approvalId = result.approval?.approvalId || null;
    }
    const next = substitutePendingExercise(state, { exerciseOrder:item.exerciseOrder, replacement, assessment, approvalId, reason });
    writeState(next);
    closeSubstitution();
    showToast(`${replacement.name} selected. Load reset intentionally.`, true);
    setTimeout(() => location.reload(), 220);
  } catch (error) {
    showToast(error.data?.reasonCode || error.message);
    renderCandidates();
  }
}

async function init() {
  injectUi();
  profile = await getProfile().catch(() => null);
  substitutionBadge();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
