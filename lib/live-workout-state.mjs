export const LIVE_WORKOUT_STATE_VERSION = 1;

function clone(value) { return JSON.parse(JSON.stringify(value ?? null)); }
function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function positiveInt(value) {
  const n = finite(value);
  return n != null && n > 0 ? Math.round(n) : null;
}
function bounded(value, min, max) {
  const n = finite(value);
  return n != null && n >= min && n <= max ? n : null;
}
function iso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("LIVE_WORKOUT_TIME_INVALID");
  return date.toISOString();
}
function metricType(set, exercise) {
  return String(set?.metricType ?? set?.metric_type ?? exercise?.setMetric ?? exercise?.set_metric ?? "reps") === "duration_seconds"
    ? "duration_seconds"
    : "reps";
}

export function flattenWorkoutSets(workout) {
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  const queue = [];
  exercises.forEach((exercise, exerciseIndex) => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
    sets.forEach((set, setIndex) => {
      const type = metricType(set, exercise);
      queue.push({
        id:`${exerciseIndex + 1}:${setIndex + 1}`,
        exerciseIndex,
        setIndex,
        exerciseOrder:exerciseIndex + 1,
        setNumber:setIndex + 1,
        exerciseKey:String(exercise?.exerciseKey || "").trim() || null,
        exerciseName:String(exercise?.name || `Exercise ${exerciseIndex + 1}`).trim(),
        group:String(exercise?.group || exercise?.role || "strength").trim(),
        metricType:type,
        targetReps:type === "reps" ? positiveInt(set?.targetReps) : null,
        targetMinReps:type === "reps" ? positiveInt(set?.minReps ?? set?.targetMinReps) : null,
        targetMaxReps:type === "reps" ? positiveInt(set?.maxReps ?? set?.targetMaxReps) : null,
        targetDurationSeconds:type === "duration_seconds" ? positiveInt(set?.targetDurationSeconds) : null,
        targetMinDurationSeconds:type === "duration_seconds" ? positiveInt(set?.minDurationSeconds ?? set?.targetMinDurationSeconds) : null,
        targetMaxDurationSeconds:type === "duration_seconds" ? positiveInt(set?.maxDurationSeconds ?? set?.targetMaxDurationSeconds) : null,
        targetWeightKg:finite(set?.weightKg),
        targetRir:bounded(set?.targetRir, 0, 6),
        restSec:Math.max(0, Math.min(900, Math.round(finite(set?.restSec) || 0))),
        isWarmup:Boolean(set?.isWarmup ?? set?.is_warmup),
        status:"pending",
        actual:null,
        completedAt:null,
      });
    });
  });
  return queue;
}

export function createLiveWorkoutState({ workout, workoutDbId = null, startedAt = new Date() } = {}) {
  if (!workout?.title) throw new Error("LIVE_WORKOUT_REQUIRED");
  const queue = flattenWorkoutSets(workout);
  if (!queue.length) throw new Error("LIVE_WORKOUT_SETS_REQUIRED");
  const started = iso(startedAt);
  return {
    version:LIVE_WORKOUT_STATE_VERSION,
    workout:clone(workout),
    workoutDbId:workoutDbId || null,
    startedAt:started,
    lastUpdatedAt:started,
    cursor:0,
    queue,
    restEndsAt:null,
    restStartedAt:null,
    restSourceSetId:null,
    finishedAt:null,
    uploadState:"local",
  };
}

function nextPendingIndex(queue, fromIndex = 0) {
  for (let i = Math.max(0, fromIndex); i < queue.length; i += 1) if (queue[i]?.status === "pending") return i;
  for (let i = 0; i < Math.max(0, fromIndex); i += 1) if (queue[i]?.status === "pending") return i;
  return -1;
}

export function currentLiveSet(state) {
  if (!state || !Array.isArray(state.queue)) return null;
  const index = Number.isInteger(state.cursor) ? state.cursor : 0;
  return state.queue[index]?.status === "pending" ? state.queue[index] : state.queue[nextPendingIndex(state.queue, index)] || null;
}

export function normalizeActualForLiveSet(item, actual = {}) {
  if (!item) throw new Error("LIVE_SET_REQUIRED");
  const weightKg = finite(actual.weightKg);
  if (weightKg != null && weightKg < 0) throw new Error("LIVE_SET_WEIGHT_INVALID");
  const rir = actual.rir === "" || actual.rir == null ? null : bounded(actual.rir, 0, 6);
  if (actual.rir !== "" && actual.rir != null && rir == null) throw new Error("LIVE_SET_RIR_INVALID");
  const rpe = actual.rpe === "" || actual.rpe == null ? null : bounded(actual.rpe, 1, 10);
  if (actual.rpe !== "" && actual.rpe != null && rpe == null) throw new Error("LIVE_SET_RPE_INVALID");

  if (item.metricType === "duration_seconds") {
    const durationSeconds = positiveInt(actual.durationSeconds);
    if (durationSeconds == null || durationSeconds > 3600) throw new Error("LIVE_SET_DURATION_REQUIRED");
    return { reps:null, durationSeconds, weightKg, rir, rpe };
  }
  const reps = positiveInt(actual.reps);
  if (reps == null || reps > 500) throw new Error("LIVE_SET_REPS_REQUIRED");
  return { reps, durationSeconds:null, weightKg, rir, rpe };
}

function advance(state, completedIndex, nowIso, { startRest = false } = {}) {
  const next = nextPendingIndex(state.queue, completedIndex + 1);
  state.cursor = next === -1 ? state.queue.length : next;
  const item = state.queue[completedIndex];
  if (startRest && next !== -1 && item.restSec > 0) {
    const startMs = Date.parse(nowIso);
    state.restStartedAt = nowIso;
    state.restEndsAt = new Date(startMs + item.restSec * 1000).toISOString();
    state.restSourceSetId = item.id;
  } else {
    state.restStartedAt = null;
    state.restEndsAt = null;
    state.restSourceSetId = null;
  }
  state.lastUpdatedAt = nowIso;
}

export function completeCurrentLiveSet(state, actual, now = new Date()) {
  const next = clone(state);
  const item = currentLiveSet(next);
  if (!item) throw new Error("LIVE_WORKOUT_NO_PENDING_SET");
  const index = next.queue.findIndex((entry) => entry.id === item.id);
  const nowIso = iso(now);
  next.queue[index].actual = normalizeActualForLiveSet(item, actual);
  next.queue[index].status = "completed";
  next.queue[index].completedAt = nowIso;
  advance(next, index, nowIso, { startRest:true });
  return next;
}

export function skipCurrentLiveSet(state, now = new Date()) {
  const next = clone(state);
  const item = currentLiveSet(next);
  if (!item) throw new Error("LIVE_WORKOUT_NO_PENDING_SET");
  const index = next.queue.findIndex((entry) => entry.id === item.id);
  const nowIso = iso(now);
  next.queue[index].status = "skipped";
  next.queue[index].actual = null;
  next.queue[index].completedAt = nowIso;
  advance(next, index, nowIso, { startRest:false });
  return next;
}

export function updateCompletedLiveSet(state, queueIndex, actual, now = new Date()) {
  const next = clone(state);
  const index = Number(queueIndex);
  const item = next.queue?.[index];
  if (!item || item.status !== "completed") throw new Error("LIVE_COMPLETED_SET_REQUIRED");
  next.queue[index].actual = normalizeActualForLiveSet(item, actual);
  next.lastUpdatedAt = iso(now);
  return next;
}

export function skipLiveRest(state, now = new Date()) {
  const next = clone(state);
  next.restStartedAt = null;
  next.restEndsAt = null;
  next.restSourceSetId = null;
  next.lastUpdatedAt = iso(now);
  return next;
}

export function adjustLiveRest(state, deltaSeconds, now = new Date()) {
  const next = clone(state);
  if (!next.restEndsAt) return next;
  const delta = Math.round(finite(deltaSeconds) || 0);
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const currentEnd = Date.parse(next.restEndsAt);
  const newEnd = Math.max(nowMs, currentEnd + delta * 1000);
  next.restEndsAt = new Date(newEnd).toISOString();
  next.lastUpdatedAt = iso(now);
  return next;
}

export function liveRestRemainingSeconds(state, now = new Date()) {
  if (!state?.restEndsAt) return 0;
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const endMs = Date.parse(state.restEndsAt);
  if (!Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.ceil((endMs - nowMs) / 1000));
}

export function liveWorkoutProgress(state) {
  const queue = Array.isArray(state?.queue) ? state.queue : [];
  const completed = queue.filter((item) => item.status === "completed").length;
  const skipped = queue.filter((item) => item.status === "skipped").length;
  const pending = queue.length - completed - skipped;
  return {
    total:queue.length,
    completed,
    skipped,
    pending,
    handled:completed + skipped,
    percent:queue.length ? Math.round(((completed + skipped) / queue.length) * 100) : 0,
  };
}

export function completedActualSets(state) {
  return (Array.isArray(state?.queue) ? state.queue : [])
    .filter((item) => item.status === "completed" && item.actual)
    .map((item) => ({
      exerciseName:item.exerciseName,
      exerciseKey:item.exerciseKey,
      exerciseOrder:item.exerciseOrder,
      setIndex:item.setNumber,
      metricType:item.metricType,
      targetReps:item.targetReps,
      targetMinReps:item.targetMinReps,
      targetMaxReps:item.targetMaxReps,
      targetDurationSeconds:item.targetDurationSeconds,
      targetMinDurationSeconds:item.targetMinDurationSeconds,
      targetMaxDurationSeconds:item.targetMaxDurationSeconds,
      targetWeightKg:item.targetWeightKg,
      targetRir:item.targetRir,
      reps:item.actual.reps,
      durationSeconds:item.actual.durationSeconds,
      weightKg:item.actual.weightKg,
      rir:item.actual.rir,
      rpe:item.actual.rpe,
      isWarmup:item.isWarmup,
    }));
}

export function finishLiveWorkoutState(state, now = new Date()) {
  const next = clone(state);
  const completed = completedActualSets(next);
  if (!completed.length) throw new Error("LIVE_WORKOUT_COMPLETED_SET_REQUIRED");
  next.finishedAt = iso(now);
  next.restStartedAt = null;
  next.restEndsAt = null;
  next.restSourceSetId = null;
  next.uploadState = "pending";
  next.lastUpdatedAt = next.finishedAt;
  return next;
}

export function liveWorkoutElapsedSeconds(state, now = new Date()) {
  const start = Date.parse(state?.startedAt || "");
  const end = Date.parse(state?.finishedAt || "") || (now instanceof Date ? now.getTime() : new Date(now).getTime());
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 1000));
}
