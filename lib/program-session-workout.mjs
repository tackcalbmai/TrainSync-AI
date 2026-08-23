import { canonicalizeExerciseSelection } from "./exercise-catalog.mjs";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function positiveInt(value) {
  const number = finite(value);
  return number != null && number > 0 ? Math.round(number) : null;
}
function boundedRir(value) {
  const number = finite(value);
  return number != null && number >= 0 && number <= 6 ? number : null;
}
function clone(value) { return JSON.parse(JSON.stringify(value ?? null)); }

function normalizeRange(minValue, maxValue, exactValue, { maxAllowed = 500 } = {}) {
  const exact = positiveInt(exactValue);
  let min = positiveInt(minValue);
  let max = positiveInt(maxValue);
  if (min == null && max == null && exact != null) min = max = exact;
  if (min == null) min = max;
  if (max == null) max = min;
  if (min == null || max == null || min > max || max > maxAllowed) return null;
  return { min, max, exact: exact != null && exact >= min && exact <= max ? exact : (min === max ? min : null) };
}

function normalizeProgramSet(set, canonicalExercise) {
  const metricType = canonicalExercise.setMetric === "duration_seconds" ? "duration_seconds" : "reps";
  const restSec = Math.max(0, Math.min(900, Math.round(finite(set?.restSec) ?? 0)));
  const targetRir = boundedRir(set?.targetRir);
  const weightKg = finite(set?.weightKg);
  const base = {
    index: positiveInt(set?.index) || 1,
    metricType,
    restSec,
    weightKg: weightKg != null && weightKg >= 0 ? weightKg : null,
    targetRir,
  };

  if (metricType === "duration_seconds") {
    const range = normalizeRange(set?.minDurationSeconds, set?.maxDurationSeconds, set?.targetDurationSeconds, { maxAllowed: 3600 });
    if (!range) throw new Error(`PROGRAM_DURATION_TARGET_INVALID:${canonicalExercise.exerciseKey}`);
    return {
      ...base,
      targetDurationSeconds: range.exact,
      minDurationSeconds: range.min,
      maxDurationSeconds: range.max,
      targetReps: null,
      minReps: null,
      maxReps: null,
    };
  }

  const range = normalizeRange(set?.minReps, set?.maxReps, set?.targetReps, { maxAllowed: 500 });
  if (!range) throw new Error(`PROGRAM_REP_TARGET_INVALID:${canonicalExercise.exerciseKey}`);
  return {
    ...base,
    targetReps: range.exact,
    minReps: range.min,
    maxReps: range.max,
    targetDurationSeconds: null,
    minDurationSeconds: null,
    maxDurationSeconds: null,
  };
}

function canonicalExercise(programExercise, exerciseIndex) {
  const canonical = canonicalizeExerciseSelection(programExercise || {});
  if (!canonical) {
    const label = programExercise?.exerciseKey || programExercise?.name || `exercise_${exerciseIndex + 1}`;
    throw new Error(`PROGRAM_EXERCISE_NOT_IN_CATALOG:${label}`);
  }
  const sets = (Array.isArray(programExercise?.sets) ? programExercise.sets : []).map((set, setIndex) =>
    normalizeProgramSet({ ...set, index: set?.index || setIndex + 1 }, canonical)
  );
  if (!sets.length) throw new Error(`PROGRAM_EXERCISE_HAS_NO_SETS:${canonical.exerciseKey}`);
  return {
    exerciseKey: canonical.exerciseKey,
    name: canonical.name,
    group: canonical.primaryMuscles.join(" + ") || canonical.role || "strength",
    role: programExercise?.role || null,
    notes: String(programExercise?.notes || "").trim(),
    garminExerciseKey: null,
    movementPattern: canonical.movementPattern,
    loadType: canonical.loadType,
    requiredEquipment: [...canonical.requiredEquipment],
    primaryMuscles: [...canonical.primaryMuscles],
    secondaryMuscles: [...canonical.secondaryMuscles],
    fatigueTags: [...canonical.fatigueTags],
    progressionMode: canonical.progressionMode,
    exerciseFamily: canonical.exerciseFamily,
    setMetric: canonical.setMetric,
    supersetGroup: programExercise?.supersetGroup || null,
    progressionNote: String(programExercise?.progressionNote || "").trim() || null,
    sets,
  };
}

export function selectNextProgramSession(sessions = [], todayIso) {
  const today = String(todayIso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("TODAY_ISO_REQUIRED");
  return [...(Array.isArray(sessions) ? sessions : [])]
    .filter((session) => ["planned", "generated"].includes(String(session?.status || "")))
    .filter((session) => /^\d{4}-\d{2}-\d{2}$/.test(String(session?.scheduled_date || "")))
    .filter((session) => String(session.scheduled_date) >= today)
    .sort((a, b) => String(a.scheduled_date).localeCompare(String(b.scheduled_date)) || Number(a.week_index || 0) - Number(b.week_index || 0) || Number(a.day_index || 0) - Number(b.day_index || 0) || Number(a.slot_index || 0) - Number(b.slot_index || 0))[0] || null;
}

export function localIsoDate(timeZone = "UTC", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function programSessionToWorkout({ program, programSession, timezone = "UTC" } = {}) {
  if (!program?.id || !programSession?.id) throw new Error("PROGRAM_SESSION_CONTEXT_REQUIRED");
  if (programSession.program_id !== program.id) throw new Error("PROGRAM_SESSION_PROGRAM_MISMATCH");
  const revision = positiveInt(programSession.revision) || 1;
  const exercises = (Array.isArray(programSession.payload?.exercises) ? programSession.payload.exercises : []).map(canonicalExercise);
  if (!exercises.length) throw new Error("PROGRAM_SESSION_EXERCISES_REQUIRED");
  const totalSets = exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const estimatedDurationMinutes = Math.max(1, Math.min(360, positiveInt(programSession.payload?.estimatedDurationMinutes) || positiveInt(program.default_session_minutes) || 50));
  const focus = String(programSession.payload?.focus || "").trim();
  return {
    id: `program:${programSession.id}`,
    revision,
    programId: program.id,
    programSessionId: programSession.id,
    title: programSession.title,
    sport: "strength",
    intensity: "program",
    source: "program",
    scheduledDate: programSession.scheduled_date,
    timezone: timezone || "UTC",
    estimatedDurationMinutes,
    totalSets,
    status: "validated",
    instructions: focus || "Follow the programmed set ranges, rest intervals and prescribed effort targets.",
    exercises,
    programContext: {
      goal: program.goal || null,
      weekIndex: programSession.week_index || null,
      dayIndex: programSession.day_index || null,
      slotIndex: programSession.slot_index || null,
      progressionStrategy: program.progression_strategy || null,
    },
    createdAt: new Date().toISOString(),
  };
}

export function actualSetPayloadFromWorkout(workout, actualSets = []) {
  if (!workout?.programSessionId) throw new Error("PROGRAM_SESSION_REQUIRED");
  return (Array.isArray(actualSets) ? actualSets : []).map((set) => ({
    exerciseKey: String(set.exerciseKey || "").trim(),
    exerciseName: String(set.exerciseName || "").trim(),
    exerciseOrder: positiveInt(set.exerciseOrder),
    setIndex: positiveInt(set.setIndex),
    reps: positiveInt(set.reps),
    durationSeconds: positiveInt(set.durationSeconds),
    weightKg: finite(set.weightKg),
    rpe: finite(set.rpe),
  }));
}
