import { currentUser, getProfile, listSetResults, listWorkoutSessions } from "./lib/supabase-client.js";
import { epleyE1rmKg, summarizeProgress } from "./lib/progress.mjs";

const $ = (selector) => document.querySelector(selector);
const KG_TO_LB = 2.2046226218;
let units = "metric";
function escapeHtml(value) { return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char])); }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.className = "toast show"; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { toast.className = "toast"; }, 3400); }
function dateLabel(value) { if (!value) return "—"; return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "2-digit" }).format(new Date(value)); }
function durationLabel(seconds) { const total = Math.max(0, Number(seconds) || 0), hours = Math.floor(total / 3600), minutes = Math.round((total % 3600) / 60); return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
function displayWeight(kg, { volume = false } = {}) { const amount = Number(kg); if (!Number.isFinite(amount) || amount <= 0) return "—"; const converted = units === "imperial" ? amount * KG_TO_LB : amount, suffix = units === "imperial" ? "lb" : "kg"; if (volume && converted >= 1000) return `${(converted / 1000).toFixed(converted >= 10000 ? 0 : 1)}k ${suffix}`; return `${converted.toFixed(converted >= 100 ? 0 : 1)} ${suffix}`; }
function groupSessionSets(sets) { const map = new Map(); for (const set of sets) { if (!map.has(set.session_id)) map.set(set.session_id, []); map.get(set.session_id).push(set); } return map; }
function groupExercises(sets) { const map = new Map(); for (const set of [...sets].sort((a, b) => a.exercise_order - b.exercise_order || a.set_index - b.set_index)) { const key = `${set.exercise_order}:${set.exercise_key}`; if (!map.has(key)) map.set(key, { name: set.exercise_name, order: set.exercise_order, sets: [] }); map.get(key).sets.push(set); } return [...map.values()].sort((a, b) => a.order - b.order); }
function buildBestMap(allSets) { const map = new Map(); for (const set of allSets) { const e1rm = epleyE1rmKg(set.weight_kg, set.reps); if (e1rm != null) map.set(set.exercise_key, Math.max(map.get(set.exercise_key) || 0, e1rm)); } return map; }
function isTimed(set) { return set.metric_type === "duration_seconds" || (set.reps == null && Number(set.duration_seconds) > 0); }
function setLabel(set) {
  if (isTimed(set)) return `${Math.round(Number(set.duration_seconds) || 0)} sec`;
  const weight = Number(set.weight_kg);
  return weight > 0 ? `${set.reps} × ${displayWeight(weight)}` : `${set.reps} reps`;
}

function renderSessions(sessions, allSets) {
  const list = $("#sessionList"), setsBySession = groupSessionSets(allSets), bestByExercise = buildBestMap(allSets);
  $("#sessionCount").textContent = `${sessions.filter((row) => row.status === "completed").length} SESSIONS`;
  const completed = sessions.filter((row) => row.status === "completed");
  if (!completed.length) { list.innerHTML = `<div class="empty-panel"><strong>No completed sessions yet.</strong><p>Build a workout, log the sets you actually performed, and your real training history will start here.</p><a href="/">LOG FIRST SESSION</a></div>`; return; }
  list.innerHTML = completed.map((session) => {
    const sessionSets = setsBySession.get(session.id) || [], exercises = groupExercises(sessionSets);
    const detail = exercises.map((exercise) => {
      const chips = exercise.sets.map((set) => {
        const timed = isTimed(set), weight = Number(set.weight_kg), e1rm = timed ? null : epleyE1rmKg(weight, set.reps);
        const isPr = e1rm != null && Math.abs(e1rm - (bestByExercise.get(set.exercise_key) || 0)) < 0.05;
        const rpe = !timed && set.rpe != null ? ` · RPE ${Number(set.rpe).toFixed(Number(set.rpe) % 1 ? 1 : 0)}` : "";
        return `<span class="set-chip${isPr ? " pr" : ""}"><b>${escapeHtml(setLabel(set))}</b>${escapeHtml(rpe)}${isPr ? " · PR" : ""}</span>`;
      }).join("");
      return `<div class="detail-exercise"><div class="detail-exercise-head"><strong>${escapeHtml(exercise.name)}</strong><span>${exercise.sets.length} SETS</span></div><div class="detail-sets">${chips}</div></div>`;
    }).join("");
    return `<div class="session-row"><button class="session-toggle" type="button" aria-expanded="false"><span class="session-date"><strong>${escapeHtml(dateLabel(session.completed_at))}</strong><small>${escapeHtml(new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(session.completed_at)))}</small></span><span class="session-main"><strong>${escapeHtml(session.title)}</strong><small>${exercises.length} exercises</small></span><span class="session-metric volume"><strong>${escapeHtml(displayWeight(session.total_volume_kg, { volume: true }))}</strong><small>VOLUME</small></span><span class="session-metric sets"><strong>${escapeHtml(session.total_sets)}</strong><small>SETS</small></span><span class="session-metric duration"><strong>${escapeHtml(durationLabel(session.duration_seconds))}</strong><small>TIME</small></span><span class="session-chevron">›</span></button><div class="session-detail">${detail || '<div class="history-empty">No set detail recorded.</div>'}</div></div>`;
  }).join("");
  for (const row of list.querySelectorAll(".session-row")) { const button = row.querySelector(".session-toggle"); button.addEventListener("click", () => { const open = row.classList.toggle("open"); button.setAttribute("aria-expanded", String(open)); }); }
}

function renderBestLifts(summary) {
  const list = $("#bestLiftList");
  const best = summary.exercises.filter((row) => row.bestE1rmKg || row.bestWeightKg || row.bestDurationSeconds).slice(0, 6);
  if (!best.length) { list.innerHTML = '<div class="history-empty">Completed set data will create strength and timed records here.</div>'; return; }
  list.innerHTML = best.map((row) => {
    const value = row.bestE1rmKg || row.bestWeightKg;
    const text = value ? displayWeight(value) : `${row.bestDurationSeconds}s`;
    const label = row.bestE1rmKg ? "e1RM" : row.bestWeightKg ? "BEST LOAD" : "BEST HOLD";
    return `<div class="pr-row"><div><strong>${escapeHtml(row.name)}</strong><small>${row.sets} logged sets</small></div><div class="pr-value">${escapeHtml(text)}<small>${label}</small></div></div>`;
  }).join("");
}

async function load() {
  if (!currentUser()) { location.replace("/"); return; }
  try {
    const [profile, sessions, sets] = await Promise.all([getProfile(), listWorkoutSessions(250), listSetResults(5000)]);
    units = profile?.units === "imperial" ? "imperial" : "metric";
    const summary = summarizeProgress(sessions, sets);
    $("#sessions30").textContent = summary.sessions30;
    $("#volume30").textContent = displayWeight(summary.volume30Kg, { volume: true }).replace(/\s(?:kg|lb)$/i, "");
    $("#volumeUnit").textContent = `${units === "imperial" ? "lb" : "kg"} moved`;
    $("#sets30").textContent = summary.workSets30;
    $("#time30").textContent = durationLabel(summary.duration30Seconds);
    $("#historyState").textContent = summary.hasData ? "LIVE DATA" : "READY TO LOG";
    $("#historyState").classList.add("ready");
    renderSessions(sessions, sets); renderBestLifts(summary);
  } catch (error) { $("#historyState").textContent = "SYNC ERROR"; showToast(error.message || "Could not load training history."); }
}
load();
