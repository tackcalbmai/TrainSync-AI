import {
  completeWorkoutSession,
  currentUser,
  getProfile,
  getSession,
  listSetResults,
  listWorkoutSessions,
  listWorkouts,
  savePublication,
  saveWorkout,
  signIn,
  signUp,
  updateWorkoutStatus,
} from "./lib/supabase-client.js";
import { summarizeProgress } from "./lib/progress.mjs";
import { validateWorkout } from "./lib/workout.mjs";
import { completeProgramWorkout, loadNextActiveProgramWorkout } from "./lib/train-program-bridge.js";

const $ = (selector) => document.querySelector(selector);
const commandInput = $("#commandInput");
const generateButton = $("#generateButton");
const publishButton = $("#publishButton");
const logSessionButton = $("#logSessionButton");
const processStrip = $("#processStrip");
const toast = $("#toast");
const KG_TO_LB = 2.2046226218;
let currentWorkout = null;
let currentWorkoutDbId = null;
let currentProfile = null;
let deferredInstall = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function dateLabel(iso) {
  const date = new Date(`${iso}T12:00:00`);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(date, today)) return "Today";
  if (same(date, tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short" }).format(date);
}
function showToast(message, success = false) {
  toast.textContent = message;
  toast.className = `toast show${success ? " success" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = "toast"; }, 3600);
}
function isImperial() { return currentProfile?.units === "imperial"; }
function displayWeight(kg) {
  const amount = Number(kg);
  if (!Number.isFinite(amount)) return null;
  const converted = isImperial() ? amount * KG_TO_LB : amount;
  return { value: converted, label: isImperial() ? "LB" : "KG" };
}
function inputLoadFromKg(kg) {
  const display = displayWeight(kg);
  if (!display) return "";
  return String(Math.round(display.value * 2) / 2);
}
function inputLoadToKg(value) {
  if (value === "" || value == null) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round((isImperial() ? amount / KG_TO_LB : amount) * 100) / 100;
}
function metricType(set) { return set?.metricType === "duration_seconds" ? "duration_seconds" : "reps"; }
function rangeLabel(min, max, exact, unit = "") {
  const exactNumber = numberOrNull(exact);
  const minNumber = numberOrNull(min);
  const maxNumber = numberOrNull(max);
  const base = exactNumber != null ? String(exactNumber) : minNumber != null && maxNumber != null && minNumber !== maxNumber ? `${minNumber}–${maxNumber}` : String(minNumber ?? maxNumber ?? "—");
  return unit ? `${base} ${unit}` : base;
}
function plannedSetLabel(set) {
  const timed = metricType(set) === "duration_seconds";
  const target = timed
    ? rangeLabel(set.minDurationSeconds, set.maxDurationSeconds, set.targetDurationSeconds, "sec")
    : `${rangeLabel(set.minReps, set.maxReps, set.targetReps)} reps`;
  const weight = set.weightKg == null ? null : displayWeight(set.weightKg);
  const load = weight ? ` @ ${Number(weight.value.toFixed(1))} ${weight.label}` : "";
  const rir = set.targetRir == null ? "" : ` · ${set.targetRir} RIR`;
  return `${target}${load}${rir}`;
}
function defaultActual(set) {
  return metricType(set) === "duration_seconds"
    ? (set.targetDurationSeconds ?? set.minDurationSeconds ?? set.maxDurationSeconds ?? "")
    : (set.targetReps ?? set.minReps ?? set.maxReps ?? "");
}

function setAuthUi() {
  const user = currentUser();
  const button = $("#accountButton");
  const sync = $("#cloudSyncState");
  if (user) {
    button.textContent = "ACCOUNT";
    button.classList.add("signed-in");
    sync.textContent = "Cloud sync on";
  } else {
    button.textContent = "SIGN IN";
    button.classList.remove("signed-in");
    sync.textContent = "Sign in to sync";
  }
}

function renderWorkout(workout, validation = validateWorkout(workout)) {
  currentWorkout = workout;
  $("#workoutTitle").textContent = workout.title;
  $("#workoutDate").textContent = dateLabel(workout.scheduledDate);
  $("#workoutIntensity").textContent = String(workout.intensity || "program").toUpperCase();
  $("#durationMetric").textContent = workout.estimatedDurationMinutes;
  $("#exerciseMetric").textContent = workout.exercises.length;
  $("#setMetric").textContent = workout.totalSets;
  const validationState = $("#validationState");
  validationState.className = `validation-state${validation.valid ? "" : " error"}`;
  validationState.innerHTML = validation.valid ? `<span>✓</span> ${workout.programSessionId ? "PROGRAM SESSION READY" : "WORKOUT VALID"}` : `<span>!</span> ${validation.errors.length} VALIDATION ERRORS`;
  publishButton.disabled = !validation.valid;
  const completed = workout.status === "completed";
  logSessionButton.disabled = completed || !validation.valid;
  logSessionButton.textContent = completed ? "SESSION LOGGED" : "LOG SESSION";

  $("#exerciseList").innerHTML = workout.exercises.map((item, index) => {
    const sets = item.sets.length;
    const first = item.sets[0] || {};
    const target = metricType(first) === "duration_seconds"
      ? rangeLabel(first.minDurationSeconds, first.maxDurationSeconds, first.targetDurationSeconds, "SEC")
      : rangeLabel(first.minReps, first.maxReps, first.targetReps);
    const display = first.weightKg != null ? displayWeight(first.weightKg) : null;
    const rir = first.targetRir == null ? "" : ` · ${first.targetRir} RIR`;
    const load = display ? `${sets} × ${target} @ ${Number(display.value.toFixed(1))} ${display.label}${rir}` : `${sets} × ${target}${rir}`;
    const rest = first.restSec ?? 0;
    const metricLabel = metricType(first) === "duration_seconds" ? "SETS × TIME" : "SETS × REPS";
    return `<div class="exercise-item">
      <div class="exercise-index">${String(index + 1).padStart(2, "0")}</div>
      <div class="exercise-name"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.group || item.role || "strength")}</small></div>
      <div class="exercise-load"><strong>${escapeHtml(load)}</strong><small>${display ? `${metricLabel} · LOAD` : metricLabel}</small></div>
      <div class="exercise-rest"><strong>${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, "0")}</strong><small>REST</small></div>
    </div>`;
  }).join("");
}

async function api(path, payload, { anonymous = false } = {}) {
  const session = getSession();
  const headers = { "Content-Type": "application/json" };
  if (!anonymous && session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const response = await fetch(path, { method:"POST", headers, body:JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || data.error || "Request failed"), { data });
  return data;
}

async function loadProfileContext() {
  if (!currentUser()) { currentProfile = null; return null; }
  try { currentProfile = await getProfile(); return currentProfile; }
  catch { currentProfile = null; return null; }
}

async function loadProgramWorkout() {
  if (!currentUser()) return false;
  try {
    const result = await loadNextActiveProgramWorkout({ timezone:currentProfile?.timezone || "Europe/Riga" });
    if (!result?.workout) return false;
    currentWorkoutDbId = result.workoutDbId;
    renderWorkout(result.workout, result.validation);
    localStorage.setItem("trainsync:lastWorkout", JSON.stringify(result.workout));
    $("#cloudSyncState").textContent = "Active program synced";
    return true;
  } catch (error) {
    showToast(error.message === "ACTIVE_PROGRAM_SESSION_INVALID" ? "Active program session needs review before training." : `Program: ${error.message}`);
    return false;
  }
}

async function persistWorkout(workout) {
  if (!getSession()) return null;
  if (workout?.programSessionId) throw new Error("PROGRAM_WORKOUT_MUST_BE_MATERIALIZED");
  try {
    const row = await saveWorkout(workout);
    currentWorkoutDbId = row?.id || currentWorkoutDbId;
    $("#cloudSyncState").textContent = "Synced to cloud";
    return row;
  } catch (error) {
    $("#cloudSyncState").textContent = "Cloud sync failed";
    showToast(`Cloud sync: ${error.message}`);
    return null;
  }
}

async function buildWorkout({ demo = false } = {}) {
  const intent = commandInput.value.trim();
  if (!intent) return showToast("Describe the workout first.");
  if (!demo && !getSession()) { showToast("Sign in to use AI workout generation."); openAuth("signin"); return; }

  generateButton.disabled = true;
  processStrip.classList.add("active");
  const states = demo ? ["LOADING DEMO ENGINE…", "BUILDING SAMPLE WORKOUT…", "VALIDATING WORKOUT…"] : ["UNDERSTANDING YOUR REQUEST…", "AI PROGRAMMING SETS / REPS / REST…", "VALIDATING WORKOUT…"];
  let idx = 0;
  processStrip.textContent = states[idx];
  const pulse = setInterval(() => { idx = Math.min(idx + 1, states.length - 1); processStrip.textContent = states[idx]; }, 420);

  try {
    const timezone = currentProfile?.timezone || "Europe/Riga";
    const result = await api("/api/generate", { intent, timezone, demo }, { anonymous: demo });
    currentWorkoutDbId = null;
    renderWorkout(result.workout, result.validation);
    localStorage.setItem("trainsync:lastWorkout", JSON.stringify(result.workout));
    if (!demo) await persistWorkout(result.workout);
    processStrip.textContent = demo ? "DEMO WORKOUT READY ✓" : "AI WORKOUT READY ✓";
    showToast(demo ? "Demo loaded. Sign in to generate with AI." : `${result.workout.title} programmed by AI.`, true);
    if (!demo) await refreshHistory();
  } catch (error) {
    processStrip.textContent = "BUILD FAILED";
    showToast(error.message);
  } finally {
    clearInterval(pulse);
    generateButton.disabled = false;
    setTimeout(() => processStrip.classList.remove("active"), 1500);
  }
}

async function publishWorkout() {
  if (!currentWorkout) return;
  publishButton.disabled = true;
  processStrip.classList.add("active");
  const states = ["RESOLVING GARMIN EXERCISES…", "VALIDATING WORKOUT STEPS…", "PUBLISHING TO MOCK PROVIDER…"];
  for (const state of states) { processStrip.textContent = state; await new Promise((resolve) => setTimeout(resolve, 300)); }
  try {
    if (getSession() && !currentWorkoutDbId) await persistWorkout(currentWorkout);
    const result = await api("/api/publish", { workout:currentWorkout });
    currentWorkout = { ...currentWorkout, status:"published" };
    $("#lastPublish").textContent = "just now";
    processStrip.textContent = `MOCK PUBLISHED · ${result.providerResourceId}`;
    localStorage.setItem("trainsync:lastWorkout", JSON.stringify(currentWorkout));
    if (getSession() && currentWorkoutDbId) {
      await updateWorkoutStatus(currentWorkoutDbId, "published", currentWorkout);
      await savePublication({ workoutDbId:currentWorkoutDbId, workout:currentWorkout, result });
    }
    showToast("Mock publish recorded. No Garmin account was changed.", true);
  } catch (error) {
    processStrip.textContent = "PUBLISH FAILED";
    showToast(error.message);
  } finally {
    publishButton.disabled = false;
    setTimeout(() => processStrip.classList.remove("active"), 1700);
  }
}

function localDatetimeValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function openLogSession() {
  if (!currentUser()) { showToast("Sign in to save completed sessions."); openAuth("signin"); return; }
  if (!currentWorkout) return showToast("Build or load a workout first.");
  if (currentWorkout.status === "completed") return showToast("This workout is already logged as completed.");
  if (!currentProfile) await loadProfileContext();

  $("#logTitle").textContent = currentWorkout.title;
  $("#logDuration").value = currentWorkout.estimatedDurationMinutes || 50;
  $("#logFinishedAt").value = localDatetimeValue();
  $("#logNotes").value = "";
  const unit = isImperial() ? "LB" : "KG";

  $("#logExerciseList").innerHTML = currentWorkout.exercises.map((exercise, exerciseIndex) => {
    const timed = metricType(exercise.sets[0]) === "duration_seconds";
    const rows = exercise.sets.map((set, setIndex) => {
      const target = plannedSetLabel(set);
      const actualLabel = timed ? "Actual seconds" : "Actual reps";
      return `<div class="log-set-row"
        data-exercise-name="${escapeHtml(exercise.name)}" data-exercise-key="${escapeHtml(exercise.exerciseKey || "")}" data-exercise-order="${exerciseIndex + 1}" data-set-index="${setIndex + 1}"
        data-metric-type="${escapeHtml(metricType(set))}" data-target-reps="${escapeHtml(set.targetReps ?? "")}" data-target-min-reps="${escapeHtml(set.minReps ?? "")}" data-target-max-reps="${escapeHtml(set.maxReps ?? "")}"
        data-target-duration="${escapeHtml(set.targetDurationSeconds ?? "")}" data-target-min-duration="${escapeHtml(set.minDurationSeconds ?? "")}" data-target-max-duration="${escapeHtml(set.maxDurationSeconds ?? "")}"
        data-target-rir="${escapeHtml(set.targetRir ?? "")}" data-target-weight-kg="${escapeHtml(set.weightKg ?? "")}">
        <label class="log-set-check"><input class="log-set-done" type="checkbox" checked aria-label="Include set ${setIndex + 1}"><span>${setIndex + 1}</span></label>
        <span><strong>${escapeHtml(target)}</strong><br>PLAN</span>
        <input class="log-actual" type="number" min="1" max="${timed ? 3600 : 500}" step="1" value="${escapeHtml(defaultActual(set))}" aria-label="${actualLabel} for ${escapeHtml(exercise.name)} set ${setIndex + 1}">
        <input class="log-weight" type="number" min="0" step="0.5" value="${escapeHtml(inputLoadFromKg(set.weightKg))}" placeholder="${unit}" aria-label="Actual load in ${unit}">
        <input class="log-rpe" type="number" min="1" max="10" step="0.5" placeholder="RPE" aria-label="RPE for set ${setIndex + 1}">
      </div>`;
    }).join("");
    return `<section class="log-exercise"><div class="log-exercise-head"><strong>${escapeHtml(exercise.name)}</strong><span>${escapeHtml(exercise.group || exercise.role || "strength")}</span></div><div class="log-set-header"><span>SET</span><span>PLANNED</span><span>${timed ? "ACTUAL SEC" : "ACTUAL REPS"}</span><span>LOAD · ${unit}</span><span>RPE</span></div>${rows}</section>`;
  }).join("");

  $("#logModal").hidden = false;
  document.body.classList.add("modal-open");
}
function closeLogSession() { $("#logModal").hidden = true; document.body.classList.remove("modal-open"); }

function completedSetFromRow(row) {
  const type = row.dataset.metricType === "duration_seconds" ? "duration_seconds" : "reps";
  const actual = Number(row.querySelector(".log-actual")?.value);
  return {
    exerciseName:row.dataset.exerciseName,
    exerciseKey:row.dataset.exerciseKey || null,
    exerciseOrder:Number(row.dataset.exerciseOrder),
    setIndex:Number(row.dataset.setIndex),
    metricType:type,
    targetReps:numberOrNull(row.dataset.targetReps),
    targetMinReps:numberOrNull(row.dataset.targetMinReps),
    targetMaxReps:numberOrNull(row.dataset.targetMaxReps),
    targetDurationSeconds:numberOrNull(row.dataset.targetDuration),
    targetMinDurationSeconds:numberOrNull(row.dataset.targetMinDuration),
    targetMaxDurationSeconds:numberOrNull(row.dataset.targetMaxDuration),
    targetRir:numberOrNull(row.dataset.targetRir),
    targetWeightKg:numberOrNull(row.dataset.targetWeightKg),
    reps:type === "reps" ? actual : null,
    durationSeconds:type === "duration_seconds" ? actual : null,
    weightKg:inputLoadToKg(row.querySelector(".log-weight")?.value),
    rpe:row.querySelector(".log-rpe")?.value || null,
    isWarmup:false,
  };
}

async function submitLogSession(event) {
  event.preventDefault();
  if (!currentWorkout || !currentUser()) return;
  const saveButton = $("#logSave");
  saveButton.disabled = true;
  saveButton.textContent = "SAVING…";

  try {
    const sets = [...document.querySelectorAll("#logExerciseList .log-set-row")]
      .filter((row) => row.querySelector(".log-set-done")?.checked)
      .map(completedSetFromRow)
      .filter((set) => set.metricType === "duration_seconds" ? set.durationSeconds > 0 : set.reps > 0);
    if (!sets.length) throw new Error("Keep at least one completed set checked.");

    const durationMinutes = Math.max(1, Number($("#logDuration").value) || currentWorkout.estimatedDurationMinutes || 50);
    const finished = new Date($("#logFinishedAt").value);
    if (Number.isNaN(finished.getTime())) throw new Error("Choose a valid completion time.");
    const started = new Date(finished.getTime() - durationMinutes * 60 * 1000);
    const completionArgs = {
      workoutDbId:currentWorkoutDbId,
      workout:currentWorkout,
      actualSets:sets,
      sets,
      startedAt:started.toISOString(),
      completedAt:finished.toISOString(),
      durationSeconds:Math.round(durationMinutes * 60),
      notes:$("#logNotes").value,
    };

    let completion;
    if (currentWorkout.programSessionId) {
      if (!currentWorkoutDbId) throw new Error("PROGRAM_WORKOUT_NOT_MATERIALIZED");
      completion = await completeProgramWorkout(completionArgs);
    } else {
      if (!currentWorkoutDbId) await persistWorkout(currentWorkout);
      completion = await completeWorkoutSession(completionArgs);
    }

    currentWorkout = { ...currentWorkout, status:"completed" };
    localStorage.setItem("trainsync:lastWorkout", JSON.stringify(currentWorkout));
    renderWorkout(currentWorkout);
    closeLogSession();
    await Promise.all([refreshHistory(), refreshOverview()]);

    if (completion?.adaptation?.status === "error") showToast("Session saved. Automatic program adaptation needs review.");
    else if (["applied","partial"].includes(completion?.adaptation?.status)) showToast("Completed session saved. Next prescription adapted ✓", true);
    else showToast("Completed session saved. Progress updated ✓", true);
  } catch (error) {
    showToast(error.message || "Could not save completed session.");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "SAVE COMPLETED SESSION ↗";
  }
}

function openAuth(mode = "signin") {
  const modal = $("#authModal");
  modal.hidden = false;
  document.body.classList.add("modal-open");
  $("#authMode").textContent = mode === "signup" ? "CREATE ACCOUNT" : "SIGN IN";
  $("#authSubmit").textContent = mode === "signup" ? "CREATE ACCOUNT" : "SIGN IN";
  $("#authSwitch").textContent = mode === "signup" ? "Already have an account? Sign in" : "New here? Create account";
  modal.dataset.mode = mode;
  setTimeout(() => $("#authEmail").focus(), 30);
}
function closeAuth() { $("#authModal").hidden = true; document.body.classList.remove("modal-open"); }

async function submitAuth(event) {
  event.preventDefault();
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const submit = $("#authSubmit");
  if (!email || password.length < 6) return showToast("Use a valid email and at least 6 characters.");
  submit.disabled = true;
  try {
    const result = $("#authModal").dataset.mode === "signup" ? await signUp(email, password) : await signIn(email, password);
    if (!result?.access_token) { showToast("Account created. Check your email if confirmation is required.", true); return; }
    setAuthUi();
    closeAuth();
    await loadProfileContext();
    const programLoaded = await loadProgramWorkout();
    if (!programLoaded && currentWorkout && !currentWorkout.programSessionId) {
      renderWorkout(currentWorkout);
      await persistWorkout(currentWorkout);
    }
    await Promise.all([refreshHistory(), refreshOverview()]);
    showToast(programLoaded ? "Cloud sync connected. Active program loaded ✓" : "Cloud sync connected. AI generation unlocked ✓", true);
  } catch (error) {
    showToast(error.message);
  } finally { submit.disabled = false; }
}

async function accountAction() { if (!currentUser()) return openAuth("signin"); location.href = "/profile"; }

function renderHistory(rows) {
  const list = $("#historyList");
  const visible = (rows || []).filter((row) => row.status !== "archived");
  if (!visible.length) { list.innerHTML = '<div class="history-empty">No synced workouts yet.</div>'; return; }
  list.innerHTML = visible.slice(0, 5).map((row) => `<button class="history-item" data-db-id="${escapeHtml(row.id)}" data-client-id="${escapeHtml(row.client_workout_id)}">
    <span><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.scheduled_date || "Unscheduled")}</small></span>
    <em>${escapeHtml(row.status.toUpperCase())}</em>
  </button>`).join("");
  for (const button of list.querySelectorAll(".history-item")) {
    button.addEventListener("click", () => {
      const row = visible.find((item) => item.id === button.dataset.dbId);
      if (!row?.payload) return;
      currentWorkoutDbId = row.id;
      renderWorkout(row.payload);
      localStorage.setItem("trainsync:lastWorkout", JSON.stringify(row.payload));
      showToast("Workout loaded.", true);
      window.scrollTo({ top:document.querySelector(".dashboard-grid")?.offsetTop || 0, behavior:"smooth" });
    });
  }
}

function renderWeek(rows) {
  const list = $("#weekList");
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() - day);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
  const weekly = (rows || []).filter((row) => row.status !== "archived" && row.scheduled_date).filter((row) => {
    const date = new Date(`${row.scheduled_date}T12:00:00`);
    return date >= monday && date <= sunday;
  }).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  $("#weekSessionCount").textContent = `${weekly.length} SESSIONS`;
  if (!weekly.length) { list.innerHTML = '<div class="history-empty">No scheduled sessions this week.</div>'; return; }
  const nextIndex = weekly.findIndex((row) => row.status !== "completed" && new Date(`${row.scheduled_date}T23:59:59`) >= now);
  list.innerHTML = weekly.slice(0, 5).map((row, index) => {
    const date = new Date(`${row.scheduled_date}T12:00:00`);
    const dayLabel = new Intl.DateTimeFormat("en", { weekday:"short" }).format(date).toUpperCase();
    const done = row.status === "completed";
    const next = index === nextIndex;
    const state = done ? "DONE" : next ? "NEXT" : row.status === "published" ? "READY" : "PLANNED";
    return `<div class="week-row${next ? " active" : ""}"><span>${escapeHtml(dayLabel)}</span><strong>${escapeHtml(row.title.toUpperCase())}</strong><em class="${done ? "done" : ""}">${escapeHtml(state)}</em></div>`;
  }).join("");
}

async function refreshHistory() {
  if (!currentUser()) { renderHistory([]); renderWeek([]); return; }
  try { const rows = await listWorkouts(30); renderHistory(rows); renderWeek(rows); }
  catch (error) { showToast(`Saved workouts: ${error.message}`); }
}
function resetOverview() {
  $("#strengthTrendValue").textContent = "—";
  $("#strengthTrendValue").style.color = "";
  $("#strengthTrendLabel").textContent = currentUser() ? "complete a session" : "sign in to track";
  $("#strengthSpark").innerHTML = Array.from({ length:8 }, () => '<i style="--h:3%"></i>').join("");
}
async function refreshOverview() {
  if (!currentUser()) return resetOverview();
  try {
    const [sessions, sets] = await Promise.all([listWorkoutSessions(250), listSetResults(5000)]);
    const summary = summarizeProgress(sessions, sets);
    const trend = summary.trendPct;
    $("#strengthTrendValue").textContent = trend == null ? "—" : `${trend > 0 ? "+" : ""}${trend.toFixed(1)}%`;
    $("#strengthTrendValue").style.color = trend > 0 ? "var(--accent)" : trend < 0 ? "var(--danger)" : "";
    $("#strengthTrendLabel").textContent = !summary.hasData ? "complete a session" : trend == null ? "building 4-week baseline" : "training volume";
    const max = Math.max(1, ...summary.weeklyVolume.map((week) => Number(week.volumeKg) || 0));
    $("#strengthSpark").innerHTML = summary.weeklyVolume.map((week) => {
      const volume = Number(week.volumeKg) || 0;
      const height = Math.max(volume > 0 ? 8 : 3, Math.round((volume / max) * 100));
      return `<i style="--h:${height}%" title="${escapeHtml(Math.round(volume))} kg"></i>`;
    }).join("");
  } catch { resetOverview(); }
}

for (const chip of document.querySelectorAll("[data-command]")) chip.addEventListener("click", () => { commandInput.value = chip.dataset.command; commandInput.focus(); });
generateButton.addEventListener("click", () => buildWorkout());
publishButton.addEventListener("click", publishWorkout);
logSessionButton.addEventListener("click", openLogSession);
commandInput.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") buildWorkout(); });
$("#accountButton").addEventListener("click", accountAction);
$("#authClose").addEventListener("click", closeAuth);
$("#authForm").addEventListener("submit", submitAuth);
$("#authSwitch").addEventListener("click", () => openAuth($("#authModal").dataset.mode === "signup" ? "signin" : "signup"));
$("#authModal").addEventListener("click", (event) => { if (event.target.id === "authModal") closeAuth(); });
$("#logClose").addEventListener("click", closeLogSession);
$("#logCancel").addEventListener("click", closeLogSession);
$("#logForm").addEventListener("submit", submitLogSession);
$("#logModal").addEventListener("click", (event) => { if (event.target.id === "logModal") closeLogSession(); });

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault(); deferredInstall = event;
  const button = $("#installButton"); button.hidden = false;
  button.addEventListener("click", async () => { await deferredInstall.prompt(); deferredInstall = null; button.hidden = true; }, { once:true });
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

async function initialize() {
  setAuthUi();
  let programLoaded = false;
  if (currentUser()) {
    await loadProfileContext();
    programLoaded = await loadProgramWorkout();
  }
  if (!programLoaded) {
    const stored = localStorage.getItem("trainsync:lastWorkout");
    if (stored) {
      try { const workout = JSON.parse(stored); renderWorkout(workout); }
      catch { await buildWorkout({ demo:true }); }
    } else await buildWorkout({ demo:true });
  }
  await Promise.all([refreshHistory(), refreshOverview()]);
}

initialize();
