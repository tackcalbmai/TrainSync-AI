import { currentUser, getProfile, getSession } from "./lib/supabase-client.js";
import {
  activateProgram,
  listProgramAdjustments,
  listProgramSessions,
  listPrograms,
  saveGeneratedProgram,
} from "./lib/program-client.js";
import { validateProgram } from "./lib/programming-engine.mjs";

const $ = (selector) => document.querySelector(selector);
const toast = $("#toast");
let currentProgram = null;
let currentSessions = [];
let currentValidation = null;
let currentAdjustments = [];
let weekIndex = 1;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
function showToast(message, success = false) {
  toast.textContent = message;
  toast.className = `toast show${success ? " success" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = "toast"; }, 3600);
}
function isoLocal(date) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function nextMonday() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const delta = ((8 - (d.getDay() || 7)) % 7) || 7;
  d.setDate(d.getDate() + delta);
  return isoLocal(d);
}
function selectedDays() {
  return [...document.querySelectorAll('#dayGrid input:checked')].map((input) => Number(input.value)).sort((a,b) => a-b);
}
function selectedPriorityMuscles() {
  return [...document.querySelectorAll('#priorityMuscleGrid input:checked')].map((input) => input.value);
}
function titleCase(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function apiGenerate(payload) {
  const session = getSession();
  if (!session?.access_token) throw new Error("SIGN_IN_REQUIRED");
  const response = await fetch("/api/program-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Program generation failed.");
    error.data = data;
    throw error;
  }
  return data;
}

function dbProgramForValidation(program) {
  return {
    title: program.title,
    goal: program.goal,
    duration_weeks: program.duration_weeks,
    days_per_week: program.days_per_week,
    default_session_minutes: program.default_session_minutes,
    priority: program.priority || {},
  };
}

function renderValidation() {
  const box = $("#programValidation");
  if (!currentValidation) { box.textContent = ""; box.className = "validation-banner"; return; }
  if (!currentValidation.valid) {
    box.className = "validation-banner warn";
    box.textContent = `${currentValidation.errors.length} validation error(s). This program should not be activated.`;
    return;
  }
  const unique = [...new Map((currentValidation.warnings || []).map((item) => [item.code, item])).values()];
  if (!unique.length) {
    box.className = "validation-banner good";
    box.textContent = "✓ STRUCTURE VALID · deterministic dose, rest, effort and priority checks passed";
  } else {
    box.className = "validation-banner warn";
    box.textContent = `VALID WITH ${unique.length} EVIDENCE / HEURISTIC WARNING${unique.length === 1 ? "" : "S"} · ${unique.slice(0, 3).map((x) => x.code.replaceAll("_", " ")).join(" · ")}`;
  }
}

function renderDose() {
  const summary = currentValidation?.weekSummaries?.find((item) => item.week === weekIndex);
  const dose = summary?.dose?.muscles?.fractional || {};
  const entries = Object.entries(dose).filter(([, value]) => Number(value) > 0).sort((a,b) => b[1] - a[1]).slice(0, 12);
  if (!entries.length) {
    $("#muscleDose").innerHTML = '<div class="empty-program">No mapped muscle dose for this week.</div>';
    return;
  }
  const max = Math.max(...entries.map(([, value]) => Number(value)), 1);
  $("#muscleDose").innerHTML = entries.map(([muscle, value]) => `<div class="dose-row"><span>${escapeHtml(muscle.replaceAll("_", " "))}</span><div class="dose-track"><i style="--w:${Math.max(4, Math.round(Number(value) / max * 100))}%"></i></div><b>${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}</b></div>`).join("");
}

function renderAdjustments() {
  $("#adjustmentCount").textContent = `${currentAdjustments.length} CHANGE${currentAdjustments.length === 1 ? "" : "S"}`;
  if (!currentAdjustments.length) {
    $("#adjustmentList").innerHTML = '<div class="empty-program">No adaptations yet. The program changes after real performance data, not because a calendar page turned.</div>';
    return;
  }
  $("#adjustmentList").innerHTML = currentAdjustments.slice(0, 8).map((item) => `<div class="adjustment"><strong>${escapeHtml(titleCase(item.adjustment_type))}</strong><p>${escapeHtml(item.reason_text)}</p><small>${escapeHtml(item.evidence_level)} evidence · ${new Date(item.created_at).toLocaleDateString()}</small></div>`).join("");
}

function prescription(exercise) {
  const first = exercise?.sets?.[0] || {};
  const count = exercise?.sets?.length || 0;
  const metric = first.metricType || exercise?.setMetric || "reps";
  if (metric === "duration_seconds") {
    const min = first.minDurationSeconds ?? first.targetDurationSeconds ?? "—";
    const max = first.maxDurationSeconds ?? first.targetDurationSeconds ?? min;
    const target = min === max ? `${min}s` : `${min}–${max}s`;
    return { count, target, rir: "—", rest: first.restSec ?? 0, metric };
  }
  const min = first.minReps ?? first.targetReps ?? "—";
  const max = first.maxReps ?? first.targetReps ?? min;
  const target = min === max ? String(min) : `${min}–${max}`;
  return { count, target, rir: first.targetRir ?? "—", rest: first.restSec ?? 0, metric };
}

function renderWeek() {
  const duration = Number(currentProgram?.duration_weeks || currentProgram?.durationWeeks || 1);
  weekIndex = Math.max(1, Math.min(duration, weekIndex));
  $("#weekTitle").textContent = `Week ${weekIndex}`;
  $("#weekCounter").textContent = `${weekIndex} / ${duration}`;
  $("#prevWeek").disabled = weekIndex <= 1;
  $("#nextWeek").disabled = weekIndex >= duration;
  const sessions = currentSessions.filter((item) => Number(item.week_index ?? item.weekIndex) === weekIndex).sort((a,b) => Number(a.day_index ?? a.dayIndex) - Number(b.day_index ?? b.dayIndex));
  if (!sessions.length) {
    $("#programSessions").innerHTML = '<div class="empty-program">No sessions scheduled for this week.</div>';
    renderDose();
    return;
  }
  $("#programSessions").innerHTML = sessions.map((session) => {
    const payload = session.payload || {};
    const exercises = payload.exercises || [];
    const date = session.scheduled_date ?? session.scheduledDate;
    const dateLabel = date ? new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : `DAY ${session.day_index ?? session.dayIndex}`;
    return `<section class="program-session"><div class="program-session-head"><div><strong>${escapeHtml(session.title)}</strong><small>${escapeHtml(payload.focus || "")}</small></div><div class="session-meta"><b>${escapeHtml(dateLabel.toUpperCase())}</b><small>${escapeHtml(payload.estimatedDurationMinutes || currentProgram.default_session_minutes || "—")} MIN · ${escapeHtml(String(session.status || "planned").toUpperCase())}</small></div></div>${exercises.map((exercise, index) => {
      const rx = prescription(exercise);
      return `<div class="program-exercise"><span>${String(index + 1).padStart(2,"0")}</span><div><strong>${escapeHtml(exercise.name)}${exercise.supersetGroup ? `<small class="superset-tag">PAIR ${escapeHtml(exercise.supersetGroup)}</small>` : ""}</strong><small>${escapeHtml(titleCase(exercise.role))} · ${escapeHtml((exercise.primaryMuscles || []).join(", "))}</small></div><div class="exercise-prescription"><b>${rx.count} × ${escapeHtml(rx.target)}</b><small>${Math.round(rx.rest / 60)}:${String(rx.rest % 60).padStart(2,"0")} REST</small></div><div class="exercise-rir"><b>${escapeHtml(rx.rir)}</b><small>${rx.metric === "duration_seconds" ? "TIMED" : "RIR"}</small></div></div>`;
    }).join("")}</section>`;
  }).join("");
  renderDose();
}

function renderProgram() {
  if (!currentProgram) { $("#programWorkspace").hidden = true; return; }
  $("#programWorkspace").hidden = false;
  const settings = currentProgram.settings || {};
  $("#programTitle").textContent = currentProgram.title;
  $("#programSummary").textContent = settings.summary || currentProgram.summary || "Adaptive evidence-constrained training program.";
  $("#metricWeeks").textContent = currentProgram.duration_weeks ?? currentProgram.durationWeeks;
  $("#metricDays").textContent = currentProgram.days_per_week ?? currentProgram.daysPerWeek;
  $("#metricStrategy").textContent = titleCase(currentProgram.progression_strategy ?? currentProgram.progressionStrategy).replace("Progression", "");
  $("#metricEvidence").textContent = currentProgram.evidence_version ?? currentProgram.evidenceVersion ?? "2026.08";
  const status = currentProgram.status || "draft";
  $("#programStatus").textContent = status.toUpperCase();
  $("#programStatus").className = `program-state${status === "active" ? " active" : ""}`;
  $("#activateProgram").hidden = status === "active";
  weekIndex = Math.min(weekIndex, Number(currentProgram.duration_weeks ?? currentProgram.durationWeeks ?? 1));
  renderValidation();
  renderWeek();
  renderAdjustments();
}

async function loadExisting() {
  const programs = await listPrograms(20);
  currentProgram = programs.find((item) => item.status === "active") || programs.find((item) => item.status === "draft") || programs[0] || null;
  if (!currentProgram) { renderProgram(); return; }
  [currentSessions, currentAdjustments] = await Promise.all([
    listProgramSessions(currentProgram.id),
    listProgramAdjustments(currentProgram.id).catch(() => []),
  ]);
  currentValidation = validateProgram(dbProgramForValidation(currentProgram), currentSessions);
  renderProgram();
}

$("#programForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const days = selectedDays();
  if (!days.length) return showToast("Choose at least one training day.");
  const button = $("#buildProgram");
  button.disabled = true;
  button.innerHTML = "PROGRAMMING…";
  $("#builderState").textContent = "ANALYZING";
  try {
    const result = await apiGenerate({
      goal: $("#programGoal").value,
      durationWeeks: Number($("#programWeeks").value),
      availableDays: days,
      sessionMinutes: Number($("#sessionMinutes").value),
      weekStart: $("#weekStart").value,
      priority: $("#programPriority").value.trim(),
      priorityMuscles: selectedPriorityMuscles(),
      timeEfficient: $("#timeEfficient").checked,
    });
    const saved = await saveGeneratedProgram(result.program);
    currentProgram = { ...saved, settings: saved.settings || result.program.settings, summary: result.program.summary };
    currentSessions = result.program.sessions.map((item) => ({ week_index: item.weekIndex, day_index: item.dayIndex, slot_index: item.slotIndex, scheduled_date: item.scheduledDate, title: item.title, status: item.status, payload: item.payload, rationale: item.rationale }));
    currentValidation = result.validation;
    currentAdjustments = [];
    weekIndex = 1;
    $("#builderState").textContent = "DRAFT CREATED";
    $("#builderState").classList.add("ready");
    renderProgram();
    $("#programWorkspace").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Program built and deterministically validated ✓", true);
  } catch (error) {
    $("#builderState").textContent = "BUILD FAILED";
    showToast(error.message);
    console.error(error.data || error);
  } finally {
    button.disabled = false;
    button.innerHTML = "BUILD PROGRAM <b>↗</b>";
  }
});

$("#activateProgram").addEventListener("click", async () => {
  if (!currentProgram?.id) return;
  if (!currentValidation?.valid) return showToast("Program must pass validation before activation.");
  const button = $("#activateProgram");
  button.disabled = true;
  button.textContent = "ACTIVATING…";
  try {
    const active = await activateProgram(currentProgram.id);
    currentProgram = { ...currentProgram, ...(active || {}), status: "active" };
    renderProgram();
    showToast("Program activated. Future sessions can now adapt to results. ✓", true);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "ACTIVATE PROGRAM";
  }
});

$("#prevWeek").addEventListener("click", () => { weekIndex -= 1; renderWeek(); });
$("#nextWeek").addEventListener("click", () => { weekIndex += 1; renderWeek(); });

async function init() {
  if (!currentUser()) { location.replace("/"); return; }
  $("#weekStart").value = nextMonday();
  try {
    const athlete = await getProfile();
    if (athlete?.goal) $("#programGoal").value = athlete.goal;
    if (athlete?.default_workout_minutes) $("#sessionMinutes").value = athlete.default_workout_minutes;
  } catch {}
  try { await loadExisting(); } catch (error) { showToast(error.message); }
}

init();
