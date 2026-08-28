import { currentUser, getProfile, listWorkouts, saveWorkout } from "./lib/supabase-client.js";
import { loadNextActiveProgramWorkout } from "./lib/train-program-bridge.js";
import { validateWorkout } from "./lib/workout.mjs";

const LAUNCH_KEY = "trainsync:live-workout-launch:v1";
const ACTIVE_KEY = "trainsync:live-workout:v1";
const button = document.querySelector("#startWorkoutButton");
const toast = document.querySelector("#toast");

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function show(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.className = "toast show";
  clearTimeout(show.timer);
  show.timer = setTimeout(() => { toast.className = "toast"; }, 3600);
}
function sameWorkout(a, b) {
  if (!a || !b) return false;
  if (a.programSessionId && b.programSessionId) return a.programSessionId === b.programSessionId;
  return Boolean(a.id && b.id && a.id === b.id && Number(a.revision || 1) === Number(b.revision || 1));
}
function sameProgramWorkout(row, workout) {
  return Boolean(workout?.programSessionId && row?.payload?.programSessionId === workout.programSessionId);
}
function sameFreeWorkout(row, workout) {
  return Boolean(workout?.id && row?.client_workout_id === workout.id && Number(row?.revision || 1) === Number(workout?.revision || 1));
}

async function resolveWorkoutDbId(workout) {
  const rows = await listWorkouts(80).catch(() => []);
  const existing = rows.find((row) => sameProgramWorkout(row, workout) || sameFreeWorkout(row, workout));
  if (existing?.id) return existing.id;

  if (workout.programSessionId) {
    const profile = await getProfile().catch(() => null);
    const result = await loadNextActiveProgramWorkout({ timezone:profile?.timezone || "Europe/Riga" });
    if (result?.workout?.programSessionId !== workout.programSessionId) throw new Error("PROGRAM_SESSION_NOT_CURRENT");
    return result.workoutDbId || null;
  }

  const saved = await saveWorkout(workout);
  return saved?.id || null;
}

async function launch() {
  if (!currentUser()) {
    document.querySelector("#accountButton")?.click();
    show("Sign in to start a live workout.");
    return;
  }
  const workout = readJson("trainsync:lastWorkout");
  if (!workout?.title) return show("No workout is loaded yet.");
  if (workout.status === "completed") return show("This workout is already completed.");
  const validation = validateWorkout(workout);
  if (!validation.valid) return show("This workout must pass validation before it can start.");

  const active = readJson(ACTIVE_KEY);
  if (active?.workout && !active.finishedAt && sameWorkout(active.workout, workout)) {
    location.href = "/workout";
    return;
  }

  button.disabled = true;
  button.textContent = "PREPARING…";
  try {
    const workoutDbId = await resolveWorkoutDbId(workout);
    localStorage.setItem(LAUNCH_KEY, JSON.stringify({ workout, workoutDbId, launchedAt:new Date().toISOString() }));
    location.href = "/workout";
  } catch (error) {
    show(error.message || "Could not prepare the workout.");
  } finally {
    button.disabled = false;
    button.innerHTML = "START WORKOUT <span>→</span>";
  }
}

function refreshResumeLabel() {
  if (!button) return;
  const active = readJson(ACTIVE_KEY);
  const current = readJson("trainsync:lastWorkout");
  if (active?.workout && current && sameWorkout(active.workout, current) && !active.finishedAt) button.innerHTML = "RESUME WORKOUT <span>→</span>";
}

button?.addEventListener("click", launch);
refreshResumeLabel();
