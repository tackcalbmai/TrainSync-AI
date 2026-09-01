import {
  completeWorkoutSession,
  createCompletionId,
  currentUser,
  getProfile,
  listSetResults,
} from "./lib/supabase-client.js";
import { completeProgramWorkout } from "./lib/train-program-bridge.js";
import {
  adjustLiveRest,
  completeCurrentLiveSet,
  completedActualSets,
  createLiveWorkoutState,
  currentLiveSet,
  finishLiveWorkoutState,
  liveRestRemainingSeconds,
  liveWorkoutElapsedSeconds,
  liveWorkoutProgress,
  skipCurrentLiveSet,
  skipLiveRest,
  updateCompletedLiveSet,
} from "./lib/live-workout-state.mjs";

const ACTIVE_KEY = "trainsync:live-workout:v1";
const LAUNCH_KEY = "trainsync:live-workout-launch:v1";
const KG_TO_LB = 2.2046226218;
const $ = (selector) => document.querySelector(selector);
let state = null;
let profile = null;
let history = [];
let editingQueueIndex = null;
let restAlertedFor = null;

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function saveState(next = state) {
  state = next;
  if (state) writeJson(ACTIVE_KEY, state);
}
function clearLaunch() { localStorage.removeItem(LAUNCH_KEY); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char]));
}
function showToast(message, success = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast show${success ? " success" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = "toast"; }, 3600);
}
function isImperial() { return profile?.units === "imperial"; }
function displayWeight(kg) {
  const n = Number(kg);
  if (!Number.isFinite(n)) return null;
  return isImperial() ? n * KG_TO_LB : n;
}
function inputWeightFromKg(kg) {
  const n = displayWeight(kg);
  return n == null ? "" : String(Math.round(n * 2) / 2);
}
function inputWeightToKg(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round((isImperial() ? n / KG_TO_LB : n) * 100) / 100;
}
function unitLabel() { return isImperial() ? "LB" : "KG"; }
function fmtTime(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
}
function targetLabel(item) {
  if (item.metricType === "duration_seconds") {
    if (item.targetDurationSeconds) return `${item.targetDurationSeconds} sec`;
    if (item.targetMinDurationSeconds && item.targetMaxDurationSeconds && item.targetMinDurationSeconds !== item.targetMaxDurationSeconds) return `${item.targetMinDurationSeconds}–${item.targetMaxDurationSeconds} sec`;
    return `${item.targetMinDurationSeconds || item.targetMaxDurationSeconds || "—"} sec`;
  }
  if (item.targetReps) return `${item.targetReps} reps`;
  if (item.targetMinReps && item.targetMaxReps && item.targetMinReps !== item.targetMaxReps) return `${item.targetMinReps}–${item.targetMaxReps} reps`;
  return `${item.targetMinReps || item.targetMaxReps || "—"} reps`;
}
function sameWorkout(a, b) {
  if (!a || !b) return false;
  if (a.programSessionId && b.programSessionId) return a.programSessionId === b.programSessionId;
  return a.id && b.id ? a.id === b.id : a.title === b.title && a.scheduledDate === b.scheduledDate;
}
function defaultMetric(item) {
  if (item.metricType === "duration_seconds") return item.targetDurationSeconds ?? item.targetMinDurationSeconds ?? "";
  return "";
}
function previousCompletedIndex() {
  if (!state?.queue?.length) return -1;
  const cursor = Number.isInteger(state.cursor) ? state.cursor : state.queue.length;
  for (let i = Math.min(cursor - 1, state.queue.length - 1); i >= 0; i -= 1) if (state.queue[i]?.status === "completed") return i;
  for (let i = state.queue.length - 1; i >= 0; i -= 1) if (state.queue[i]?.status === "completed") return i;
  return -1;
}

function latestHistoryLabel(exerciseKey) {
  if (!exerciseKey) return "NO HISTORY YET";
  const rows = history.filter((row) => row.exercise_key === exerciseKey && !row.is_warmup);
  if (!rows.length) return "NO HISTORY YET";
  const sessionId = rows[0].session_id;
  const latest = rows.filter((row) => row.session_id === sessionId).sort((a,b) => Number(a.set_index || 0) - Number(b.set_index || 0));
  if (!latest.length) return "NO HISTORY YET";
  const firstWeight = latest.find((row) => Number(row.weight_kg) > 0)?.weight_kg;
  const weight = firstWeight != null ? displayWeight(firstWeight) : null;
  const metric = latest[0].metric_type === "duration_seconds"
    ? latest.map((row) => row.duration_seconds).filter(Boolean).join(",") + " sec"
    : latest.map((row) => row.reps).filter(Boolean).join(",") + " reps";
  const directRir = latest.map((row) => row.rir).filter((value) => value != null);
  const rpe = latest.map((row) => row.rpe).filter((value) => value != null);
  const effort = directRir.length === latest.length ? ` · RIR ${directRir.map(Number).join("/")}` : rpe.length === latest.length ? ` · RPE ${rpe.map(Number).join("/")}` : "";
  return `${weight != null ? `${Number(weight.toFixed(1))} ${unitLabel()} × ` : ""}${metric}${effort}`;
}

function renderQueue() {
  const groups = new Map();
  state.queue.forEach((item, index) => {
    if (!groups.has(item.exerciseOrder)) groups.set(item.exerciseOrder, []);
    groups.get(item.exerciseOrder).push({ ...item, queueIndex:index });
  });
  const current = currentLiveSet(state);
  $("#exerciseQueue").innerHTML = [...groups.values()].map((items) => {
    const first = items[0];
    return `<section class="queue-group"><div class="queue-group-head"><strong>${escapeHtml(first.exerciseName)}</strong><span>${items.filter((x) => x.status === "completed").length}/${items.length}</span></div><div class="queue-set-row">${items.map((item) => `<span class="queue-set ${escapeHtml(item.status)}${current?.id === item.id ? " current" : ""}" title="Set ${item.setNumber}">${item.setNumber}</span>`).join("")}</div></section>`;
  }).join("");
}

function renderCurrent() {
  const progress = liveWorkoutProgress(state);
  $("#liveWorkoutTitle").textContent = state.workout.title;
  $("#liveWorkoutMeta").textContent = `${state.workout.exercises?.length || 0} exercises · ${state.workout.estimatedDurationMinutes || "—"} min planned`;
  $("#liveProgressBar").style.width = `${progress.percent}%`;
  $("#liveProgressText").textContent = `${progress.handled} / ${progress.total} SETS`;
  $("#liveSkippedText").textContent = progress.skipped ? `${progress.skipped} SKIPPED` : "";
  $("#queueCount").textContent = `${progress.pending} LEFT`;
  renderQueue();

  const item = currentLiveSet(state);
  if (!item) {
    $("#currentSetCard").classList.add("session-handled");
    openFinish();
    return;
  }
  $("#currentSetCard").classList.remove("session-handled");
  const exerciseSets = state.queue.filter((entry) => entry.exerciseOrder === item.exerciseOrder);
  $("#exercisePosition").textContent = `EXERCISE ${item.exerciseOrder} / ${state.workout.exercises.length}`;
  $("#setPosition").textContent = `SET ${item.setNumber} / ${exerciseSets.length}`;
  $("#exerciseGroup").textContent = (item.group || "strength").toUpperCase();
  $("#exerciseName").textContent = item.exerciseName;
  $("#targetPrescription").textContent = `${targetLabel(item)}${item.targetWeightKg != null ? ` @ ${Number(displayWeight(item.targetWeightKg).toFixed(1))} ${unitLabel()}` : ""}`;
  $("#targetRest").textContent = item.restSec ? fmtTime(item.restSec) : "—";
  $("#targetRir").textContent = item.targetRir == null ? "—" : `RIR ${item.targetRir}`;
  $("#lastTime strong").textContent = latestHistoryLabel(item.exerciseKey);
  $("#actualMetricLabel").childNodes[0].nodeValue = item.metricType === "duration_seconds" ? "SECONDS " : "REPS ";
  $("#actualMetric").max = item.metricType === "duration_seconds" ? "3600" : "500";
  $("#actualMetric").value = defaultMetric(item);
  $("#actualWeight").value = inputWeightFromKg(item.targetWeightKg);
  $("#actualRir").value = "";
  $("#actualRpe").value = "";
  $("#loadUnit").textContent = unitLabel();
  $("#editPrevious").hidden = previousCompletedIndex() < 0;
}

function renderAll() {
  if (!state) return;
  renderCurrent();
  updateClocks();
}

function collectActual(item, prefix = "actual") {
  const metricValue = Number($(prefix === "actual" ? "#actualMetric" : "#editMetric").value);
  const weight = $(prefix === "actual" ? "#actualWeight" : "#editWeight").value;
  const rir = $(prefix === "actual" ? "#actualRir" : "#editRir").value;
  const rpe = $(prefix === "actual" ? "#actualRpe" : "#editRpe").value;
  return {
    reps:item.metricType === "reps" ? metricValue : null,
    durationSeconds:item.metricType === "duration_seconds" ? metricValue : null,
    weightKg:inputWeightToKg(weight),
    rir:rir === "" ? null : Number(rir),
    rpe:rpe === "" ? null : Number(rpe),
  };
}

function showRestIfNeeded() {
  const remaining = liveRestRemainingSeconds(state);
  const overlay = $("#restOverlay");
  if (remaining <= 0 || !state.restEndsAt) { overlay.hidden = true; return; }
  const next = currentLiveSet(state);
  $("#restNextSet").textContent = next ? `Next: ${next.exerciseName} · set ${next.setNumber}` : "Session work complete.";
  overlay.hidden = false;
}

function updateClocks() {
  $("#elapsedTime").textContent = fmtTime(liveWorkoutElapsedSeconds(state));
  const remaining = liveRestRemainingSeconds(state);
  if (remaining > 0 && state.restEndsAt) {
    $("#restCountdown").textContent = fmtTime(remaining);
    showRestIfNeeded();
    return;
  }
  if (state.restEndsAt) {
    const source = state.restSourceSetId;
    saveState(skipLiveRest(state));
    $("#restOverlay").hidden = true;
    if (restAlertedFor !== source) {
      restAlertedFor = source;
      if (navigator.vibrate) navigator.vibrate([180,90,180]);
      document.title = "REST DONE · TrainSync AI";
      setTimeout(() => { document.title = "Workout · TrainSync AI"; }, 2500);
    }
  }
}

function openEditPrevious() {
  const index = previousCompletedIndex();
  if (index < 0) return;
  editingQueueIndex = index;
  const item = state.queue[index];
  $("#editTitle").textContent = `${item.exerciseName} · set ${item.setNumber}`;
  $("#editMetricLabel").childNodes[0].nodeValue = item.metricType === "duration_seconds" ? "SECONDS " : "REPS ";
  $("#editMetric").value = item.metricType === "duration_seconds" ? item.actual?.durationSeconds ?? "" : item.actual?.reps ?? "";
  $("#editWeight").value = inputWeightFromKg(item.actual?.weightKg);
  $("#editRir").value = item.actual?.rir ?? "";
  $("#editRpe").value = item.actual?.rpe ?? "";
  $("#editLoadUnit").textContent = unitLabel();
  $("#editOverlay").hidden = false;
}
function closeEdit() { editingQueueIndex = null; $("#editOverlay").hidden = true; }

function openFinish() {
  const progress = liveWorkoutProgress(state);
  if (!progress.completed) return showToast("Complete at least one set before finishing.");
  const remaining = progress.pending;
  $("#finishTitle").textContent = remaining ? "Finish early?" : "Workout complete";
  $("#finishSummary").textContent = remaining
    ? `${progress.completed} sets completed, ${progress.skipped} skipped, ${remaining} still unperformed. Missing planned work will remain missing; TrainSync will not pretend it was completed.`
    : `${progress.completed} sets completed${progress.skipped ? `, ${progress.skipped} skipped` : ""}. Save the actual session and update the program from real performance.`;
  $("#finishOverlay").hidden = false;
}
function closeFinish() { if (!state.finishedAt) $("#finishOverlay").hidden = true; }

async function saveFinishedWorkout() {
  const button = $("#finishSave");
  button.disabled = true;
  button.textContent = "SAVING…";
  try {
    if (!state.completionId) { state.completionId = createCompletionId(); saveState(state); }
    if (!state.finishedAt) saveState(finishLiveWorkoutState(state));
    const sets = completedActualSets(state);
    const args = {
      workoutDbId:state.workoutDbId,
      completionId:state.completionId,
      workout:state.workout,
      actualSets:sets,
      sets,
      startedAt:state.startedAt,
      completedAt:state.finishedAt,
      durationSeconds:liveWorkoutElapsedSeconds(state),
      notes:$("#finishNotes").value,
    };
    let result;
    if (state.workout.programSessionId) {
      if (!state.workoutDbId) throw new Error("PROGRAM_WORKOUT_NOT_MATERIALIZED");
      result = await completeProgramWorkout(args);
    } else {
      result = await completeWorkoutSession(args);
    }
    state.uploadState = "saved";
    saveState(state);
    const completedWorkout = { ...state.workout, status:"completed" };
    localStorage.setItem("trainsync:lastWorkout", JSON.stringify(completedWorkout));
    localStorage.removeItem(ACTIVE_KEY);
    clearLaunch();
    showToast(result?.adaptation?.status === "applied" ? "Saved. Next prescription adapted ✓" : "Workout saved ✓", true);
    setTimeout(() => { location.href = "/"; }, 650);
  } catch (error) {
    state.uploadState = "pending";
    saveState(state);
    $("#finishNetworkHint").textContent = `Not uploaded yet: ${error.message}. Your completed sets remain saved on this device. Press RETRY SAVE when the connection is available.`;
    button.textContent = "RETRY SAVE →";
    showToast("Session is safe on this device, but cloud save did not finish.");
  } finally {
    button.disabled = false;
    if (button.textContent === "SAVING…") button.textContent = "SAVE & FINISH →";
  }
}

async function initialize() {
  if (!currentUser()) { location.href = "/"; return; }
  profile = await getProfile().catch(() => null);
  history = await listSetResults(3000).catch(() => []);
  const launch = readJson(LAUNCH_KEY);
  const existing = readJson(ACTIVE_KEY);

  if (launch?.workout) {
    if (existing?.workout && !existing.finishedAt && !sameWorkout(existing.workout, launch.workout)) {
      const replace = window.confirm("A different live workout is already saved on this device. Start the new workout and replace the old live state?");
      state = replace ? createLiveWorkoutState({ workout:launch.workout, workoutDbId:launch.workoutDbId }) : existing;
    } else if (existing?.workout && sameWorkout(existing.workout, launch.workout)) state = existing;
    else state = createLiveWorkoutState({ workout:launch.workout, workoutDbId:launch.workoutDbId });
    saveState(state);
    clearLaunch();
  } else if (existing?.workout) state = existing;
  else { location.href = "/"; return; }

  renderAll();
  if (state.finishedAt && state.uploadState !== "saved") openFinish();
  else showRestIfNeeded();
}

$("#setForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const item = currentLiveSet(state);
  if (!item) return openFinish();
  try {
    saveState(completeCurrentLiveSet(state, collectActual(item)));
    renderAll();
    showRestIfNeeded();
  } catch (error) { showToast(error.message); }
});
$("#skipSet").addEventListener("click", () => {
  try { saveState(skipCurrentLiveSet(state)); renderAll(); }
  catch (error) { showToast(error.message); }
});
$("#finishEarly").addEventListener("click", openFinish);
$("#editPrevious").addEventListener("click", openEditPrevious);
$("#editClose").addEventListener("click", closeEdit);
$("#editOverlay").addEventListener("click", (event) => { if (event.target.id === "editOverlay") closeEdit(); });
$("#editForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (editingQueueIndex == null) return;
  try {
    const item = state.queue[editingQueueIndex];
    saveState(updateCompletedLiveSet(state, editingQueueIndex, collectActual(item, "edit")));
    closeEdit();
    renderAll();
    showToast("Set corrected ✓", true);
  } catch (error) { showToast(error.message); }
});
$("#skipRest").addEventListener("click", () => { saveState(skipLiveRest(state)); $("#restOverlay").hidden = true; renderAll(); });
$("#restPlus").addEventListener("click", () => { saveState(adjustLiveRest(state, 30)); updateClocks(); });
$("#restMinus").addEventListener("click", () => { saveState(adjustLiveRest(state, -30)); updateClocks(); });
$("#finishCancel").addEventListener("click", closeFinish);
$("#finishSave").addEventListener("click", saveFinishedWorkout);
$("#exitWorkout").addEventListener("click", () => {
  if (window.confirm("Leave the live screen? Your workout progress will stay saved on this device.")) location.href = "/";
});
window.addEventListener("online", () => { if (state?.finishedAt && state.uploadState === "pending") showToast("Connection restored. Tap RETRY SAVE to upload the completed session.", true); });
setInterval(updateClocks, 500);
initialize().catch((error) => { showToast(error.message || "Could not start workout."); setTimeout(() => { location.href = "/"; }, 1800); });
