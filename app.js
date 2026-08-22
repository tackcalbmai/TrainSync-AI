import {
  currentUser,
  getSession,
  listWorkouts,
  savePublication,
  saveWorkout,
  signIn,
  signOut,
  signUp,
  updateWorkoutStatus,
} from "./lib/supabase-client.js";

const $ = (selector) => document.querySelector(selector);
const commandInput = $("#commandInput");
const generateButton = $("#generateButton");
const publishButton = $("#publishButton");
const processStrip = $("#processStrip");
const toast = $("#toast");
let currentWorkout = null;
let currentWorkoutDbId = null;
let deferredInstall = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
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

function renderWorkout(workout, validation = { valid: true, errors: [] }) {
  currentWorkout = workout;
  $("#workoutTitle").textContent = workout.title;
  $("#workoutDate").textContent = dateLabel(workout.scheduledDate);
  $("#workoutIntensity").textContent = workout.intensity.toUpperCase();
  $("#durationMetric").textContent = workout.estimatedDurationMinutes;
  $("#exerciseMetric").textContent = workout.exercises.length;
  $("#setMetric").textContent = workout.totalSets;
  const validationState = $("#validationState");
  validationState.className = `validation-state${validation.valid ? "" : " error"}`;
  validationState.innerHTML = validation.valid ? "<span>✓</span> WORKOUT VALID" : `<span>!</span> ${validation.errors.length} VALIDATION ERRORS`;
  publishButton.disabled = !validation.valid;
  $("#exerciseList").innerHTML = workout.exercises.map((item, index) => {
    const sets = item.sets.length;
    const reps = item.sets[0]?.targetReps ?? "—";
    const weight = item.sets[0]?.weightKg;
    const rest = item.sets[0]?.restSec ?? 0;
    const load = weight != null ? `${sets} × ${reps} @ ${weight} KG` : `${sets} × ${reps}`;
    return `<div class="exercise-item">
      <div class="exercise-index">${String(index + 1).padStart(2, "0")}</div>
      <div class="exercise-name"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.group)}</small></div>
      <div class="exercise-load"><strong>${escapeHtml(load)}</strong><small>${weight != null ? "SETS × REPS · LOAD" : "SETS × REPS"}</small></div>
      <div class="exercise-rest"><strong>${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, "0")}</strong><small>REST</small></div>
    </div>`;
  }).join("");
}

async function api(path, payload, { anonymous = false } = {}) {
  const session = getSession();
  const headers = { "Content-Type": "application/json" };
  if (!anonymous && session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const response = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || data.error || "Request failed"), { data });
  return data;
}

async function persistWorkout(workout) {
  if (!getSession()) return null;
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
  if (!demo && !getSession()) {
    showToast("Sign in to use AI workout generation.");
    openAuth("signin");
    return;
  }

  generateButton.disabled = true;
  processStrip.classList.add("active");
  const states = demo
    ? ["LOADING DEMO ENGINE…", "BUILDING SAMPLE WORKOUT…", "VALIDATING WORKOUT…"]
    : ["UNDERSTANDING YOUR REQUEST…", "AI PROGRAMMING SETS / REPS / REST…", "VALIDATING WORKOUT…"];
  let idx = 0;
  processStrip.textContent = states[idx];
  const pulse = setInterval(() => { idx = Math.min(idx + 1, states.length - 1); processStrip.textContent = states[idx]; }, 420);

  try {
    const result = await api("/api/generate", { intent, timezone: "Europe/Riga", demo }, { anonymous: demo });
    currentWorkoutDbId = null;
    renderWorkout(result.workout, result.validation);
    localStorage.setItem("trainsync:lastWorkout", JSON.stringify(result.workout));
    if (!demo) await persistWorkout(result.workout);
    processStrip.textContent = demo ? "DEMO WORKOUT READY ✓" : "AI WORKOUT READY ✓";
    showToast(demo ? "Demo loaded. Sign in to generate with AI." : `${result.workout.title} programmed by AI.`, true);
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
  const states = ["RESOLVING GARMIN EXERCISES…", "VALIDATING WORKOUT STEPS…", "PUBLISHING TO GARMIN CONNECT…"];
  for (const state of states) {
    processStrip.textContent = state;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  try {
    if (getSession() && !currentWorkoutDbId) await persistWorkout(currentWorkout);
    const result = await api("/api/publish", { workout: currentWorkout });
    currentWorkout = { ...currentWorkout, status: "published" };
    $("#lastPublish").textContent = "just now";
    processStrip.textContent = `PUBLISHED · ${result.providerResourceId}`;
    localStorage.setItem("trainsync:lastWorkout", JSON.stringify(currentWorkout));
    if (getSession() && currentWorkoutDbId) {
      await updateWorkoutStatus(currentWorkoutDbId, "published", currentWorkout);
      await savePublication({ workoutDbId: currentWorkoutDbId, workout: currentWorkout, result });
    }
    showToast("Published to Mock Garmin Connect ✓", true);
  } catch (error) {
    processStrip.textContent = "PUBLISH FAILED";
    showToast(error.message);
  } finally {
    publishButton.disabled = false;
    setTimeout(() => processStrip.classList.remove("active"), 1700);
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

function closeAuth() {
  $("#authModal").hidden = true;
  document.body.classList.remove("modal-open");
}

async function submitAuth(event) {
  event.preventDefault();
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const submit = $("#authSubmit");
  if (!email || password.length < 6) return showToast("Use a valid email and at least 6 characters.");
  submit.disabled = true;
  try {
    const result = $("#authModal").dataset.mode === "signup" ? await signUp(email, password) : await signIn(email, password);
    if (!result?.access_token) {
      showToast("Account created. Check your email if confirmation is required.", true);
      return;
    }
    setAuthUi();
    closeAuth();
    if (currentWorkout) await persistWorkout(currentWorkout);
    await refreshHistory();
    showToast("Cloud sync connected. AI generation unlocked ✓", true);
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
  }
}

async function accountAction() {
  if (!currentUser()) return openAuth("signin");
  await signOut();
  currentWorkoutDbId = null;
  setAuthUi();
  renderHistory([]);
  showToast("Signed out.");
}

function renderHistory(rows) {
  const list = $("#historyList");
  if (!rows?.length) {
    list.innerHTML = '<div class="history-empty">No synced workouts yet.</div>';
    return;
  }
  list.innerHTML = rows.slice(0, 5).map((row) => `<button class="history-item" data-db-id="${escapeHtml(row.id)}" data-client-id="${escapeHtml(row.client_workout_id)}">
    <span><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.scheduled_date || "Unscheduled")}</small></span>
    <em>${escapeHtml(row.status.toUpperCase())}</em>
  </button>`).join("");
  for (const button of list.querySelectorAll(".history-item")) {
    button.addEventListener("click", () => {
      const row = rows.find((item) => item.id === button.dataset.dbId);
      if (!row?.payload) return;
      currentWorkoutDbId = row.id;
      renderWorkout(row.payload);
      localStorage.setItem("trainsync:lastWorkout", JSON.stringify(row.payload));
      showToast("Workout loaded.", true);
    });
  }
}

async function refreshHistory() {
  if (!currentUser()) return renderHistory([]);
  try { renderHistory(await listWorkouts(10)); }
  catch (error) { showToast(`History: ${error.message}`); }
}

for (const chip of document.querySelectorAll("[data-command]")) chip.addEventListener("click", () => { commandInput.value = chip.dataset.command; commandInput.focus(); });
generateButton.addEventListener("click", () => buildWorkout());
publishButton.addEventListener("click", publishWorkout);
commandInput.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") buildWorkout(); });
$("#accountButton").addEventListener("click", accountAction);
$("#authClose").addEventListener("click", closeAuth);
$("#authForm").addEventListener("submit", submitAuth);
$("#authSwitch").addEventListener("click", () => openAuth($("#authModal").dataset.mode === "signup" ? "signin" : "signup"));
$("#authModal").addEventListener("click", (event) => { if (event.target.id === "authModal") closeAuth(); });

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault(); deferredInstall = event;
  const button = $("#installButton"); button.hidden = false;
  button.addEventListener("click", async () => { await deferredInstall.prompt(); deferredInstall = null; button.hidden = true; }, { once: true });
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

setAuthUi();
const stored = localStorage.getItem("trainsync:lastWorkout");
if (stored) {
  try { renderWorkout(JSON.parse(stored)); } catch { buildWorkout({ demo: true }); }
} else {
  buildWorkout({ demo: true });
}
refreshHistory();